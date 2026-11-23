"""Claude through the official Anthropic Python SDK (2.x).

Adaptive thinking (never budget_tokens), the stable system part marked for prompt caching,
structured output with a JSON schema, and retries when the service is busy inside one time limit.
No model is named in code: the model comes from the connection. A refused answer hides the feature.
"""

from __future__ import annotations

import base64
import random
import time

import anthropic

from apps.assistant.providers.base import AIFile, AIProvider, AIResult, AssistantUnavailable, SystemPart, parse_json

BUSY_RETRIES = 2


def make_sdk_client(*, api_key: str, timeout: float) -> anthropic.Anthropic:
    """Build the SDK client. Tests replace this function; they never reach the real API."""
    # Retries happen in generate(), so the whole answer stays inside the time limit.
    return anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=0)


def _file_block(item: AIFile) -> dict:
    if item.mime_type == "application/pdf":
        return {
            "type": "document",
            "source": {"type": "base64", "media_type": "application/pdf", "data": base64.standard_b64encode(item.data).decode()},
            "title": item.filename[:200],
        }
    if item.mime_type.startswith("image/"):
        return {"type": "image", "source": {"type": "base64", "media_type": item.mime_type, "data": base64.standard_b64encode(item.data).decode()}}
    return {"type": "text", "text": f"[File {item.filename}]\n{item.data.decode('utf-8', errors='replace')}"}


class AnthropicProvider(AIProvider):
    key = "anthropic"
    label = "Anthropic (Claude)"
    supports_files = True
    supports_json_schema = True

    def _request(self, *, system_parts, messages, json_schema, files, max_tokens, effort) -> dict:
        system = []
        for part in system_parts:
            block = {"type": "text", "text": part.text}
            if part.cache:
                block["cache_control"] = {"type": "ephemeral"}
            system.append(block)
        messages = [dict(message) for message in messages]
        if files and messages:
            first = messages[-1]
            text = first["content"] if isinstance(first["content"], str) else ""
            first["content"] = [_file_block(item) for item in files] + [{"type": "text", "text": text}]
        output_config = {"effort": effort}
        if json_schema:
            output_config["format"] = {"type": "json_schema", "schema": json_schema}
        return {
            "model": self.settings.model,
            "max_tokens": max_tokens,
            "system": system,
            "messages": messages,
            "thinking": {"type": "adaptive"},
            "output_config": output_config,
        }

    def generate(self, *, system_parts: list[SystemPart], messages: list[dict], json_schema=None, files=None, max_tokens=8000, timeout=None, effort="medium") -> AIResult:
        request = self._request(system_parts=system_parts, messages=messages, json_schema=json_schema, files=files, max_tokens=max_tokens, effort=effort)
        response = self._create(request, timeout or self.settings.timeout_seconds)
        stop_reason = getattr(response, "stop_reason", "")
        result = AIResult(model=getattr(response, "model", "") or self.settings.model, request_id=getattr(response, "_request_id", "") or "")
        usage = getattr(response, "usage", None)
        result.input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        result.output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        result.cache_read_tokens = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        result.cache_write_tokens = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
        if stop_reason == "refusal":
            raise _with_usage(AssistantUnavailable("refused", "The AI service declined to answer this request."), result)
        if stop_reason == "max_tokens":
            raise _with_usage(AssistantUnavailable("bad_output", "The answer was too long and was cut off."), result)
        result.text = next((block.text for block in response.content if getattr(block, "type", "") == "text"), "")
        if json_schema:
            try:
                result.data = parse_json(result.text)
            except AssistantUnavailable as exc:
                raise _with_usage(exc, result) from None
        return result

    def _create(self, request: dict, limit: float):
        deadline = time.monotonic() + limit
        attempt = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 1:
                raise AssistantUnavailable("timeout", "The AI service did not answer within the time limit.")
            try:
                client = make_sdk_client(api_key=self.settings.api_key, timeout=remaining)
                return client.messages.create(**request)
            except anthropic.APITimeoutError:
                raise AssistantUnavailable("timeout", "The AI service did not answer within the time limit.") from None
            except (anthropic.OverloadedError, anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as exc:
                attempt += 1
                wait = min(2**attempt + random.uniform(0, 0.5), 8)
                if attempt > BUSY_RETRIES or time.monotonic() + wait >= deadline - 1:
                    if isinstance(exc, anthropic.APIConnectionError):
                        raise AssistantUnavailable("unreachable", "The server could not reach the AI service.") from None
                    raise AssistantUnavailable("busy", "The AI service was busy or rate limited.") from None
                time.sleep(wait)
            except anthropic.AuthenticationError:
                raise AssistantUnavailable("key_refused", "The AI service refused the API key.") from None
            except anthropic.PermissionDeniedError:
                raise AssistantUnavailable("key_refused", f"This API key may not use {request['model']}.") from None
            except anthropic.APIStatusError as exc:
                raise AssistantUnavailable("bad_output", f"The AI service answered with HTTP {exc.status_code}.") from None
            except anthropic.AnthropicError:
                raise AssistantUnavailable("unreachable", "The AI service SDK reported an error.") from None

    def check(self) -> tuple[bool, str]:
        model = self.settings.model
        try:
            client = make_sdk_client(api_key=self.settings.api_key, timeout=self.settings.timeout_seconds)
            response = client.messages.create(
                model=model, max_tokens=256, output_config={"effort": "low"}, messages=[{"role": "user", "content": "Reply with the word ready."}]
            )
        except anthropic.AuthenticationError:
            return False, "The AI service refused the API key. Check it was copied in full."
        except anthropic.PermissionDeniedError:
            return False, f"This API key may not use {model}."
        except anthropic.NotFoundError:
            return False, f"The AI service does not know the model {model}."
        except anthropic.RateLimitError:
            return False, "The AI service says too many requests, or the account has no credit left."
        except anthropic.APITimeoutError:
            return False, "The AI service did not answer in time. Try again, or raise the time limit."
        except anthropic.APIConnectionError:
            return False, "The server could not reach the AI service. Check the server's internet access."
        except anthropic.APIStatusError as exc:
            return False, f"The AI service answered with HTTP {exc.status_code}."
        except Exception as exc:  # the report must never break
            return False, f"Unexpected error: {exc.__class__.__name__}."
        self.last_usage = getattr(response, "usage", None)
        self.last_model = getattr(response, "model", "") or model
        return True, f"Connected. {self.last_model} answered."


def _with_usage(exc: AssistantUnavailable, result: AIResult) -> AssistantUnavailable:
    """Tokens were spent even though the answer cannot be used; the gateway still records them."""
    exc.result = result
    return exc
