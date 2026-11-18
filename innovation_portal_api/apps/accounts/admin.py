from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from apps.accounts.models import Role, SocialAccount, SocialAuthState, User, UserRole
from apps.accounts.services import UserOnboardingService


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    ordering = ("email",)
    list_display = ("email", "first_name", "last_name", "is_active", "is_staff")
    search_fields = ("email", "first_name", "last_name")
    fieldsets = (
        (None, {"fields": ("email", "password")}),
        ("Personal info", {"fields": ("first_name", "last_name", "phone_number")}),
        ("Permissions", {"fields": ("is_active", "is_staff", "is_superuser", "groups", "user_permissions")}),
        ("Important dates", {"fields": ("last_login",)}),
    )
    add_fieldsets = (
        (
            None,
            {
                "classes": ("wide",),
                "fields": ("email", "first_name", "last_name", "password1", "password2", "is_staff", "is_active"),
            },
        ),
    )

    def save_model(self, request, obj, form, change):
        super().save_model(request, obj, form, change)
        if not change:
            UserOnboardingService.ensure_user_onboarding(
                obj,
                source="admin_user_create",
                default_role_codes=[],
                metadata={"created_by_admin": True, "admin_id": str(request.user.id)},
            )


admin.site.register(Role)
admin.site.register(UserRole)
admin.site.register(SocialAccount)
admin.site.register(SocialAuthState)
