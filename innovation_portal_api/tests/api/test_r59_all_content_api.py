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


class AllContentR62Tests(TestCase):
    """R-62: policy pages, lang=tn_has, the scheduled status and ordering."""

    def setUp(self):
        from datetime import timedelta

        from django.utils import timezone

        cache.clear()
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="r62-officer@example.com", password="StrongPass123", first_name="Kago", last_name="Tau")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.client = APIClient()
        self.client.force_authenticate(self.officer)
        later = timezone.now() + timedelta(days=3)
        ContentItem.objects.create(title="Live post", excerpt="x", status="published", published_at=timezone.now(), translations={"tn": {"title": "Kgang"}})
        ContentItem.objects.create(title="Approved for Friday", excerpt="x", status="scheduled", publish_at=later)
        ContentItem.objects.create(title="Future dated post", excerpt="x", status="published", published_at=later)
        Story.objects.create(person_name="Lesedi", status="published", published_at=later)
        LeadershipCard.objects.create(full_name="Director", job_title="CEO", quote="Build", start_at=later)
        Partner.objects.create(name="Zebra Bank")

    def get(self, **params):
        response = self.client.get("/api/content/all/", params)
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["data"]

    def test_policy_pages(self):
        from apps.content.models import PolicyPage
        from apps.content.services import ApprovalService

        policies = {row["id"]: row for row in self.get(type="policy", page_size=50)["results"]}
        self.assertEqual(set(policies), {"about", "guidelines", "privacy", "terms_of_use", "terms_of_agreement"})
        self.assertEqual(self.get()["counts"]["policy"], 5)
        about = policies["about"]
        self.assertEqual(set(about), {"type", "id", "title", "has_setswana", "status", "updated_at", "updated_by", "pending_approval_id"})
        self.assertEqual(about["status"], "published")
        self.assertIsInstance(about["has_setswana"], bool)

        page = PolicyPage.objects.get(key="privacy")
        page.draft = {"title": page.title, "intro": page.intro, "sections": page.sections}
        page.draft_updated_by = self.officer
        page.save()
        approval = ApprovalService.create(page, actor=self.officer, summary="Privacy policy page text", payload={"kind": "policy"})
        row = {row["id"]: row for row in self.get(type="policy")["results"]}["privacy"]
        self.assertEqual((row["status"], row["pending_approval_id"], row["updated_by"]), ("pending_approval", str(approval.id), "Kago T."))

        PolicyPage.objects.filter(key="terms_of_use").update(published_at=None)
        self.assertEqual({row["id"]: row for row in self.get(type="policy")["results"]}["terms_of_use"]["status"], "draft")

    def test_has_setswana(self):
        has = self.get(lang="tn_has", page_size=50)["results"]
        self.assertIn("Live post", {row["title"] for row in has})
        self.assertTrue(all(row["has_setswana"] is True for row in has))
        self.assertNotIn("Zebra Bank", {row["title"] for row in has})  # partners have no Setswana
        self.assertEqual(self.client.get("/api/content/all/", {"lang": "tn_some"}).status_code, 400)

    def test_scheduled(self):
        scheduled = {(row["type"], row["title"]) for row in self.get(status="scheduled", page_size=50)["results"]}
        self.assertEqual(scheduled, {("news", "Approved for Friday"), ("news", "Future dated post"), ("story", "Lesedi"), ("quote", "Director, CEO")})
        published = {row["title"] for row in self.get(status="published", page_size=50)["results"]}
        self.assertIn("Live post", published)
        self.assertTrue(published.isdisjoint({"Approved for Friday", "Future dated post", "Lesedi", "Director, CEO"}))
        self.assertEqual(self.get(status="scheduled")["counts"]["news"], 2)

    def test_ordering(self):
        def titles(ordering=None):
            params = {"type": "news"} | ({"ordering": ordering} if ordering else {})
            return [row["title"] for row in self.get(**params)["results"]]

        self.assertEqual(titles("title"), ["Approved for Friday", "Future dated post", "Live post"])
        self.assertEqual(titles("-title"), ["Live post", "Future dated post", "Approved for Friday"])
        self.assertEqual(titles(), titles("-updated_at"))
        self.assertEqual(titles("updated_at"), list(reversed(titles("-updated_at"))))
        self.assertEqual(self.client.get("/api/content/all/", {"ordering": "colour"}).status_code, 400)
