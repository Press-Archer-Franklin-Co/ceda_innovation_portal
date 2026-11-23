"""The one door to every AI service (Copilot A1).

``ask(feature, ...)`` checks the ai_helper switch, the feature's own switch and the monthly
limit, picks the route (service and model) for the feature in the keys in use (test or live),
calls the provider and writes a UsageRecord. Every feature goes through it; nothing else
imports an AI SDK. When anything is missing or fails, it raises ``AssistantUnavailable`` and
the caller hides the feature. Keys come only from connections saved in the staff console.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from decimal import Decimal

from django.core.cache import cache
from django.db.models import Sum
from django.utils import timezone

from apps.assistant.models import AssistantSettings, Feature, UsageRecord
from apps.assistant.providers import AIFile, AIProvider, AIResult, AssistantUnavailable, SystemPart, build_provider
from apps.audit.services import AuditService
from apps.platform_config.flags import is_enabled

logger = logging.getLogger("apps.assistant")

FLAG = "ai_helper"
AI_KIND = "ai"
# Features that run on a staff member's request while switched off for everyone else.
ADMIN_ONLY = {Feature.TRY_IT, Feature.CONNECTION_TEST}


@dataclass
class Route:
    connection_id: str
    connection_name: str
    provider_key: str
    environment: str
    provider: AIProvider
    prices: dict | None = None

    @property
    def model(self) -> str:
        return self.provider.settings.model


# -- money -------------------------------------------------------------------------------------


def prices_from(config: dict) -> dict | None:
    """The connection's prices per million tokens (US dollars), or None when input or output is not set.

    Prices are typed in the console on each AI connection; nothing is fixed in code. Cached input
    defaults to the input price when blank; cache writes are charged at the input price.
    """
    def number(key):
        value = (config or {}).get(key)
        if value in (None, ""):
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    price_in, price_out = number("price_input"), number("price_output")
    if price_in is None or price_out is None:
        return None
    cached = number("price_cached")
    return {"input": price_in, "output": price_out, "cache_read": price_in if cached is None else cached, "cache_write": price_in}


def cost_usd(prices: dict | None, *, input_tokens: int, output_tokens: int, cache_read: int, cache_write: int) -> Decimal | None:
    """Cost of one call, or None ("not set") when the connection has no prices. Never fails."""
    if prices is None:
        return None
    total = (
        input_tokens * prices["input"] + output_tokens * prices["output"] + cache_read * prices["cache_read"] + cache_write * prices["cache_write"]
    ) / 1_000_000
    return Decimal(str(round(total, 6)))


def month_start():
    now = timezone.localtime()
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def month_spend() -> Decimal:
    """Spend this month. Only priced calls count; calls without prices are not money we know."""
    total = UsageRecord.objects.filter(created_at__gte=month_start()).aggregate(total=Sum("cost_usd"))["total"]
    return total or Decimal("0")


# -- routes ------------------------------------------------------------------------------------


def _connections(environment: str):
    from apps.platform_config.models import IntegrationConnection

    rows = IntegrationConnection.objects.filter(kind=AI_KIND, is_active=True).order_by("activated_at", "created_at")
    return [row for row in rows if (row.config or {}).get("environment", "test") == environment]


def _route_for(connection, model: str = "") -> Route | None:
    from apps.platform_config.crypto import decrypt_secrets

    try:
        secrets = decrypt_secrets(connection.secrets_encrypted)
    except Exception:  # a key that cannot be read is the same as no key
        logger.warning("assistant.connection_unreadable connection=%s", connection.pk)
        return None
    config = connection.config or {}
    provider = build_provider(connection.provider, config=config, api_key=secrets.get("api_key", ""), model=model)
    if provider is None:
        return None
    return Route(str(connection.pk), connection.name, connection.provider, config.get("environment", "test"), provider, prices_from(config))


def resolve_route(feature: str, assistant_settings: AssistantSettings | None = None) -> Route | None:
    """The service for a feature now. The feature's chosen service and model in the keys in use,
    else the first active connection of that environment. None when nothing usable is set up."""
    assistant_settings = assistant_settings or AssistantSettings.load()
    environment = assistant_settings.keys_in_use
    connections = _connections(environment)
    if not connections:
        return None
    wanted = (assistant_settings.routes or {}).get(str(feature)) or {}
    candidates = []
    if wanted.get("connection"):
        candidates += [row for row in connections if str(row.pk) == str(wanted["connection"])]
    if wanted.get("provider"):
        candidates += [row for row in connections if row.provider == wanted["provider"]]
    for row in candidates:
        route = _route_for(row, model=wanted.get("model", ""))
        if route:
            return route
    for row in connections:
        route = _route_for(row)
        if route:
            return route
    return None


# -- availability ------------------------------------------------------------------------------


def unavailable_reason(feature: str, assistant_settings: AssistantSettings | None = None, *, check_route: bool = True) -> str:
    """'' when the feature can answer now, otherwise a short reason code. Never raises."""
    try:
        if not is_enabled(FLAG):
            return "switched_off"
        assistant_settings = assistant_settings or AssistantSettings.load()
        if feature not in ADMIN_ONLY and not assistant_settings.feature_on(feature):
            return "feature_off"
        limit = assistant_settings.monthly_limit_usd
        if limit is None or limit <= 0 or month_spend() >= limit:
            return "limit_reached"
        if check_route and resolve_route(feature, assistant_settings) is None:
            return "no_connection"
        return ""
    except Exception:  # a broken setting must never break a page
        logger.exception("assistant.availability_failed feature=%s", feature)
        return "no_connection"


def route_supports_files(feature: str) -> bool:
    route = resolve_route(feature)
    return bool(route and route.provider.supports_files)


# -- the call ----------------------------------------------------------------------------------


def ask(
    feature: str,
    *,
    user,
    system_parts: list[SystemPart],
    messages: list[dict],
    json_schema: dict | None = None,
    files: list[AIFile] | None = None,
    language: str = "en",
    max_tokens: int = 8000,
    effort: str = "medium",
    target: str = "",
) -> AIResult:
    """Ask the service routed for `feature`. Raises AssistantUnavailable; records every call."""
    assistant_settings = AssistantSettings.load()
    reason = unavailable_reason(feature, assistant_settings, check_route=False)
    route = None if reason else resolve_route(feature, assistant_settings)
    if not reason and route is None:
        reason = "no_connection"
    if reason:
        record(feature=feature, user=user, route=route, outcome=reason, target=target)
        if reason == "limit_reached":
            _warn_limit_once()
        raise AssistantUnavailable(reason)
    if files and not route.provider.supports_files:
        files = None
    started = time.monotonic()
    try:
        result = route.provider.generate(
            system_parts=system_parts, messages=messages, json_schema=json_schema, files=files, max_tokens=max_tokens, effort=effort
        )
    except AssistantUnavailable as exc:
        record(feature=feature, user=user, route=route, outcome=exc.reason, detail=exc.detail, started=started, result=getattr(exc, "result", None), target=target)
        logger.warning("assistant.call_failed feature=%s provider=%s outcome=%s", feature, route.provider_key, exc.reason)
        raise
    result.usage = record(feature=feature, user=user, route=route, outcome="ok", started=started, result=result, target=target)
    result.language = language
    return result


def record(*, feature, user, route: Route | None, outcome: str, detail: str = "", started=None, result: AIResult | None = None, target: str = "") -> UsageRecord:
    model = (result.model if result and result.model else "") or (route.model if route else "")
    tokens = dict(
        input_tokens=result.input_tokens if result else 0,
        output_tokens=result.output_tokens if result else 0,
        cache_read_tokens=result.cache_read_tokens if result else 0,
        cache_write_tokens=result.cache_write_tokens if result else 0,
    )
    usage = UsageRecord.objects.create(
        feature=str(feature),
        user=user if getattr(user, "is_authenticated", False) else None,
        model=model,
        provider=route.provider_key if route else "",
        connection_id=(route.connection_id or None) if route else None,
        environment=route.environment if route else "",
        ok=outcome == "ok",
        outcome=outcome,
        error_detail=(detail or "")[:300],
        cost_usd=cost_usd(route.prices if route else None, input_tokens=tokens["input_tokens"], output_tokens=tokens["output_tokens"], cache_read=tokens["cache_read_tokens"], cache_write=tokens["cache_write_tokens"]),
        duration_ms=int((time.monotonic() - started) * 1000) if started else 0,
        request_id=(result.request_id if result else "")[:80],
        **tokens,
    )
    AuditService.log_raw_action(
        actor=usage.user,
        action_type="assistant_call",
        target_model="UsageRecord",
        target_id=str(usage.pk),
        metadata={"feature": str(feature), "provider": usage.provider, "model": usage.model, "outcome": outcome, "cost_usd": "not set" if usage.cost_usd is None else str(usage.cost_usd), "target": target},
    )
    return usage


def mark(usage: UsageRecord, outcome: str, detail: str = "") -> None:
    """A call that answered, but whose answer could not be used (for example it contained a score)."""
    UsageRecord.objects.filter(pk=usage.pk).update(ok=False, outcome=outcome, error_detail=detail[:300])


def _warn_limit_once() -> None:
    if cache.add(f"assistant:limit-warned:{month_start():%Y-%m}", True, 24 * 3600):
        logger.warning("assistant.monthly_limit_reached spend=%s", month_spend())


# -- connection test (Platform settings > Integrations) --------------------------------------------


def check_connection(*, provider_key: str, config: dict, api_key: str) -> tuple[bool, str]:
    """The Integrations "Test" button: one tiny request with the typed settings."""
    provider = build_provider(provider_key, config=config, api_key=api_key)
    if provider is None:
        return False, "Fill in the key and the model first."
    ok, detail = provider.check()
    if ok:
        usage = getattr(provider, "last_usage", None)
        result = AIResult(model=getattr(provider, "last_model", "") or provider.settings.model)
        result.input_tokens = int(getattr(usage, "input_tokens", getattr(usage, "prompt_tokens", 0)) or 0)
        result.output_tokens = int(getattr(usage, "output_tokens", getattr(usage, "completion_tokens", 0)) or 0)
        route = Route("", "", provider_key, config.get("environment", "test"), provider, prices_from(config))
        record(feature=Feature.CONNECTION_TEST, user=None, route=route, outcome="ok", result=result)
    return ok, detail
