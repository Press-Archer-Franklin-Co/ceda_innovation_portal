from django.apps import AppConfig
import logging

logger = logging.getLogger(__name__)


class AccountsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.accounts"

    def ready(self):
        from apps.accounts import signals  # noqa: F401  (clears the capability cache on role changes)
        from apps.accounts.identity_providers import IdentityProviderRegistry

        diagnostics = IdentityProviderRegistry.provider_diagnostics()
        enabled = [item["id"] for item in diagnostics if item["enabled"]]
        disabled = [item for item in diagnostics if not item["enabled"]]
        logger.info("Enabled social auth providers: %s", ", ".join(enabled) if enabled else "none")
        for item in disabled:
            logger.warning(
                "%s OAuth disabled: missing %s",
                item["name"],
                ", ".join(item["missing_config_keys"]),
            )
