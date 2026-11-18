from django.test import TestCase
from unittest.mock import patch

from apps.accounts.models import User
from apps.accounts.services import RoleService, UserOnboardingService
from apps.communications.models import NotificationPreference
from apps.core.constants import RoleType
from apps.profiles.models import InnovatorProfile


class UserOnboardingServiceTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()

    def test_ensure_user_onboarding_is_idempotent(self):
        user = User.objects.create_user(
            email="idempotent@example.com",
            password="StrongPass123!",
            first_name="Idempotent",
            last_name="User",
        )

        UserOnboardingService.ensure_user_onboarding(
            user,
            source="test",
            default_role_codes=[RoleType.INNOVATOR],
            mark_email_verified=False,
        )
        UserOnboardingService.ensure_user_onboarding(
            user,
            source="test_repeat",
            default_role_codes=[RoleType.INNOVATOR],
            mark_email_verified=False,
        )

        self.assertEqual(InnovatorProfile.objects.filter(user=user).count(), 1)
        self.assertEqual(NotificationPreference.objects.filter(user=user).count(), 1)
        self.assertEqual(user.user_roles.filter(role__code=RoleType.INNOVATOR, is_active=True).count(), 1)


class RoleServiceTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.user = User.objects.create_user(
            email="staff@example.com",
            password="StrongPass123!",
            first_name="Staff",
            last_name="User",
        )
        RoleService.assign_roles(self.user, [RoleType.INNOVATION_OFFICER])
        self.user.is_staff = True
        self.user.save(update_fields=["is_staff", "updated_at"])

    @patch("apps.accounts.services.EmailNotificationService.send_role_change_email")
    def test_set_roles_does_not_notify_when_roles_are_unchanged(self, send_role_change_email):
        RoleService.set_roles(
            user=self.user,
            role_codes=[RoleType.INNOVATION_OFFICER],
            actor=self.user,
            reason="social_login",
        )

        send_role_change_email.assert_not_called()
        self.assertEqual(
            set(self.user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)),
            {RoleType.INNOVATION_OFFICER},
        )

    @patch("apps.accounts.services.EmailNotificationService.send_role_change_email")
    def test_set_roles_notifies_when_role_is_added_or_removed(self, send_role_change_email):
        RoleService.set_roles(
            user=self.user,
            role_codes=[RoleType.ADMINISTRATOR],
            actor=self.user,
            reason="admin_role_update",
        )

        send_role_change_email.assert_called_once_with(
            user=self.user,
            roles=[RoleType.ADMINISTRATOR],
            actor=self.user,
            added_roles=[RoleType.ADMINISTRATOR],
            removed_roles=[RoleType.INNOVATION_OFFICER],
        )

    @patch("apps.accounts.services.EmailNotificationService.send_role_change_email")
    def test_set_roles_accepts_specialist_as_local_role(self, send_role_change_email):
        RoleService.set_roles(
            user=self.user,
            role_codes=[RoleType.SPECIALIST, RoleType.INNOVATOR],
            actor=self.user,
            reason="admin_role_update",
        )

        self.user.refresh_from_db()
        self.assertTrue(self.user.is_staff)
        self.assertEqual(
            set(self.user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)),
            {RoleType.SPECIALIST, RoleType.INNOVATOR},
        )
        send_role_change_email.assert_called_once()
