"""R-59 part 1: all website content in one list (3.38)."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import ContentItem, LeadershipCard, Partner, Story
from apps.core.constants import RoleType
from apps.support.models import FAQ


class AllContentTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="r59-officer@example.com", password="StrongPass123", first_name="Kago", last_name="Tau")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.client = APIClient()
        self.client.force_authenticate(self.officer)
        ContentItem.objects.create(title="Cold chain winners", excerpt="x", status="published", author=self.officer, translations={"tn": {"title": "Bafenyi"}})
        ContentItem.objects.create(title="Draft notice", excerpt="x", status="draft", author=self.officer)
        Story.objects.create(person_name="Neo", business="Mopane snacks", status="published")
        LeadershipCard.objects.create(full_name="Minister", job_title="Minister of Trade", quote="Grow", is_official=True)
        Partner.objects.create(name="BIH")
        FAQ.objects.create(question="How do I enter?", answer="Press Enter.", translations={"tn": {"question": "Ke tsenela jang?"}})

    def get(self, **params):
        response = self.client.get("/api/content/all/", params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["data"]

    def test_list_filters_and_counts(self):
        everything = self.get()
        kinds = {row["type"] for row in everything["results"]}
        self.assertTrue({"news", "story", "quote", "partner", "faq"} <= kinds)
        self.assertEqual(everything["counts"]["news"], 2)
        news = {row["title"]: row for row in self.get(type="news")["results"]}
        self.assertEqual((news["Cold chain winners"]["has_setswana"], news["Cold chain winners"]["updated_by"]), (True, "Kago T."))
        self.assertEqual(self.get(status="draft", type="news")["count"], 1)
        quote = self.get(type="quote")["results"][0]
        self.assertEqual(quote["status"], "pending_approval")
        missing = {row["title"] for row in self.get(lang="tn_missing")["results"]}
        self.assertIn("Draft notice", missing)
        self.assertNotIn("How do I enter?", missing)
        self.assertNotIn("BIH", missing)  # partners have no Setswana
        self.assertEqual([row["title"] for row in self.get(search="mopane")["results"]], ["Neo, Mopane snacks"])
        self.assertEqual(self.client.get("/api/content/all/", {"type": "poem"}).status_code, 400)
        self.assertEqual(self.get(page_size=2)["page_size"], 2)

    def test_staff_only(self):
        innovator = User.objects.create_user(email="r59-inn@example.com", password="StrongPass123", first_name="N")
        RoleService.assign_roles(innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(innovator)
        self.assertEqual(self.client.get("/api/content/all/").status_code, 403)
