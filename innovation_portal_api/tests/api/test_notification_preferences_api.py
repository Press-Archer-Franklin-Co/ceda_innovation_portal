from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import NotificationPreference, NotificationTypePreference
from apps.core.constants import RoleType
from apps.notifications.selectors import NotificationPreferenceSelector

URL = "/api/notifications/preferences/"
TYPES = {"officer_message", "stage_change", "deadline", "new_challenge", "news", "digest"}


class NotificationPreferencesApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.user = User.objects.create_user(email="prefs@example.com", password="StrongPass123!", first_name="P", last_name="R")
        RoleService.assign_roles(self.user, [RoleType.INNOVATOR])
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def test_get_returns_every_type_with_defaults_from_old_preference(self):
        NotificationPreference.objects.create(user=self.user, email_enabled=False, sms_enabled=True, internal_enabled=True)
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200)
        data = response.json()["data"]
        self.assertEqual(set(data["preferences"]), TYPES)
        self.assertEqual(data["preferences"]["news"], {"web": True, "whatsapp": False, "sms": True, "email": False})
        self.assertEqual({item["code"] for item in data["channels"]}, {"web", "whatsapp", "sms", "email"})
        self.assertEqual({item["code"] for item in data["notification_types"]}, TYPES)

    def test_put_round_trip(self):
        payload = {
            "preferences": {
                "officer_message": {"web": True, "whatsapp": True, "sms": False, "email": True},
                "news": {"email": False},
            }
        }
        response = self.client.put(URL, payload, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        saved = response.json()["data"]["preferences"]
        self.assertEqual(saved["officer_message"], {"web": True, "whatsapp": True, "sms": False, "email": True})
        self.assertEqual(saved["news"], {"web": True, "whatsapp": False, "sms": False, "email": False})

        again = self.client.get(URL).json()["data"]["preferences"]
        self.assertEqual(again, saved)
        self.assertEqual(NotificationTypePreference.objects.filter(user=self.user).count(), 2)
        self.assertTrue(NotificationPreferenceSelector.is_enabled(self.user, "officer_message", "whatsapp"))
        self.assertFalse(NotificationPreferenceSelector.is_enabled(self.user, "news", "email"))
        self.assertTrue(AuditLog.objects.filter(action_type="notification_preferences_updated", target_id=str(self.user.id)).exists())

    def test_partial_update_keeps_other_channels(self):
        self.client.put(URL, {"preferences": {"deadline": {"sms": True}}}, format="json")
        self.client.put(URL, {"preferences": {"deadline": {"whatsapp": True}}}, format="json")
        deadline = self.client.get(URL).json()["data"]["preferences"]["deadline"]
        self.assertTrue(deadline["sms"])
        self.assertTrue(deadline["whatsapp"])

    def test_old_preference_fields_keep_working(self):
        legacy = NotificationPreference.objects.create(user=self.user)
        self.client.put(URL, {"preferences": {"news": {"email": False}}}, format="json")
        legacy.refresh_from_db()
        self.assertTrue(legacy.email_enabled)
        self.assertTrue(legacy.internal_enabled)

    def test_validation_errors(self):
        self.assertEqual(self.client.put(URL, {"preferences": {"unknown_type": {"web": True}}}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {"preferences": {"news": {"pigeon": True}}}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {"preferences": {"news": {"web": "maybe"}}}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {"preferences": {}}, format="json").status_code, 400)
        self.assertEqual(self.client.put(URL, {}, format="json").status_code, 400)
        self.assertFalse(NotificationTypePreference.objects.exists())

    def test_requires_login(self):
        client = APIClient()
        self.assertEqual(client.get(URL).status_code, 401)
        self.assertEqual(client.put(URL, {"preferences": {"news": {"web": False}}}, format="json").status_code, 401)

    def test_users_only_see_their_own(self):
        other = User.objects.create_user(email="other@example.com", password="StrongPass123!", first_name="O", last_name="T")
        self.client.put(URL, {"preferences": {"news": {"web": False}}}, format="json")
        self.client.force_authenticate(other)
        self.assertTrue(self.client.get(URL).json()["data"]["preferences"]["news"]["web"])
