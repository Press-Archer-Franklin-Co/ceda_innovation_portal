"""Live chat on Saturday and Sunday: saved, read back, and open at the right Gaborone time."""

from datetime import datetime
from zoneinfo import ZoneInfo

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.conversations.models import LiveChatSettings
from apps.conversations.services import is_open
from apps.core.constants import RoleType
from tests.api.test_challenges_b5_api import B5TestCase, data

GABORONE = ZoneInfo("Africa/Gaborone")
SATURDAY_10 = datetime(2026, 11, 28, 10, 0, tzinfo=GABORONE)  # a Saturday


class WeekendHoursTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.admin = User.objects.create_user(email="lc-weekend@example.com", password="StrongPass123", first_name="Lorato")
        RoleService.assign_roles(self.admin, [RoleType.ADMINISTRATOR])
        self.client.force_authenticate(self.admin)

    def test_saturday_and_sunday_persist_and_open(self):
        self.assertEqual(SATURDAY_10.weekday(), 5)
        current = data(self.client.get("/api/live-chat/settings/"))["hours"]
        self.assertEqual((current["sat"], current["sun"]), ([], []))
        # The screen sends the whole week, as it does on Save.
        week = {**current, "sat": [{"opens": "09:00", "closes": "13:00"}], "sun": [{"opens": "08:00", "closes": "16:30"}]}
        response = self.client.put("/api/live-chat/settings/", {"hours": week}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        again = data(self.client.get("/api/live-chat/settings/"))["hours"]
        self.assertEqual(again["sat"], [{"opens": "09:00", "closes": "13:00"}])
        self.assertEqual(again["sun"], [{"opens": "08:00", "closes": "16:30"}])
        self.assertEqual(again["mon"], current["mon"])  # other days untouched

        config = LiveChatSettings.load()
        self.assertTrue(is_open(config, SATURDAY_10))
        self.assertFalse(is_open(config, SATURDAY_10.replace(hour=13, minute=30)))
        self.assertTrue(is_open(config, datetime(2026, 11, 29, 9, 0, tzinfo=GABORONE)))  # Sunday
        # The help bubble sees the weekend hours too.
        bubble = data(self.client.get("/api/help-chat/status/"))
        self.assertEqual(bubble["hours"]["sat"], [{"opens": "09:00", "closes": "13:00"}])
