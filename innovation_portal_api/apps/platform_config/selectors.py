from __future__ import annotations

from django.conf import settings
from django.core.cache import cache

from apps.platform_config.crypto import decrypt_secrets
from apps.platform_config.flags import FLAG_DEFINITIONS, all_flags
from apps.platform_config.models import FeatureFlag, IntegrationConnection
from apps.platform_config.providers import get_provider_class

RUNTIME_CACHE_SECONDS = 30
SSO_BUTTON_LABEL = "Sign in with CEDA account"


def _runtime_cache_key(kind: str) -> str:
    return f"platform_config:active_connection:{kind}:v1"


class IntegrationRuntimeSelector:
    """Which connection the running system uses for each kind."""

    @staticmethod
    def active_connection(kind: str) -> IntegrationConnection | None:
        key = _runtime_cache_key(kind)
        cached = cache.get(key)
        if cached is not None:
            return cached or None
        connection = IntegrationConnection.objects.filter(kind=kind, is_active=True).first()
        cache.set(key, connection or False, RUNTIME_CACHE_SECONDS)
        return connection

    @staticmethod
    def clear_cache(kind: str | None = None) -> None:
        for item in [kind] if kind else IntegrationConnection.Kind.values:
            cache.delete(_runtime_cache_key(item))

    @staticmethod
    def provider_for(connection: IntegrationConnection, *, secrets: dict | None = None):
        provider_class = get_provider_class(connection.provider)
        if provider_class is None:
            return None
        return provider_class(
            connection,
            config=connection.config,
            secrets=secrets if secrets is not None else decrypt_secrets(connection.secrets_encrypted),
        )

    @staticmethod
    def active_provider(kind: str):
        connection = IntegrationRuntimeSelector.active_connection(kind)
        return IntegrationRuntimeSelector.provider_for(connection) if connection else None

    @staticmethod
    def staff_identity_provider():
        """A staff OIDC identity provider built from the active SSO connection, or None."""
        provider = IntegrationRuntimeSelector.active_provider(IntegrationConnection.Kind.SSO)
        if provider is None or not hasattr(provider, "runtime_settings"):
            return None
        from apps.accounts.identity_providers import ConfiguredStaffIdentityProvider

        return ConfiguredStaffIdentityProvider(provider.runtime_settings(), connection_id=provider.connection.id)

    @staticmethod
    def environment_configured(kind: str) -> bool:
        if kind == IntegrationConnection.Kind.SSO:
            from apps.accounts.identity_providers import CedaStaffIdentityProvider

            return not CedaStaffIdentityProvider().missing_config_keys()
        if kind == IntegrationConnection.Kind.SMS:
            return bool((getattr(settings, "MESSAGE_SENDERS", {}) or {}).get("sms"))
        return False

    @staticmethod
    def source(kind: str) -> str:
        """``database`` (a saved connection), ``environment`` (B1 env variables) or ``none``."""
        if IntegrationRuntimeSelector.active_connection(kind):
            return "database"
        if IntegrationRuntimeSelector.environment_configured(kind):
            return "environment"
        return "none"

    @staticmethod
    def status(kind: str) -> dict:
        connection = IntegrationRuntimeSelector.active_connection(kind)
        provider_class = get_provider_class(connection.provider) if connection else None
        return {
            "kind": kind,
            "source": IntegrationRuntimeSelector.source(kind),
            "connection": (
                {
                    "id": str(connection.id),
                    "name": connection.name,
                    "provider": connection.provider,
                    "provider_label": provider_class.label if provider_class else connection.provider,
                    "status": connection.status,
                    "last_tested_at": connection.last_tested_at,
                    "activated_at": connection.activated_at,
                }
                if connection
                else None
            ),
        }

    @staticmethod
    def has_working_sso_connection() -> bool:
        """An active SSO connection saved and tested in the console."""
        connection = IntegrationConnection.objects.filter(kind=IntegrationConnection.Kind.SSO, is_active=True).first()
        return bool(connection and connection.status == IntegrationConnection.Status.ACTIVE and connection.last_tested_at)


class FeatureFlagSelector:
    @staticmethod
    def all():
        return FeatureFlag.objects.select_related("updated_by").all()

    @staticmethod
    def public_config() -> dict:
        flags = all_flags()
        public_keys = set(FeatureFlag.objects.filter(is_public=True).values_list("key", flat=True)) or {
            definition.key for definition in FLAG_DEFINITIONS if definition.is_public
        }
        from apps.platform_config import service_status

        states = service_status.states()
        sso_active = bool(flags.get("staff_sso")) and IntegrationRuntimeSelector.source(IntegrationConnection.Kind.SSO) != "none"
        return {
            # U9: a feature whose service is not active stays hidden on the site, even when switched on.
            "features": {key: bool(flags.get(key)) and not service_status.needs_setup(key, states) for key in sorted(public_keys)},
            "sign_in": {
                "password": bool(flags.get("password_sign_in")),
                "code": bool(flags.get("code_sign_in")),
                "code_by_sms": bool(flags.get("code_sign_in")) and bool(flags.get("sms_messages")),
                "sso": {"active": sso_active, "provider": "ceda_staff", "label": SSO_BUTTON_LABEL},
                # U7: the one second step after phone or email ("code" or "password").
                "second_step": _second_step(),
            },
            # Copilot A7: which AI helper features are on at all (switch, feature, limit, a working
            # service), so the screens hide them without another call. Per person: /api/assistant/status/.
            "assistant": _assistant_features(),
            # U7: present only while both demo gates are on; never emails or passwords.
            **_demo_logins(),
        }


def _assistant_features() -> dict:
    """Cached like the feature switches (30 seconds): public-config is asked on every page."""
    from django.core.cache import cache

    cached = cache.get("assistant:public-features")
    if cached is not None:
        return cached
    try:
        from apps.assistant import gateway
        from apps.assistant.models import FEATURE_DEFAULTS, AssistantSettings

        settings_row = AssistantSettings.load()
        features = {key: gateway.unavailable_reason(key, settings_row) == "" for key in FEATURE_DEFAULTS}
        features["guide_for_guests"] = features["guide"] and settings_row.guests_can_use_guide
        cache.set("assistant:public-features", features, 30)
        return features
    except Exception:  # the public config must never fail because of the AI helper
        return {}


class IntegrationHistorySelector:
    @staticmethod
    def for_connection(connection: IntegrationConnection, limit: int = 20):
        from apps.audit.models import AuditLog

        return (
            AuditLog.objects.filter(target_model="IntegrationConnection", target_id=str(connection.id))
            .select_related("actor")
            .order_by("-created_at")[:limit]
        )


def _second_step() -> str:
    from apps.accounts.models import AuthPolicy

    return AuthPolicy.current().second_step


def _demo_logins() -> dict:
    from apps.accounts import demo_logins

    if not demo_logins.enabled():
        return {}
    return {"demo_logins": {"accounts": demo_logins.accounts()}}

