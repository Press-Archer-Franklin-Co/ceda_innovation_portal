"""Feature switches.

Use ``is_enabled("key")`` everywhere a feature can be switched off, and
``require_feature("key")`` in views: it raises a 404 with code ``feature_disabled``.

Values are cached for a short time (``FLAG_CACHE_SECONDS``) and the cache is cleared
whenever a flag is saved. Each web worker keeps its own cache, so another worker may
take up to that long to see a change.
"""

from __future__ import annotations

from dataclasses import dataclass

from django.core.cache import cache
from rest_framework import status
from rest_framework.exceptions import APIException
from rest_framework.permissions import BasePermission

FLAG_CACHE_KEY = "platform_config:feature_flags:v1"
FLAG_CACHE_SECONDS = 30


@dataclass(frozen=True)
class FlagDefinition:
    key: str
    label: str
    description: str
    group: str
    default: bool
    is_public: bool = False
    coming_soon: bool = False


# Code-side list. The seed migration keeps its own copy of these values; the defaults
# here are only used if a row is missing (for example a flag added in a later prompt).
FLAG_DEFINITIONS: tuple[FlagDefinition, ...] = (
    FlagDefinition("password_sign_in", "Email and password sign-in", "People can sign in and register with an email address and password.", "sign_in", True, is_public=True),
    FlagDefinition("code_sign_in", "Sign-in with a code", "People can sign in with a one-time code sent to their phone or email.", "sign_in", True, is_public=True),
    FlagDefinition("staff_sso", "CEDA staff single sign-on", "Staff can sign in with their CEDA account. Needs an active, tested SSO connection.", "sign_in", False, is_public=True),
    FlagDefinition("guest_quick_start", "2-minute guest start", "People can start an idea before creating an account.", "ideas", True, is_public=True),
    FlagDefinition(
        "quick_start_basics_only",
        "Send ideas with just the basics",
        "Quick-start ideas for General ideas can be sent with a title, name and phone. Officers see which answers are still missing. Switch off to ask for the full form before Send.",
        "ideas",
        True,
        is_public=True,
    ),
    FlagDefinition("similar_ideas", "Similar ideas", "Show similar ideas while someone writes theirs.", "ideas", True, is_public=True),
    FlagDefinition("public_search", "Website search", "Search box on the public website.", "website", True, is_public=True),
    FlagDefinition("subscriptions", "Email subscriptions", "Visitors can subscribe to news and new challenges.", "website", True, is_public=True),
    FlagDefinition("sms_messages", "SMS messages", "Send SMS, including sign-in codes. Needs an active SMS connection.", "messaging", False),
    FlagDefinition("whatsapp_messages", "WhatsApp messages", "Send WhatsApp messages.", "messaging", False, coming_soon=True),
    FlagDefinition("ussd", "USSD", "Let people use the portal from a USSD menu.", "messaging", False, coming_soon=True),
    FlagDefinition(
        "ai_helper",
        "AI helper",
        "Claude guides innovators, gives officers hints and answers questions about the portal. Needs an active, tested Claude connection.",
        "integrations",
        False,
        is_public=True,
    ),
    FlagDefinition("translation_suggestions", "Translation suggestions", "Suggest Setswana text for staff to review.", "integrations", False),
)
FLAG_DEFAULTS = {definition.key: definition.default for definition in FLAG_DEFINITIONS}


class FeatureDisabled(APIException):
    status_code = status.HTTP_404_NOT_FOUND
    default_code = "feature_disabled"
    default_detail = "This feature is switched off."

    def __init__(self, key: str):
        super().__init__(detail={"code": "feature_disabled", "feature": key, "detail": self.default_detail})


def _load_flags() -> dict[str, bool]:
    from apps.platform_config.models import FeatureFlag

    return dict(FeatureFlag.objects.values_list("key", "enabled"))


def all_flags() -> dict[str, bool]:
    flags = cache.get(FLAG_CACHE_KEY)
    if flags is None:
        flags = _load_flags()
        cache.set(FLAG_CACHE_KEY, flags, FLAG_CACHE_SECONDS)
    return {**FLAG_DEFAULTS, **flags}


def is_enabled(key: str) -> bool:
    return bool(all_flags().get(key, False))


def clear_flag_cache() -> None:
    cache.delete(FLAG_CACHE_KEY)


def require_feature(key: str) -> None:
    if not is_enabled(key):
        raise FeatureDisabled(key)


def feature_required(key: str) -> type[BasePermission]:
    """Permission class factory: ``permission_classes = [feature_required("code_sign_in")]``.

    Raises the 404 ``feature_disabled`` error instead of a 403.
    """

    class _FeatureEnabled(BasePermission):
        def has_permission(self, request, view):
            require_feature(key)
            return True

    _FeatureEnabled.__name__ = f"FeatureEnabled_{key}"
    return _FeatureEnabled
