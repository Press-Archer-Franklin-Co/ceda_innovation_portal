from django.apps import AppConfig


class PlatformConfigConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.platform_config"
    verbose_name = "Platform settings"

    def ready(self):
        from apps.platform_config import signals  # noqa: F401
