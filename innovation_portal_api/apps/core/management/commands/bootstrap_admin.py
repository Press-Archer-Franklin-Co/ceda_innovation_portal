from django.core.management.base import BaseCommand

from apps.accounts.models import User
from apps.accounts.services import RoleService, UserOnboardingService
from apps.core.constants import RoleType


class Command(BaseCommand):
    help = "Create or update the deployment admin account from environment variables."

    def handle(self, *args, **options):
        from django.conf import settings

        admin_email = getattr(settings, "ADMIN_EMAIL", "")
        admin_password = getattr(settings, "ADMIN_PASSWORD", "")
        admin_first_name = getattr(settings, "ADMIN_FIRST_NAME", "Portal")
        admin_last_name = getattr(settings, "ADMIN_LAST_NAME", "Admin")

        if not admin_email or not admin_password:
            self.stdout.write(self.style.WARNING("ADMIN_EMAIL or ADMIN_PASSWORD not set; skipping admin bootstrap."))
            return

        user, created = User.objects.get_or_create(
            email=admin_email,
            defaults={
                "first_name": admin_first_name,
                "last_name": admin_last_name,
                "is_staff": True,
                "is_superuser": True,
                "is_active": True,
                "email_verified": True,
                "primary_auth_method": User.PrimaryAuthMethod.PASSWORD,
            },
        )

        dirty_fields = []
        for field, value in (
            ("first_name", admin_first_name),
            ("last_name", admin_last_name),
            ("is_staff", True),
            ("is_superuser", True),
            ("is_active", True),
            ("email_verified", True),
            ("primary_auth_method", User.PrimaryAuthMethod.PASSWORD),
        ):
            if getattr(user, field) != value:
                setattr(user, field, value)
                dirty_fields.append(field)

        user.set_password(admin_password)
        dirty_fields.append("password")
        user.save(update_fields=dirty_fields)

        RoleService.ensure_default_roles()
        RoleService.assign_roles(user, [RoleType.ADMINISTRATOR, RoleType.INNOVATION_OFFICER])
        UserOnboardingService.initialize_user(
            user,
            role_codes=[],
            ensure_profile=True,
            mark_email_verified=True,
            audit_action="deployment_admin_bootstrap",
            audit_metadata={"created": created},
        )

        action = "Created" if created else "Updated"
        self.stdout.write(self.style.SUCCESS(f"{action} admin account: {admin_email}"))
