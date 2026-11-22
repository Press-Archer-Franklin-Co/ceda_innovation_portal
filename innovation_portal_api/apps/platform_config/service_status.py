"""U9 (3.26 and 3.27): each outside service's state, and which features need it.

A service is one integration kind (SMS, Email, WhatsApp, ...). Its state:
- active: a connection is switched on (or, for SSO and SMS, the server settings provide one);
- testing: a connection is saved but not switched on (draft, tested, failed or switched off);
- not_set_up: nothing saved.

A feature that needs a service shows "Needs setup" while the service is not active, and the
public config reports it as off, even when its switch is on.
"""

from __future__ import annotations

from apps.platform_config.models import FeatureFlag, IntegrationConnection

STATE_LABELS = {"not_set_up": "Not set up", "testing": "Testing", "active": "Active"}

SERVICE_TEXT = {
    "sms": "Codes and updates by text message",
    "email": "Codes, updates and newsletters",
    "whatsapp": "Submit and track ideas on WhatsApp",
    "ussd": "*number# menu for phones without data",
    "ai": '"Check my idea" and staff summaries',
    "sso": "CEDA staff sign in with their work account",
    "translation": "Suggested Setswana text for staff",
    "storage": "Where uploaded files are kept",
}

# Feature switch -> the service it cannot work without.
FEATURE_NEEDS = {
    "sms_messages": "sms",
    "whatsapp_messages": "whatsapp",
    "ussd": "ussd",
    "staff_sso": "sso",
    "translation_suggestions": "translation",
    "ai_helper": "ai",
    "subscriptions": "email",
}
# Features that work with any one of these services.
FEATURE_NEEDS_ANY = {"code_sign_in": ("sms", "whatsapp", "email")}


def needed_kinds(key: str) -> tuple[str, ...]:
    found = FEATURE_NEEDS_ANY.get(key) or ((FEATURE_NEEDS[key],) if key in FEATURE_NEEDS else ())
    return tuple(kind for kind in found if kind in kinds())


def _keys_for(kind: str) -> list[str]:
    return [key for key in [*FEATURE_NEEDS, *FEATURE_NEEDS_ANY] if kind in needed_kinds(key)]


def kinds() -> list[str]:
    return [value for value, _ in IntegrationConnection.Kind.choices]


def _label(kind: str) -> str:
    return dict(IntegrationConnection.Kind.choices).get(kind, kind)


def states() -> dict[str, str]:
    """{kind: state} for every kind, from one query."""
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    saved: dict[str, set] = {}
    for kind, is_active in IntegrationConnection.objects.values_list("kind", "is_active"):
        saved.setdefault(kind, set()).add(is_active)
    out = {}
    for kind in kinds():
        if True in saved.get(kind, set()) or IntegrationRuntimeSelector.environment_configured(kind):
            out[kind] = "active"
        elif kind in saved:
            out[kind] = "testing"
        else:
            out[kind] = "not_set_up"
    return out


def needs_setup(key: str, current: dict | None = None) -> bool:
    needed = needed_kinds(key)
    if not needed:
        return False
    current = current or states()
    return not any(current.get(kind) == "active" for kind in needed)


def feature_service(key: str, current: dict | None = None) -> dict | None:
    needed = needed_kinds(key)
    if not needed:
        return None
    current = current or states()
    kind = next((item for item in needed if current.get(item) == "active"), needed[0])
    state = current.get(kind, "not_set_up")
    return {"kind": kind, "label": _label(kind), "state": state, "state_label": STATE_LABELS[state]}


def features_for(kind: str, *, only_on: bool = False) -> list[dict]:
    rows = FeatureFlag.objects.filter(key__in=_keys_for(kind))
    if only_on:
        rows = rows.filter(enabled=True)
    return [{"key": row.key, "label": row.label, "enabled": row.enabled} for row in rows.order_by("ordering", "key")]


def _hidden_without(kind: str, current: dict) -> list[dict]:
    """Features that are on and would have no working service if ``kind`` stopped."""
    after = {**current, kind: "not_set_up"}
    return [{"key": item["key"], "label": item["label"]} for item in features_for(kind, only_on=True) if needs_setup(item["key"], after)]


def would_hide(connection: IntegrationConnection) -> list[dict]:
    """Features that are on and will hide if this connection is switched off."""
    if not connection.is_active:
        return []
    others = IntegrationConnection.objects.filter(kind=connection.kind, is_active=True).exclude(pk=connection.pk).exists()
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    if others or IntegrationRuntimeSelector.environment_configured(connection.kind):
        return []
    return _hidden_without(connection.kind, states())


def services() -> list[dict]:
    """One card per service (3.27)."""
    current = states()
    by_kind: dict[str, list] = {}
    for connection in IntegrationConnection.objects.order_by("-is_active", "-updated_at"):
        by_kind.setdefault(connection.kind, []).append(connection)
    out = []
    for kind in kinds():
        connections = by_kind.get(kind, [])
        main = connections[0] if connections else None
        features = features_for(kind)
        out.append(
            {
                "kind": kind,
                "label": _label(kind),
                "description": SERVICE_TEXT.get(kind, ""),
                "state": current[kind],
                "state_label": STATE_LABELS[current[kind]],
                "connection_id": str(main.id) if main else None,
                "provider": main.provider if main else None,
                "connections_count": len(connections),
                "features": features,
                # What switching off would hide, for the confirmation (3.27).
                "hides_when_off": _hidden_without(kind, current) if current[kind] == "active" else [],
            }
        )
    return out
