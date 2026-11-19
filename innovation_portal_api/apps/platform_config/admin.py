from django.contrib import admin

from apps.platform_config.models import FeatureFlag, IntegrationConnection


@admin.register(FeatureFlag)
class FeatureFlagAdmin(admin.ModelAdmin):
    list_display = ("key", "label", "group", "enabled", "is_public", "coming_soon", "updated_by", "updated_at")
    list_filter = ("group", "enabled")
    readonly_fields = ("key", "updated_by", "updated_at")

    def has_add_permission(self, request):
        return False


@admin.register(IntegrationConnection)
class IntegrationConnectionAdmin(admin.ModelAdmin):
    """Read-only view. Connections are managed in the staff console (secrets stay write-only)."""

    list_display = ("name", "kind", "provider", "status", "is_active", "last_tested_at", "updated_at")
    list_filter = ("kind", "status", "is_active")
    exclude = ("secrets_encrypted",)

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
