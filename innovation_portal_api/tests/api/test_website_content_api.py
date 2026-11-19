"""B6 part 1: home page sections, approvals, scheduling, posts, partners, site settings."""

from datetime import timedelta

from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import ApprovalRequest, ContentItem, Page, PageVersion, Partner
from apps.content.services import publish_due_content
from apps.core.constants import ProgramStatus, ProgramTypeCode, RoleType
from apps.media_library.models import MediaAsset
from apps.programs.models import Program, ProgramType
from apps.reference.models import Sector

DRAFT = "/api/content/pages/home/draft/"
SUBMIT = "/api/content/pages/home/submit/"
PUBLIC_HOME = "/api/content/public/home/"
POSTS = "/api/content/posts/"


def data(response):
    return response.json()["data"]


class ContentTestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="web-officer@example.com", password="StrongPass123", first_name="Kago", last_name="T")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="web-manager@example.com", password="StrongPass123", first_name="Mpho", last_name="M")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.innovator = User.objects.create_user(email="web-innovator@example.com", password="StrongPass123")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(self.officer)

    def approve_latest(self, comment=""):
        approval = ApprovalRequest.objects.filter(status="pending").latest("created_at")
        self.client.force_authenticate(self.manager)
        response = self.client.post(f"/api/content/approvals/{approval.id}/approve/", {"comment": comment}, format="json")
        self.client.force_authenticate(self.officer)
        self.assertEqual(response.status_code, 200, response.content)
        return approval

    def publish_home(self, sections=None):
        if sections is not None:
            self.assertEqual(self.client.put(DRAFT, {"sections": sections}, format="json").status_code, 200)
        self.assertEqual(self.client.post(SUBMIT, {}, format="json").status_code, 201)
        self.approve_latest()

    def draft_sections(self):
        return data(self.client.get(DRAFT))["sections"]

    def public_home(self, lang="en"):
        self.client.force_authenticate(None)
        response = self.client.get(PUBLIC_HOME, {"lang": lang})
        self.client.force_authenticate(self.officer)
        self.assertEqual(response.status_code, 200)
        return data(response)


class HomeDraftTests(ContentTestCase):
    def test_new_home_page_starts_with_every_section_and_the_banner_first(self):
        sections = self.draft_sections()
        self.assertEqual(sections[0]["type"], "hero_banner")
        self.assertEqual(len({section["type"] for section in sections}), 10)
        types = data(self.client.get("/api/content/section-types/"))
        banner = next(item for item in types if item["type"] == "hero_banner")
        self.assertEqual((banner["fixed_first"], banner["can_disable"]), (True, False))

    def test_banner_cannot_be_disabled_or_moved(self):
        sections = self.draft_sections()
        sections[0]["enabled"] = False
        response = self.client.put(DRAFT, {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("sections[0].enabled", [item["path"] for item in response.json()["errors"]["errors"]])

        sections = self.draft_sections()
        sections[0], sections[1] = sections[1], sections[0]
        response = self.client.put(DRAFT, {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 400)
        messages = [item["message"] for item in response.json()["errors"]["errors"]]
        self.assertIn("The banner must be the first section.", messages)

        sections = self.draft_sections()
        sections.append(dict(sections[0], id=None))
        self.assertEqual(self.client.put(DRAFT, {"sections": sections}, format="json").status_code, 400)

    def test_settings_are_checked_per_type(self):
        sections = self.draft_sections()
        challenges = next(section for section in sections if section["type"] == "challenges")
        challenges["settings"]["max_items"] = 50
        challenges["settings"]["colour"] = "red"
        sections[0]["settings"]["headline"] = {"en": ""}
        sections.append({"type": "carousel", "settings": {}})
        response = self.client.put(DRAFT, {"sections": sections}, format="json")
        self.assertEqual(response.status_code, 400)
        paths = {item["path"] for item in response.json()["errors"]["errors"]}
        index = sections.index(challenges)
        self.assertTrue({f"sections[{index}].settings.max_items", f"sections[{index}].settings", "sections[0].settings.headline", f"sections[{len(sections) - 1}].type"} <= paths)

    def test_staff_only(self):
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(DRAFT).status_code, 403)
        self.assertEqual(self.client.post(SUBMIT, {}, format="json").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(DRAFT).status_code, 401)


class HomePublishTests(ContentTestCase):
    def test_draft_and_live_are_separate_until_approved(self):
        self.assertEqual(self.public_home()["sections"], [])
        sections = self.draft_sections()
        sections[0]["settings"]["headline"] = {"en": "Grow your idea", "tn": "Godisa kakanyo ya gago"}
        self.publish_home(sections)
        live = self.public_home()
        self.assertEqual(live["sections"][0]["settings"]["headline"], "Grow your idea")
        self.assertEqual(self.public_home("tn")["sections"][0]["settings"]["headline"], "Godisa kakanyo ya gago")

        # A draft change is invisible until it is approved.
        sections = self.draft_sections()
        sections[0]["settings"]["headline"] = {"en": "Changed"}
        self.client.put(DRAFT, {"sections": sections}, format="json")
        self.assertEqual(self.public_home()["sections"][0]["settings"]["headline"], "Grow your idea")
        preview = data(self.client.get("/api/content/pages/home/preview/"))
        self.assertEqual(preview["sections"][0]["settings"]["headline"], "Changed")

    def test_disabling_a_section_and_publishing_removes_it(self):
        self.publish_home()
        self.assertIn("news_flash", [section["type"] for section in self.public_home()["sections"]])
        sections = self.draft_sections()
        next(section for section in sections if section["type"] == "news_flash")["enabled"] = False
        self.publish_home(sections)
        self.assertNotIn("news_flash", [section["type"] for section in self.public_home()["sections"]])

    def test_scheduled_home_page_goes_live_at_its_time(self):
        self.publish_home()
        sections = self.draft_sections()
        sections[0]["settings"]["headline"] = {"en": "Next week"}
        self.client.put(DRAFT, {"sections": sections}, format="json")
        later = timezone.now() + timedelta(hours=2)
        self.client.post(SUBMIT, {"publish_at": later.isoformat()}, format="json")
        self.approve_latest()
        self.assertNotEqual(self.public_home()["sections"][0]["settings"]["headline"], "Next week")
        PageVersion.objects.filter(number=2).update(go_live_at=timezone.now() - timedelta(minutes=1))
        publish_due_content()
        self.assertEqual(self.public_home()["sections"][0]["settings"]["headline"], "Next week")

    def test_one_call_returns_section_data(self):
        sector = Sector.objects.filter(active=True).first()
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.CHALLENGE_CALL, defaults={"name": "Challenge"})
        now = timezone.now()
        program = Program.objects.create(
            title="Agri tech call", slug="agri-tech-call", description="Ideas for farmers.\nMore text.", program_type=program_type,
            status=ProgramStatus.PUBLISHED, is_public=True, opening_date=now - timedelta(days=5), closing_date=now + timedelta(days=5), owner=self.officer,
        )
        if sector:
            program.sectors.add(sector)
        Partner.objects.create(name="Bank of Ideas", tier="supporter", show_on_home=True)
        Partner.objects.create(name="Lead Co", tier="lead_sponsor", show_on_home=True)
        Partner.objects.create(name="Old Co", tier="partner", show_on_home=True, show_until=now - timedelta(days=1))
        video = MediaAsset.objects.create(kind="video", file="media/v.mp4", mime_type="video/mp4", duration_seconds=95)
        ContentItem.objects.create(title="Pitch day", excerpt="Come", status="published", published_at=now, show_in_news_flash=True, cover=video)
        sections = self.draft_sections()
        if sector:
            next(s for s in sections if s["type"] == "sectors")["settings"]["items"] = [{"sector": sector.slug, "example": {"en": "Cold storage for milk"}, "icon": "cow"}]
        self.publish_home(sections)

        by_type = {section["type"]: section for section in self.public_home()["sections"]}
        self.assertEqual([item["name"] for item in by_type["partners_strip"]["data"]["items"]], ["Lead Co", "Bank of Ideas"])
        card = by_type["challenges"]["data"]["items"][0]
        self.assertEqual((card["title"], card["status"], card["summary"]), ("Agri tech call", "open", "Ideas for farmers."))
        self.assertEqual(card["days_left"], 4)
        self.assertTrue(0 < card["window_progress"] < 1)
        news = by_type["news_flash"]["data"]["items"][0]
        self.assertEqual((news["title"], news["duration_seconds"], news["cover"]["kind"]), ("Pitch day", 95, "video"))
        if sector:
            self.assertEqual(by_type["sectors"]["data"]["items"][0]["example"], "Cold storage for milk")
        self.assertIn("rotation_seconds", by_type["leadership_quotes"]["data"])


class ApprovalTests(ContentTestCase):
    def test_only_managers_and_admins_decide_and_rejecting_needs_a_reason(self):
        self.client.post(SUBMIT, {}, format="json")
        approval = ApprovalRequest.objects.get(status="pending")
        listed = data(self.client.get("/api/content/approvals/?status=pending"))
        self.assertEqual(listed[0]["can_decide"], False)
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/approve/", {}, format="json").status_code, 403)

        self.client.force_authenticate(self.manager)
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/reject/", {}, format="json").status_code, 400)
        response = self.client.post(f"/api/content/approvals/{approval.id}/reject/", {"comment": "Fix the headline"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data(response)["status"], "rejected")
        self.assertFalse(Page.objects.get(slug="home").versions.exists())
        self.assertEqual(self.client.post(f"/api/content/approvals/{approval.id}/approve/", {}, format="json").status_code, 400)


class PostTests(ContentTestCase):
    def create_post(self, **extra):
        payload = {"title": {"en": "Pitch day in Maun", "tn": "Letsatsi la go tlhalosa kwa Maun"}, "excerpt": "Bring your idea", "type": "news", **extra}
        response = self.client.post(POSTS, payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)

    def test_event_and_newsletter_fields_are_required(self):
        response = self.client.post(POSTS, {"title": "Bootcamp", "type": "event"}, format="json")
        self.assertEqual(response.status_code, 400)
        errors = response.json()["errors"]
        self.assertIn("event_starts_at", errors)
        self.assertIn("event_place", errors)
        self.assertEqual(self.client.post(POSTS, {"title": "Issue", "type": "newsletter"}, format="json").status_code, 400)
        event = self.create_post(type="event", event_starts_at=(timezone.now() + timedelta(days=3)).isoformat(), event_place="Gaborone")
        self.assertEqual(event["status"], "draft")

    def test_submit_approve_and_schedule(self):
        post = self.create_post(show_in_news_flash=True)
        self.assertEqual(self.client.post(f"{POSTS}{post['id']}/submit/", {}, format="json").status_code, 201)
        self.assertEqual(ContentItem.objects.get(id=post["id"]).status, "pending_approval")
        self.approve_latest()
        item = ContentItem.objects.get(id=post["id"])
        self.assertEqual(item.status, "published")
        self.assertIsNotNone(item.published_at)

        later = self.create_post(title="Later")
        when = timezone.now() + timedelta(hours=3)
        self.client.post(f"{POSTS}{later['id']}/submit/", {"publish_at": when.isoformat()}, format="json")
        self.approve_latest()
        self.assertEqual(ContentItem.objects.get(id=later["id"]).status, "scheduled")
        counts = data(self.client.get(POSTS))["counts"]
        self.assertEqual((counts["live"], counts["scheduled"]), (1, 1))

        ContentItem.objects.filter(id=later["id"]).update(publish_at=timezone.now() - timedelta(minutes=1))
        ContentItem.objects.filter(id=post["id"]).update(unpublish_at=timezone.now() - timedelta(minutes=1))
        result = publish_due_content()
        self.assertEqual((result["published"], result["retired"]), (1, 1))
        self.assertEqual(ContentItem.objects.get(id=later["id"]).status, "published")
        self.assertEqual(ContentItem.objects.get(id=post["id"]).status, "archived")

    def test_new_flag_window(self):
        now = timezone.now()
        fresh = ContentItem.objects.create(title="Fresh", excerpt="x", status="published", published_at=now - timedelta(days=2))
        old = ContentItem.objects.create(title="Old", excerpt="x", status="published", published_at=now - timedelta(days=8))
        short = ContentItem.objects.create(title="Short window", excerpt="x", status="published", published_at=now - timedelta(days=2), mark_new_days=1)
        self.assertEqual((fresh.is_new, old.is_new, short.is_new), (True, False, False))
        self.client.force_authenticate(None)
        results = {item["title"]: item for item in data(self.client.get("/api/content/public/posts/"))["results"]}
        self.assertTrue(results["Fresh"]["is_new"])
        self.assertFalse(results["Old"]["is_new"])

    def test_public_list_featured_detail_related_and_views(self):
        now = timezone.now()
        pinned = ContentItem.objects.create(title="Pinned", excerpt="x", status="published", published_at=now - timedelta(days=1), pinned_until=now + timedelta(days=1), tags=["agri"])
        for number in range(3):
            ContentItem.objects.create(title=f"Story {number}", excerpt="x", status="published", published_at=now - timedelta(hours=number), tags=["agri"])
        ContentItem.objects.create(title="Hidden draft", excerpt="x", status="draft")
        self.client.force_authenticate(None)
        listed = data(self.client.get("/api/content/public/posts/"))
        self.assertEqual(listed["featured"]["title"], "Pinned")
        self.assertEqual([item["title"] for item in listed["results"]], ["Story 0", "Story 1", "Story 2"])
        self.assertEqual(listed["total"], 3)

        detail = self.client.get(f"/api/content/public/posts/{pinned.slug}/")
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(len(data(detail)["related"]), 3)
        self.assertEqual(ContentItem.objects.get(id=pinned.id).view_count, 1)
        hidden = ContentItem.objects.get(title="Hidden draft")
        self.assertEqual(self.client.get(f"/api/content/public/posts/{hidden.slug}/").status_code, 404)

    def test_setswana_with_english_fallback(self):
        post = self.create_post()
        ContentItem.objects.filter(id=post["id"]).update(status="published", published_at=timezone.now())
        self.client.force_authenticate(None)
        item = data(self.client.get(f"/api/content/public/posts/{post['slug']}/", {"lang": "tn"}))
        self.assertEqual((item["title"], item["excerpt"]), ("Letsatsi la go tlhalosa kwa Maun", "Bring your idea"))

    def test_upcoming_events_and_newsletters(self):
        now = timezone.now()
        ContentItem.objects.create(title="Soon", excerpt="x", type="event", event_starts_at=now + timedelta(days=2), event_place="Francistown", status="published", published_at=now)
        ContentItem.objects.create(title="Past", excerpt="x", type="event", event_starts_at=now - timedelta(days=2), event_place="Maun", status="published", published_at=now)
        ContentItem.objects.create(title="Issue 3", excerpt="x", type="newsletter", newsletter_issue=3, status="published", published_at=now)
        self.client.force_authenticate(None)
        self.assertEqual([item["title"] for item in data(self.client.get("/api/content/public/events/upcoming/"))], ["Soon"])
        self.assertEqual(data(self.client.get("/api/content/public/newsletters/"))[0]["newsletter_issue"], 3)

    def test_pin_duplicate_unpublish_and_old_news_endpoint(self):
        post = self.create_post()
        self.assertEqual(self.client.post(f"{POSTS}{post['id']}/pin/", {"until": (timezone.now() - timedelta(hours=1)).isoformat()}, format="json").status_code, 400)
        pinned = data(self.client.post(f"{POSTS}{post['id']}/pin/", {"until": (timezone.now() + timedelta(days=2)).isoformat()}, format="json"))
        self.assertTrue(pinned["is_pinned"])
        copy = data(self.client.post(f"{POSTS}{post['id']}/duplicate/", {}, format="json"))
        self.assertEqual((copy["status"], copy["title"]["en"]), ("draft", "Copy of Pitch day in Maun"))
        self.assertNotEqual(copy["slug"], post["slug"])
        self.assertEqual(data(self.client.post(f"{POSTS}{post['id']}/unpublish/", {}, format="json"))["status"], "archived")
        # The older news endpoint still lists and creates.
        self.assertEqual(self.client.post("/api/content/news/", {"title": "Old way", "excerpt": "x", "status": "published"}, format="json").status_code, 201)
        self.assertTrue(ContentItem.objects.get(title="Old way").slug)

    def test_staff_only(self):
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(POSTS).status_code, 403)
        self.assertEqual(self.client.post(POSTS, {"title": "x"}, format="json").status_code, 403)


class PartnerAndSettingsTests(ContentTestCase):
    def test_partner_show_dates_order_and_program_placement(self):
        now = timezone.now()
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.CHALLENGE_CALL, defaults={"name": "Challenge"})
        program = Program.objects.create(title="Call", slug="call", description="x", program_type=program_type, opening_date=now, closing_date=now + timedelta(days=3), owner=self.officer)
        response = self.client.post("/api/content/partners/", {"name": "Later Co", "tier": "partner", "show_on_home": True, "show_from": (now + timedelta(days=1)).isoformat()}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        self.client.post("/api/content/partners/", {"name": "Now Co", "tier": "partner", "show_on_home": True, "program_ids": [str(program.id)]}, format="json")
        bad = self.client.post("/api/content/partners/", {"name": "Bad", "show_from": now.isoformat(), "show_until": (now - timedelta(days=1)).isoformat()}, format="json")
        self.assertEqual(bad.status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual([item["name"] for item in data(self.client.get("/api/content/public/partners/?placement=home"))], ["Now Co"])
        self.assertEqual([item["name"] for item in data(self.client.get(f"/api/content/public/partners/?placement=program&program={program.id}"))], ["Now Co"])
        self.assertEqual(data(self.client.get("/api/content/public/partners/?placement=program&program=nope")), [])

    def test_site_settings_contact_fields(self):
        self.client.force_authenticate(None)
        initial = self.client.get("/api/content/site-settings/").json()
        self.assertIsNone(initial["whatsapp_number"])
        self.assertEqual(initial["languages_enabled"], ["en", "tn"])
        self.client.force_authenticate(self.officer)
        response = self.client.patch(
            "/api/content/site-settings/",
            {"whatsapp_number": "+26771000000", "ussd_code": "*123#", "footer_links": [{"label": "Privacy", "url": "/privacy"}], "languages_enabled": ["en"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["ussd_code"], "*123#")
        self.assertEqual(response.json()["footer_links"], [{"label": "Privacy", "url": "/privacy"}])
        self.assertEqual(self.client.patch("/api/content/site-settings/", {"languages_enabled": ["fr"]}, format="json").status_code, 400)
