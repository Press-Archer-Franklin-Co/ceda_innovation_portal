"""S1: record API refusals (401, 403, 429) without leaking anything (ceda-security section 5)."""

from __future__ import annotations

import ipaddress
import logging
import uuid

from django.db import transaction
from django.db.models import F

logger = logging.getLogger("security.authorization")

REFUSAL_STATUSES = {401, 403, 429}
CLIENT_HEADER = "HTTP_X_CEDA_CLIENT"


def _route_pattern(request) -> str:
    match = getattr(request, "resolver_match", None)
    route = getattr(match, "route", "") if match else ""
    return ("/" + route.lstrip("^").rstrip("$")) if route else "(unmatched)"


def _address(request) -> str | None:
    raw = request.META.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


def _error_code(response) -> str:
    data = getattr(response, "data", None)
    errors = data.get("errors") if isinstance(data, dict) else None
    code = errors.get("code") if isinstance(errors, dict) else None
    if isinstance(code, list):
        code = code[0] if code else ""
    return str(code or "")[:80]


def _client_build(request) -> str:
    value = request.META.get(CLIENT_HEADER, "")
    # admin@<sha>, public@<sha> or worker@<sha>; anything else is kept short and plain.
    return "".join(ch for ch in value if ch.isalnum() or ch in "@._-")[:80]


def record(request, response) -> None:
    from apps.audit.models import AuthorizationRefusal

    user = getattr(request, "user", None)
    user = user if getattr(user, "is_authenticated", False) else None
    key = {
        "route_pattern": _route_pattern(request)[:255],
        "method": request.method[:10],
        "status_code": response.status_code,
        "user": user,
        "client_address": _address(request),
        "client_build": _client_build(request),
    }
    correlation_id = request.META.get("HTTP_X_REQUEST_ID") or uuid.uuid4().hex
    try:
        with transaction.atomic():
            updated = AuthorizationRefusal.objects.filter(**key).update(count=F("count") + 1, error_code=_error_code(response))
            if not updated:
                AuthorizationRefusal.objects.create(**key, error_code=_error_code(response), user_agent=request.META.get("HTTP_USER_AGENT", "")[:255])
    except Exception:  # recording must never break the response
        logger.exception("Could not record a refusal")
    logger.info(
        "refused %s %s status=%s code=%s user=%s address=%s client=%s correlation=%s",
        key["method"],
        key["route_pattern"],
        key["status_code"],
        _error_code(response) or "-",
        user.pk if user else "anonymous",
        key["client_address"] or "-",
        key["client_build"] or "none",
        correlation_id,
    )


class RefusalRecordingMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        if response.status_code in REFUSAL_STATUSES and request.path.startswith("/api/"):
            record(request, response)
        return response
