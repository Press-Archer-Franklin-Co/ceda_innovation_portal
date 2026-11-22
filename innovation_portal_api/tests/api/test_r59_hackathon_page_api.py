"""R-59 part 2: the live hackathon page (3.36): draft, approval, active page and live updates."""

from datetime import timedelta

from django.core.cache import cache
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import HackathonDetail, Partner
from apps.core.constants import RoleType
from tests.api.test_challenges_b5_api import B5TestCase, data


class HackathonPageTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.manager = User.objects.create_user(email="r59-manager@example.com", password="StrongPass123", first_name="Lesedi", last_name="M")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.program = self.challenge("Agri hack", opens_in=-30, closes_in=-2)
        self.program.event_date = timezone.now() + timedelta(days=5)
        self.program.save(update_fields=["event_date"])
        self.detail = HackathonDetail.objects.create(program=self.program, theme="Food from the sun", is_published=True)
        self.sponsor = Partner.objects.create(name="BIH")
        self.client.force_authenticate(self.officer)

    def test_draft_approval_and_public_page(self):
        now = timezone.now()
        body = {
            "page_sections": [{"key": "banner", "enabled": True}, {"key": "schedule", "enabled": True}, {"key": "venue", "enabled": False}],
            "venue": {"name": "BIH", "address": "Gaborone", "map_url": "https://maps.example/bih"},
            "schedule_items": [
                {"starts_at": (now - timedelta(hours=1)).isoformat(), "title": {"en": "Opening", "tn": "Go bula"}},
                {"starts_at": (now + timedelta(hours=2)).isoformat(), "title": {"en": "Pitches"}},
            ],
            "prize_items": [{"place": "1st", "label": "Winner", "amount": "P50 000", "sponsor_partner_id": str(self.sponsor.id)}],
        }
        url = f"/api/content/hackathons/{self.detail.id}/page/"
        saved = data(self.client.put(url, body, format="json"))
        self.assertTrue(saved["has_draft"])
        self.assertEqual(saved["live"]["schedule_items"], [])  # nothing live yet
        self.assertEqual(len(saved["draft"]["schedule_items"]), 2)

        approval_id = data(self.client.post(f"{url}submit/"))["approval_id"]
        self.assertEqual(data(self.client.get(url))["pending_approval_id"], approval_id)
        self.client.force_authenticate(self.manager)
        approved = self.client.post(f"/api/content/approvals/{approval_id}/approve/", {}, format="json")
        self.assertEqual(approved.status_code, 200, approved.content)
        self.detail.refresh_from_db()
        self.assertEqual(self.detail.venue["name"], "BIH")
        self.assertEqual(self.detail.draft, {})

        cache.clear()
        public = data(self.client.get("/api/content/hackathons/active/", {"lang": "tn"}))["hackathon"]
        self.assertEqual(public["id"], str(self.detail.id))
        self.assertEqual([item["key"] for item in public["sections"]], ["banner", "schedule"])
        self.assertEqual([(item["title"], item["now"]) for item in public["schedule"]], [("Go bula", True), ("Pitches", False)])
        self.assertEqual(public["prizes"][0]["sponsor"]["name"], "BIH")

        for bad in ({"page_sections": [{"key": "games"}]}, {"schedule_items": [{"title": {"en": "No time"}}]}, {"prize_items": [{"place": "1st", "sponsor_partner_id": str(self.officer.id)}]}):
            self.client.force_authenticate(self.officer)
            self.assertEqual(self.client.put(url, bad, format="json").status_code, 400, bad)

    def test_live_updates_and_active(self):
        url = f"/api/content/hackathons/{self.detail.id}/updates/"
        made = self.client.post(url, {"body": {"en": "Lunch is served.", "tn": "Dijo di siametse."}}, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.client.force_authenticate(None)
        rows = data(self.client.get(url, {"lang": "tn"}))
        self.assertEqual(rows[0]["body"], "Dijo di siametse.")
        self.assertEqual(self.client.post(url, {"body": {"en": "x"}}, format="json").status_code // 100, 4)
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.delete(f"{url}{rows[0]['id']}/").status_code, 200)
        self.assertEqual(data(self.client.get(url)), [])

        self.program.event_date = timezone.now() + timedelta(days=60)
        self.program.save(update_fields=["event_date"])
        self.assertIsNone(data(self.client.get("/api/content/hackathons/active/"))["hackathon"])
