"""Writes to the audit log. Entries are never changed or deleted through the API.

U9 (3.29): every entry also keeps a masked address, the device, and a readable item name.
Keys, passwords and tokens are never written in the clear: values under those names are replaced.
"""

from __future__ import annotations

import re

from apps.audit.models import ActivityLog, AuditLog

HIDDEN = "(hidden)"
# Names whose values are never stored. "key" on its own is a slug (feature or policy key), so it stays.
SECRET_NAME = re.compile(r"(^|_)(password|passcode|secret|token|api_key|apikey|private_key|access_key|auth_token)(_|$)|_key$", re.I)
SAFE_VALUES = {"set", "not set"}  # what integrations record for a key: whether it is set, never the key
SAFE_NAMES = {"key", "secrets_set", "secrets_changed", "secrets", "token_type", "role_key", "flag_key", "feature_key", "idempotency_key"}


def scrub(value, name: str = ""):
    """Returns ``value`` with every secret-looking field replaced by HIDDEN (recursively)."""
    if name and name not in SAFE_NAMES and SECRET_NAME.search(name) and isinstance(value, str) and value and value not in SAFE_VALUES:
        return HIDDEN
    if isinstance(value, dict):
        return {key: scrub(item, str(key)) for key, item in value.items()}
    if isinstance(value, list):
        return [scrub(item) for item in value]
    return value


def mask_ip(address: str) -> str:
    address = (address or "").strip()
    if not address:
        return ""
    if ":" in address and "." not in address:  # IPv6: keep the first two groups
        parts = address.split(":")
        return ":".join(parts[:2]) + ":x:x"
    parts = address.split(".")
    return ".".join(parts[:2] + ["x", "x"]) if len(parts) == 4 else ""


def _where() -> tuple[str, str]:
    try:
        from apps.accounts.sessions import _request, describe_device
    except Exception:  # pragma: no cover - accounts always installed
        return "", ""
    request = _request.get()
    if request is None:
        return "", ""
    forwarded = (request.META.get("HTTP_X_FORWARDED_FOR") or "").split(",")[0].strip()
    agent = request.META.get("HTTP_USER_AGENT", "")
    return mask_ip(forwarded or request.META.get("REMOTE_ADDR", "")), (describe_device(agent) if agent else "")[:120]


def item_label(target) -> str:
    if target is None:
        return ""
    for name in ("summary", "title", "full_name", "name", "question", "person_name", "reference", "email", "key"):
        value = getattr(target, name, None)
        if isinstance(value, dict):
            value = value.get("en")
        if value and isinstance(value, str):
            return value[:255]
    return ""


def _create(*, actor, action_type, target_model, target_id, before_state, after_state, metadata, label=""):
    ip_address, device = _where()
    return AuditLog.objects.create(
        actor=actor if getattr(actor, "pk", None) else None,
        action_type=action_type,
        target_model=target_model,
        target_id=target_id,
        before_state=scrub(before_state or {}),
        after_state=scrub(after_state or {}),
        metadata=scrub(metadata or {}),
        ip_address=ip_address,
        device=device,
        item_label=(label or "")[:255],
    )


class AuditService:
    @staticmethod
    def log_action(actor, action_type: str, target, before_state=None, after_state=None, metadata=None):
        return _create(
            actor=actor,
            action_type=action_type,
            target_model=target.__class__.__name__,
            target_id=str(target.pk),
            before_state=before_state,
            after_state=after_state,
            metadata=metadata,
            label=item_label(target),
        )

    @staticmethod
    def log_raw_action(*, actor, action_type: str, target_model: str, target_id: str, before_state=None, after_state=None, metadata=None, label: str = ""):
        return _create(
            actor=actor,
            action_type=action_type,
            target_model=target_model,
            target_id=target_id,
            before_state=before_state,
            after_state=after_state,
            metadata=metadata,
            label=label,
        )

    @staticmethod
    def log_activity(actor, action_type: str, description: str, submission=None):
        ActivityLog.objects.create(actor=actor, action_type=action_type, description=description, submission=submission)
