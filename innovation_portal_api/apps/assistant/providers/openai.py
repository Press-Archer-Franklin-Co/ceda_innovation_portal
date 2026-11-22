"""OpenAI through the official openai Python SDK (3.x), Chat Completions.

Structured output uses a strict JSON schema (`response_format` type json_schema). The stable
system part goes first in one system message, so OpenAI's automatic prefix caching can reuse it.
"""

from __future__ import annotations

import base64
import random
import time

import openai

from apps.assistant.providers.base import AIFile, AIProvider, AIResult, AssistantUnavailable, SystemPart, parse_json

BUSY_RETRIES = 2


def make_sdk_client(*, api_key: str, timeout: float, base_url: str = "") -> openai.OpenAI:
    """Build the SDK client. Tests replace this function; they never reach the real API."""
    kwargs = {"api_key": api_key, "timeout": timeout, "max_retries": 0}
    if base_url:
        kwargs["base_url"] = base_url
    return openai.OpenAI(**kwargs)


def _file_part(item: AIFile) -> dict:
    encoded = base64.standard_b64encode(item.data).decode()
    if item.mime_type.startswith("image/"):
        return {"type": "image_url", "image_url": {"url": f"data:{item.mime_type};base64,{encoded}"}}
    if item.mime_type == "application/pdf":
        return {"type": "file", "file": {"filename": item.filename[:200], "file_data": f"data:application/pdf;base64,{encoded}"}}
    return {"type": "text", "text": f"[File {item.filename}]\n{item.data.decode('utf-8', errors='replace')}"}


class OpenAIProvider(AIProvider):
    key = "openai"
    label = "OpenAI"
    supports_files = True
    supports_json_schema = True
    service_name = "OpenAI"
    # Newer OpenAI models take max_completion_tokens; most other servers only know max_tokens.
    token_parameter = "max_completion_tokens"

    def _client(self, timeout: float):
        return make_sdk_client(api_key=self.settings.api_key, timeout=timeout, base_url=self.settings.base_url)

    def _request(self, *, system_parts, messages, json_schema, files, max_tokens) -> dict:
        system_text = "\n\n".join(part.text for part in system_parts if part.text)
        chat = [{"role": "system", "content": system_text}] if system_text else []
        for index, message in enumerate(messages):
            content = message["content"]
            if files and self.supports_files and index == len(messages) - 1 and message["role"] == "user":
                content = [_file_part(item) for item in files] + [{"type": "text", "text": content if isinstance(content, str) else ""}]
            chat.append({"role": message["role"], "content": content})
        request = {"model": self.settings.model, "messages": chat, self.token_parameter: max_tokens}
        if json_schema:
            if self.supports_json_schema:
                request["response_format"] = {"type": "json_schema", "json_schema": {"name": "answer", "schema": json_schema, "strict": True}}
            else:
                request["response_format"] = {"type": "json_object"}
        return request

    def generate(self, *, system_parts: list[SystemPart], messages: list[dict], json_schema=None, files=None, max_tokens=8000, timeout=None, effort="medium") -> AIResult:
        request = self._request(system_parts=system_parts, messages=messages, json_schema=json_schema, files=files, max_tokens=max_tokens)
        completion = self._create(request, timeout or self.settings.timeout_seconds)
        usage = getattr(completion, "usage", None)
        details = getattr(usage, "prompt_tokens_details", None)
        cached = int(getattr(details, "cached_tokens", 0) or 0)
        prompt = int(getattr(usage, "prompt_tokens", 0) or 0)
        result = AIResult(
            model=getattr(completion, "model", "") or self.settings.model,
            input_tokens=max(prompt - cached, 0),
            output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
            cache_read_tokens=cached,
            request_id=getattr(completion, "_request_id", "") or getattr(completion, "id", "") or "",
        )
        choice = (getattr(completion, "choices", None) or [None])[0]
        message = getattr(choice, "message", None)
        if message is None:
            raise _with_usage(AssistantUnavailable("bad_output", f"{self.service_name} sent no answer."), result)
        if getattr(message, "refusal", None):
            raise _with_usage(AssistantUnavailable("refused", f"{self.service_name} declined to answer this request."), result)
        if getattr(choice, "finish_reason", "") == "length":
            raise _with_usage(AssistantUnavailable("bad_output", "The answer was too long and was cut off."), result)
        result.text = getattr(message, "content", "") or ""
        if json_schema:
            try:
                result.data = parse_json(result.text)
            except AssistantUnavailable as exc:
                raise _with_usage(exc, result) from None
        return result

    def _create(self, request: dict, limit: float):
        deadline = time.monotonic() + limit
        attempt = 0
        name = self.service_name
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 1:
                raise AssistantUnavailable("timeout", f"{name} did not answer within the time limit.")
            try:
                return self._client(remaining).chat.completions.create(**request)
            except openai.APITimeoutError:
                raise AssistantUnavailable("timeout", f"{name} did not answer within the time limit.") from None
            except (openai.RateLimitError, openai.InternalServerError, openai.APIConnectionError) as exc:
                attempt += 1
                wait = min(2**attempt + random.uniform(0, 0.5), 8)
                if attempt > BUSY_RETRIES or time.monotonic() + wait >= deadline - 1:
                    if isinstance(exc, openai.APIConnectionError):
                        raise AssistantUnavailable("unreachable", f"The server could not reach {name}.") from None
                    raise AssistantUnavailable("busy", f"{name} was busy or rate limited.") from None
                time.sleep(wait)
            except openai.AuthenticationError:
                raise AssistantUnavailable("key_refused", f"{name} refused the API key.") from None
            except openai.PermissionDeniedError:
                raise AssistantUnavailable("key_refused", f"This API key may not use {request['model']}.") from None
            except openai.APIStatusError as exc:
                raise AssistantUnavailable("bad_output", f"{name} answered with HTTP {exc.status_code}.") from None
            except openai.OpenAIError:
                raise AssistantUnavailable("unreachable", f"The {name} SDK reported an error.") from None

    def check(self) -> tuple[bool, str]:
        name, model = self.service_name, self.settings.model
        try:
            completion = self._client(self.settings.timeout_seconds).chat.completions.create(
                model=model, messages=[{"role": "user", "content": "Reply with the word ready."}], **{self.token_parameter: 64}
            )
        except openai.AuthenticationError:
            return False, f"{name} refused the API key. Check it was copied in full."
        except openai.PermissionDeniedError:
            return False, f"This API key may not use {model}."
        except openai.NotFoundError:
            return False, f"{name} does not know the model {model}, or the address is wrong."
        except openai.RateLimitError:
            return False, f"{name} says too many requests, or the account has no credit left."
        except openai.APITimeoutError:
            return False, f"{name} did not answer in time. Try again, or raise the time limit."
        except openai.APIConnectionError:
            return False, f"The server could not reach {name}. Check the address and the server's internet access."
        except openai.APIStatusError as exc:
            return False, f"{name} answered with HTTP {exc.status_code}."
        except Exception as exc:  # the report must never break
            return False, f"Unexpected error: {exc.__class__.__name__}."
        self.last_usage = getattr(completion, "usage", None)
        self.last_model = getattr(completion, "model", "") or model
        return True, f"Connected. {self.last_model} answered."


def _with_usage(exc: AssistantUnavailable, result: AIResult) -> AssistantUnavailable:
    exc.result = result
    return exc
