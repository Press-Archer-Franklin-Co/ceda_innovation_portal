"""B6 part 2: stories and consent, subscriptions, FAQs, search, leadership quotes, site settings."""

from datetime import timedelta

from django.core import mail
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import ApprovalRequest, ContentItem, LeadershipCard, PostBlast, Story, Subscriber
from apps.core.constants import ProgramStatus, ProgramTypeCode, RoleType
from apps.programs.models import Program, ProgramType
from apps.support.models import FAQ, FAQGroup, UnansweredQuestion


def data(response):
    return response.json()["data"]


class Part2TestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="p2-officer@example.com", password="StrongPass123", first_name="Kago", last_name="T")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="p2-manager@example.com", password="StrongPass123")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.innovator = User.objects.create_user(email="p2-innovator@example.com", password="StrongPass123", first_name="Neo", last_name="K")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])

    def as_officer(self):
        self.client.force_authenticate(self.officer)


class StoryTests(Part2TestCase):
    def make(self, name, **extra):
        self.as_officer()
        response = self.client.post("/api/content/stories/", {"person_name": name, "business": {"en": f"{name} Farms", "tn": f"Masimo a ga {name}"}, "quote": "We grew", **extra}, format="json")
        return response

    def test_at_most_three_featured(self):
        for name in ("A", "B", "C"):
            self.assertEqual(self.make(name, is_featured=True).status_code, 201)
        fourth = self.make("D", is_featured=True)
        self.assertEqual(fourth.status_code, 400)
        self.assertIn("is_featured", fourth.json()["errors"])

    def test_consent_gate_for_a_story_about_a_portal_user(self):
        created = self.make("Neo", user=str(self.innovator.id))
        self.assertEqual(created.status_code, 201, created.content)
        story = data(created)
        self.assertEqual((story["consent_status"], story["can_publish"]), ("not_asked", False))
        blocked = self.client.patch(f"/api/content/stories/{story['id']}/", {"status": "published"}, format="json")
        self.assertEqual(blocked.status_code, 400)
        self.assertIn("consent", blocked.json()["errors"])

        self.assertEqual(data(self.client.post(f"/api/content/stories/{story['id']}/consent-request/"))["consent_status"], "requested")
        self.client.force_authenticate(self.innovator)
        mine = data(self.client.get("/api/me/consents/"))
        self.assertEqual(mine[0]["id"], story["id"])
        other = User.objects.create_user(email="p2-other@example.com", password="StrongPass123")
        self.client.force_authenticate(other)
        self.assertEqual(self.client.post(f"/api/me/consents/{story['id']}/", {"agree": True}, format="json").status_code, 404)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.client.post(f"/api/me/consents/{story['id']}/", {"agree": True}, format="json"))["status"], "given")

        self.as_officer()
        self.assertEqual(self.client.patch(f"/api/content/stories/{story['id']}/", {"status": "published", "shows_on": ["stories"]}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        public = data(self.client.get("/api/content/public/stories/?lang=tn"))
        self.assertEqual(public[0]["business"], "Masimo a ga Neo")

        # Saying no later takes it down.
        self.client.force_authenticate(self.innovator)
        self.client.post(f"/api/me/consents/{story['id']}/", {"agree": False}, format="json")
        self.assertEqual(Story.objects.get(id=story["id"]).status, "archived")
        self.client.force_authenticate(None)
        self.assertEqual(data(self.client.get("/api/content/public/stories/")), [])

    def test_quote_limit_and_staff_only(self):
        self.assertEqual(self.make("Long", quote="x" * 201).status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get("/api/content/stories/").status_code, 403)


class SubscriptionTests(Part2TestCase):
    def test_double_opt_in_counts_unsubscribe_and_blast(self):
        self.client.force_authenticate(None)
        response = self.client.post("/api/content/public/subscriptions/", {"email": "Reader@Example.com", "topics": ["news"]}, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(len(mail.outbox), 1)
        subscriber = Subscriber.objects.get(email="reader@example.com")
        self.assertFalse(subscriber.is_active)
        self.client.post("/api/content/public/subscriptions/", {"phone": "+26771234567"}, format="json")

        self.as_officer()
        self.assertEqual(data(self.client.get("/api/content/subscribers/counts/")), {"email": 0, "email_unconfirmed": 1, "whatsapp": 1})
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/content/public/subscriptions/confirm/{subscriber.confirm_token}/").status_code, 200)
        subscriber.refresh_from_db()
        self.assertTrue(subscriber.is_active)

        post = ContentItem.objects.create(title="Pitch day", excerpt="Come along", status="published", published_at=timezone.now())
        self.as_officer()
        mail.outbox = []
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"/api/content/posts/{post.id}/blast/")
        self.assertEqual(response.status_code, 202, response.content)
        self.assertEqual(data(response)["whatsapp_pending"], 1)
        self.assertEqual([message.to for message in mail.outbox], [["reader@example.com"]])
        self.assertIn(str(subscriber.unsubscribe_token), mail.outbox[0].body)
        self.assertEqual(PostBlast.objects.get().email_count, 1)
        draft = ContentItem.objects.create(title="Draft", excerpt="x")
        self.assertEqual(self.client.post(f"/api/content/posts/{draft.id}/blast/").status_code, 400)

        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"/api/content/public/unsubscribe/{subscriber.unsubscribe_token}/").status_code, 200)
        subscriber.refresh_from_db()
        self.assertFalse(subscriber.is_active)
        self.assertEqual(self.client.get("/api/content/public/unsubscribe/00000000-0000-0000-0000-000000000000/").status_code, 404)

    def test_needs_an_address(self):
        self.assertEqual(self.client.post("/api/content/public/subscriptions/", {}, format="json").status_code, 400)


class FAQTests(Part2TestCase):
    def test_placements_program_language_groups_and_old_fields(self):
        group_b = FAQGroup.objects.create(name="Money", ordering=2, translations={"tn": {"name": "Madi"}})
        group_a = FAQGroup.objects.create(name="Getting started", ordering=1)
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.CHALLENGE_CALL, defaults={"name": "Challenge"})
        program = Program.objects.create(title="Call", slug="call-p2", program_type=program_type, owner=self.officer)
        FAQ.objects.create(question="How much?", answer="Up to P150 000", group=group_b, placements=["help"], translations={"tn": {"question": "Bokae?"}})
        FAQ.objects.create(question="How do I start?", answer="Quick start", group=group_a, placements=["help", "home"])
        FAQ.objects.create(question="Can teams enter?", answer="Yes", placements=["program"], program=program)
        FAQ.objects.create(question="Hidden", answer="x", placements=["help"], is_public=False)

        help_items = self.client.get("/api/support/faqs/?placement=help").json()
        self.assertEqual([item["question"] for item in help_items], ["How do I start?", "How much?"])
        self.assertTrue({"id", "question", "answer", "ordering", "is_public"} <= set(help_items[0]))
        self.assertEqual([item["question"] for item in self.client.get("/api/support/faqs/?placement=home").json()], ["How do I start?"])
        self.assertEqual([item["question"] for item in self.client.get(f"/api/support/faqs/?placement=program&program={program.id}").json()], ["Can teams enter?"])
        tn = {item["answer"]: item for item in self.client.get("/api/support/faqs/?placement=help&lang=tn").json()}
        self.assertEqual((tn["Up to P150 000"]["question"], tn["Up to P150 000"]["group_name"]), ("Bokae?", "Madi"))
        self.assertEqual(len(self.client.get("/api/support/faqs/").json()), 3)

    def test_group_crud_and_reorder(self):
        self.as_officer()
        first = self.client.post("/api/support/admin/faq-groups/", {"name": "One", "ordering": 1}, format="json").json()
        second = self.client.post("/api/support/admin/faq-groups/", {"name": "Two", "ordering": 2}, format="json").json()
        reordered = self.client.post("/api/support/admin/faq-groups/reorder/", [{"id": first["id"], "ordering": 2}, {"id": second["id"], "ordering": 1}], format="json").json()
        self.assertEqual([item["name"] for item in reordered], ["Two", "One"])
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get("/api/support/admin/faq-groups/").status_code, 403)


class SearchTests(Part2TestCase):
    def test_grouped_results_and_unanswered_logging(self):
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.CHALLENGE_CALL, defaults={"name": "Challenge"})
        now = timezone.now()
        Program.objects.create(
            title="Solar farming challenge", slug="solar-farming", description="Solar pumps for farms", program_type=program_type, owner=self.officer,
            status=ProgramStatus.PUBLISHED, is_public=True, opening_date=now - timedelta(days=1), closing_date=now + timedelta(days=9),
        )
        ContentItem.objects.create(title="Solar pump winners", excerpt="Three farms", status="published", published_at=now)
        ContentItem.objects.create(title="Solar draft", excerpt="hidden", status="draft")
        FAQ.objects.create(question="Can I enter a solar idea?", answer="Yes", placements=["help"])
        Story.objects.create(person_name="Mpho", business="Solar Cold Rooms", status="published")
        Story.objects.create(person_name="Hidden", business="Solar secret", status="draft")

        result = data(self.client.get("/api/content/public/search/?q=solar"))
        groups = result["groups"]
        self.assertEqual([item["slug"] for item in groups["challenges"]], ["solar-farming"])
        self.assertEqual(groups["challenges"][0]["status"], "open")
        self.assertEqual([item["title"] for item in groups["posts"]], ["Solar pump winners"])
        self.assertEqual([item["title"] for item in groups["stories"]], ["Solar Cold Rooms"])
        self.assertEqual(groups["help"][0]["kind"], "faq")
        self.assertEqual(result["total"], 4)
        self.assertFalse(UnansweredQuestion.objects.exists())

        for _ in range(2):
            empty = data(self.client.get("/api/content/public/search/", {"q": "Goat  milk"}))
            self.assertEqual(empty["total"], 0, empty)
        row = UnansweredQuestion.objects.get()
        self.assertEqual((row.text, row.count), ("goat milk", 2))
        self.as_officer()
        self.assertEqual(self.client.get("/api/support/admin/faqs/unanswered/").json()[0]["text"], "goat milk")


class LeadershipAndSettingsTests(Part2TestCase):
    def test_official_quotes_need_approval_and_quotes_are_short(self):
        self.as_officer()
        too_long = self.client.post("/api/content/leadership/", {"full_name": "Dr P", "job_title": "Minister", "quote": "x" * 181}, format="json")
        self.assertEqual(too_long.status_code, 400)
        created = self.client.post(
            "/api/content/leadership/",
            {"full_name": "Hon. M", "job_title": "Minister", "quote": "Build here", "is_official": True, "translations": {"tn": {"quote": "Agang fano"}}},
            format="json",
        )
        self.assertEqual(created.status_code, 201, created.content)
        card_id = created.json()["id"]
        self.assertTrue(created.json()["needs_approval"])
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get("/api/content/leadership/").json(), [])

        approval = ApprovalRequest.objects.get(status="pending")
        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/approve/", {}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        listed = self.client.get("/api/content/leadership/?lang=tn").json()
        self.assertEqual([item["quote"] for item in listed], ["Agang fano"])

        # Changing the quote needs approval again.
        self.as_officer()
        self.client.patch(f"/api/content/leadership/{card_id}/", {"quote": "Build here, now"}, format="json")
        self.assertIsNone(LeadershipCard.objects.get(id=card_id).approved_at)

    def test_social_links(self):
        self.as_officer()
        ok = self.client.patch("/api/content/site-settings/", {"social_links": [{"network": "facebook", "url": "https://facebook.com/ceda"}]}, format="json")
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.json()["social_links"][0]["network"], "facebook")
        self.assertEqual(self.client.patch("/api/content/site-settings/", {"social_links": [{"url": "x"}]}, format="json").status_code, 400)
