"""The one place that talks to Claude (C3).

Rules this module keeps:
- The key comes from the active `ai` connection (encrypted in the database), never from code.
- When the helper cannot answer (switch off, no connection, feature off, monthly limit reached,
  time limit passed, Claude refused or failed), callers get ``AssistantUnavailable`` and hide
  the helper. Nothing here raises anything else to a view.
- Admin guidance and the user manual go first in the system prompt and are marked for prompt
  caching, so repeated questions cost much less. Volatile text (the draft, the question) goes in
  the user message, after the cached part.
- Every call, and every call that was skipped, leaves a UsageRecord and an audit line saying who
  asked. The key and the text sent are never logged.
"""

from __future__ import annotations

import json
import logging
import random
import time
from dataclasses import dataclass, field
from decimal import Decimal

import anthropic
from django.conf import settings
from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone

from apps.assistant.models import Audience, Feature, KnowledgeEntry, ManualPage, UsageRecord
from apps.audit.services import AuditService
from apps.platform_config.flags import is_enabled
from apps.platform_config.providers.anthropic import DEFAULT_MODEL
from apps.platform_config.providers.base import scrub

logger = logging.getLogger("apps.assistant")

FLAG = "ai_helper"
AI_KIND = "ai"
OVERLOAD_RETRIES = 2
REFUSAL_FALLBACK_BETA = "server-side-fallback-2026-07-01"
# Haiku has no server-side refusal fallback.
MODELS_WITH_FALLBACK = {"claude-opus-5-5", "claude-sonnet-5-5"}

# Which connection switch turns each feature on. Try it and the connection test need none.
FEATURE_SWITCH = {
    Feature.DRAFT_CHECK: "feature_draft_check",
    Feature.HINTS: "feature_hints",
    Feature.RELATED: "feature_related",
    Feature.HELP: "feature_help",
    Feature.WEB_CHAT: "feature_web_chat",
}

BASE_PROMPT = """You are the AI helper of the CEDA Innovation Portal in Botswana. CEDA (Citizen Entrepreneurial Development Agency) collects ideas from innovators and its officers review them.

How you work:
- You make suggestions. People decide. You never score, approve, reject or rank an idea, and you never say whether an idea will be funded.
- Write plain, short sentences that a busy person can read on a phone. No jargon, no em dashes.
- Only use what you are given. If something is not in the text, say it is missing; do not guess.
- Never ask for or repeat personal details such as ID numbers, phone numbers, email addresses or bank details.
- Follow the guidance from CEDA below. It was written by CEDA staff and comes before your own habits."""


class AssistantUnavailable(Exception):
    """The helper has no answer. Callers hide it; `reason` is for logs and admins only."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


@dataclass
class Runtime:
    connection_id: str
    api_key: str
    model: str
    monthly_limit_usd: Decimal
    timeout_seconds: float
    switches: dict = field(default_factory=dict)
    allow_guests_help: bool = False

    def feature_on(self, feature: str) -> bool:
        switch = FEATURE_SWITCH.get(feature)
        return True if switch is None else bool(self.switches.get(switch, True))


@dataclass
class Answer:
    data: dict
    model: str
    usage: UsageRecord


def make_sdk_client(*, api_key: str, timeout: float) -> anthropic.Anthropic:
    """Build the SDK client. Tests replace this function; they never reach the real API."""
    # Retries are done by `_create` so the whole answer stays inside the time limit.
    return anthropic.Anthropic(api_key=api_key, timeout=timeout, max_retries=0)


def _price(model: str) -> dict:
    prices = getattr(settings, "ASSISTANT_MODEL_PRICES", {})
    return prices.get(model) or prices.get(DEFAULT_MODEL) or {"input": 0, "output": 0, "cache_write": 0, "cache_read": 0}


def cost_usd(model: str, *, input_tokens: int, output_tokens: int, cache_read: int, cache_write: int) -> Decimal:
    price = _price(model)
    total = (
        input_tokens * price["input"]
        + output_tokens * price["output"]
        + cache_read * price["cache_read"]
        + cache_write * price["cache_write"]
    ) / 1_000_000
    return Decimal(str(round(total, 6)))


def _month_start():
    now = timezone.localtime()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_spend() -> Decimal:
    total = UsageRecord.objects.filter(created_at__gte=_month_start()).aggregate(total=Sum("cost_usd"))["total"]
    return total or Decimal("0")


def system_blocks(*, audience: str, language: str, instructions: str, extra_guidance: str = "") -> list[dict]:
    """Stable first block (base rules, CEDA guidance, user manual), then the feature's instructions.

    Both are cached. The order and text are deterministic, so the same audience and language
    always produce the same bytes and the cache is reused.
    """
    audiences = [Audience.EVERYONE, audience] if audience != Audience.EVERYONE else [Audience.EVERYONE, Audience.INNOVATORS, Audience.OFFICERS]
    languages = ["any", language]
    entries = KnowledgeEntry.objects.filter(is_active=True, audience__in=audiences, language__in=languages).order_by("ordering", "created_at", "id")
    pages = (
        ManualPage.objects.filter(is_active=True, audience__in=audiences, language__in=languages)
        .prefetch_related("screenshots")
        .order_by("ordering", "created_at", "id")
    )
    guidance = "\n".join(f"- {entry.title}: {entry.text.strip()}" for entry in entries) or "- (none yet)"
    if extra_guidance.strip():
        guidance += f"\n- Draft guidance being tried: {extra_guidance.strip()}"
    manual_parts = []
    for page in pages:
        shots = "\n".join(
            f"  Screenshot {shot.id}: {(shot.caption or {}).get(language) or (shot.caption or {}).get('en') or 'no caption'}"
            for shot in sorted(page.screenshots.all(), key=lambda item: (item.ordering, item.created_at, str(item.id)))
        )
        manual_parts.append(
            f"### Page {page.id}: {page.title}\nPortal page: {page.portal_path or 'not given'}\n{page.text.strip()}" + (f"\n{shots}" if shots else "")
        )
    manual = "\n\n".join(manual_parts) or "(no manual pages yet)"
    stable = f"{BASE_PROMPT}\n\n## Guidance from CEDA\n{guidance}\n\n## User manual\n{manual}"
    language_line = "Write every answer in Setswana." if language == "tn" else "Write every answer in English."
    return [
        {"type": "text", "text": stable, "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": f"{instructions.strip()}\n\n{language_line}", "cache_control": {"type": "ephemeral"}},
    ]


class AssistantClient:
    # -- availability ---------------------------------------------------------------

    @staticmethod
    def runtime() -> Runtime | None:
        """The active AI connection with its key, or None. Never raises."""
        try:
            from apps.platform_config.selectors import IntegrationRuntimeSelector

            if not is_enabled(FLAG):
                return None
            provider = IntegrationRuntimeSelector.active_provider(AI_KIND)
            if provider is None or provider.key != "anthropic":
                return None
            api_key = (provider.secrets or {}).get("api_key") or ""
            if not api_key:
                return None
            config = provider.config
            return Runtime(
                connection_id=str(provider.connection.pk),
                api_key=api_key,
                model=config.get("model") or DEFAULT_MODEL,
                monthly_limit_usd=Decimal(str(config.get("monthly_limit_usd") or 0)),
                timeout_seconds=float(config.get("timeout_seconds") or 30),
                switches={key: config.get(key, True) for key in FEATURE_SWITCH.values()},
                allow_guests_help=bool(config.get("allow_guests_help", False)),
            )
        except Exception:  # a broken connection must never break a page
            logger.exception("assistant.runtime_failed")
            return None

    @staticmethod
    def unavailable_reason(feature: str, runtime: Runtime | None = None) -> str:
        """'' when the feature can answer now, otherwise a short reason code."""
        if not is_enabled(FLAG):
            return "switched_off"
        runtime = runtime or AssistantClient.runtime()
        if runtime is None:
            return "no_connection"
        if not runtime.feature_on(feature):
            return "feature_off"
        if runtime.monthly_limit_usd <= 0 or month_spend() >= runtime.monthly_limit_usd:
            return "limit_reached"
        return ""

    @staticmethod
    def status() -> dict:
        """What the screens need to show or hide each part. Never raises."""
        runtime = AssistantClient.runtime()
        features = {}
        for feature in FEATURE_SWITCH:
            try:
                features[feature.value] = AssistantClient.unavailable_reason(feature, runtime) == ""
            except Exception:
                features[feature.value] = False
        return {
            "available": any(features.values()),
            "features": features,
            "guests_can_ask": bool(runtime and runtime.allow_guests_help and features.get(Feature.HELP.value)),
        }

    # -- calls ------------------------------------------------------------------------

    @staticmethod
    def ask(
        *,
        feature: str,
        user,
        audience: str,
        language: str,
        instructions: str,
        content: str,
        schema: dict,
        effort: str = "medium",
        max_tokens: int = 8000,
        extra_guidance: str = "",
        target: str = "",
    ) -> Answer:
        """Ask Claude for a JSON answer that matches `schema`. Raises AssistantUnavailable."""
        runtime = AssistantClient.runtime()
        reason = AssistantClient.unavailable_reason(feature if feature != Feature.TRY_IT else Feature.HELP, runtime)
        if feature == Feature.TRY_IT and reason == "feature_off":
            reason = ""
        if reason:
            AssistantClient._record(feature=feature, user=user, model=runtime.model if runtime else "", outcome=reason, target=target)
            if reason == "limit_reached":
                AssistantClient._warn_limit_once()
            raise AssistantUnavailable(reason)

        request = {
            "model": runtime.model,
            "max_tokens": max_tokens,
            "system": system_blocks(audience=audience, language=language, instructions=instructions, extra_guidance=extra_guidance),
            "messages": [{"role": "user", "content": content}],
            "thinking": {"type": "adaptive"},
            "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": schema}},
        }
        started = time.monotonic()
        try:
            response = AssistantClient._create(runtime, request)
        except AssistantUnavailable as exc:
            AssistantClient._record(feature=feature, user=user, model=runtime.model, outcome=exc.reason, started=started, target=target)
            logger.warning("assistant.call_failed feature=%s outcome=%s", feature, exc.reason)
            raise

        model = getattr(response, "model", "") or runtime.model
        usage = AssistantClient._record(
            feature=feature,
            user=user,
            model=model,
            outcome="ok",
            started=started,
            usage=getattr(response, "usage", None),
            request_id=getattr(response, "_request_id", "") or "",
            target=target,
        )
        stop_reason = getattr(response, "stop_reason", "")
        if stop_reason == "refusal":
            AssistantClient._mark(usage, "refused")
            raise AssistantUnavailable("refused")
        if stop_reason == "max_tokens":
            AssistantClient._mark(usage, "too_long")
            raise AssistantUnavailable("too_long")
        text = next((block.text for block in response.content if getattr(block, "type", "") == "text"), "")
        try:
            data = json.loads(text)
        except (TypeError, ValueError):
            AssistantClient._mark(usage, "bad_answer")
            raise AssistantUnavailable("bad_answer")
        if not isinstance(data, dict):
            AssistantClient._mark(usage, "bad_answer")
            raise AssistantUnavailable("bad_answer")
        return Answer(data=data, model=model, usage=usage)

    @staticmethod
    def _create(runtime: Runtime, request: dict):
        """One answer within the time limit, retrying when Claude is busy. Raises AssistantUnavailable."""
        deadline = time.monotonic() + runtime.timeout_seconds
        attempt = 0
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 1:
                raise AssistantUnavailable("timeout")
            try:
                client = make_sdk_client(api_key=runtime.api_key, timeout=remaining)
                if request["model"] in MODELS_WITH_FALLBACK:
                    return client.beta.messages.create(betas=[REFUSAL_FALLBACK_BETA], fallbacks="default", **request)
                return client.messages.create(**request)
            except (anthropic.OverloadedError, anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as exc:
                if isinstance(exc, anthropic.APITimeoutError):
                    raise AssistantUnavailable("timeout") from None
                attempt += 1
                wait = min(2 ** attempt + random.uniform(0, 0.5), 8)
                if attempt > OVERLOAD_RETRIES or time.monotonic() + wait >= deadline - 1:
                    raise AssistantUnavailable("busy" if not isinstance(exc, anthropic.APIConnectionError) else "unreachable") from None
                time.sleep(wait)
            except anthropic.AuthenticationError:
                raise AssistantUnavailable("key_refused") from None
            except anthropic.PermissionDeniedError:
                raise AssistantUnavailable("key_not_allowed") from None
            except anthropic.APIStatusError as exc:
                raise AssistantUnavailable(f"http_{exc.status_code}") from None
            except anthropic.AnthropicError:
                raise AssistantUnavailable("error") from None

    @staticmethod
    def check_connection(*, config: dict, api_key: str) -> tuple[bool, str]:
        """The connection test: one tiny request. Returns (ok, plain message)."""
        model = config.get("model") or DEFAULT_MODEL
        started = time.monotonic()
        try:
            client = make_sdk_client(api_key=api_key, timeout=float(config.get("timeout_seconds") or 30))
            response = client.messages.create(
                model=model,
                max_tokens=256,
                output_config={"effort": "low"},
                messages=[{"role": "user", "content": "Reply with the word ready."}],
            )
        except anthropic.AuthenticationError:
            return False, "Claude refused the API key. Check it was copied in full."
        except anthropic.PermissionDeniedError:
            return False, f"This API key may not use {model}."
        except anthropic.NotFoundError:
            return False, f"Claude does not know the model {model}."
        except anthropic.RateLimitError:
            return False, "Anthropic says too many requests, or the account has no credit left."
        except anthropic.APITimeoutError:
            return False, "Claude did not answer in time. Try again, or raise the time limit."
        except anthropic.APIConnectionError:
            return False, "The server could not reach Claude. Check the server's internet access."
        except anthropic.APIStatusError as exc:
            return False, scrub(f"Claude answered with HTTP {exc.status_code}.", [api_key])
        except Exception as exc:  # the report must never break
            return False, scrub(f"Unexpected error: {exc.__class__.__name__}.", [api_key])
        AssistantClient._record(
            feature=Feature.CONNECTION_TEST,
            user=None,
            model=getattr(response, "model", "") or model,
            outcome="ok",
            started=started,
            usage=getattr(response, "usage", None),
            request_id=getattr(response, "_request_id", "") or "",
        )
        return True, f"Connected. {getattr(response, 'model', '') or model} answered."

    # -- records ---------------------------------------------------------------------

    @staticmethod
    def _record(*, feature, user, model, outcome, started=None, usage=None, request_id="", target="") -> UsageRecord:
        input_tokens = int(getattr(usage, "input_tokens", 0) or 0)
        output_tokens = int(getattr(usage, "output_tokens", 0) or 0)
        cache_read = int(getattr(usage, "cache_read_input_tokens", 0) or 0)
        cache_write = int(getattr(usage, "cache_creation_input_tokens", 0) or 0)
        record = UsageRecord.objects.create(
            feature=feature,
            user=user if getattr(user, "is_authenticated", False) else None,
            model=model or "",
            ok=outcome == "ok",
            outcome=outcome,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cache_read_tokens=cache_read,
            cache_write_tokens=cache_write,
            cost_usd=cost_usd(model, input_tokens=input_tokens, output_tokens=output_tokens, cache_read=cache_read, cache_write=cache_write),
            duration_ms=int((time.monotonic() - started) * 1000) if started else 0,
            request_id=request_id[:80],
        )
        AuditService.log_raw_action(
            actor=record.user,
            action_type="assistant_call",
            target_model="UsageRecord",
            target_id=str(record.pk),
            metadata={"feature": str(feature), "model": record.model, "outcome": outcome, "cost_usd": str(record.cost_usd), "target": target},
        )
        return record

    @staticmethod
    def _mark(record: UsageRecord, outcome: str) -> None:
        UsageRecord.objects.filter(pk=record.pk).update(ok=False, outcome=outcome)
        record.ok, record.outcome = False, outcome

    @staticmethod
    def _warn_limit_once() -> None:
        key = f"assistant:limit-warned:{_month_start():%Y-%m}"
        if cache.add(key, True, 24 * 3600):
            logger.warning("assistant.monthly_limit_reached spend=%s", month_spend())
