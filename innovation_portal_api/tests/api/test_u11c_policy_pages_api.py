"""U11C: policy page text (About, Guidelines, Privacy, Terms of use, Terms of agreement)."""

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.content.models import ApprovalRequest, PolicyPage
from apps.content.policy_seed import POLICY_SEED
from apps.core.constants import RoleType

KEYS = ["about", "guidelines", "privacy", "terms_of_use", "terms_of_agreement"]


def data(response):
    return response.json()["data"]


def content(title="Privacy policy", body="We keep your data safe.", tn_body=""):
    return {
        "title": {"en": title, "tn": "Pholisi ya sephiri"},
        "intro": {"en": "How we use your data.", "tn": ""},
        "sections": [
            {"heading": {"en": "Introduction", "tn": ""}, "body": {"en": body, "tn": tn_body}},
            {"heading": {"en": "", "tn": ""}, "body": {"en": "• One\n• Two", "tn": ""}},
        ],
    }


class PolicyTestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="policy-officer@example.com", password="StrongPass123", first_name="Kago", last_name="T")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="policy-manager@example.com", password="StrongPass123", first_name="Mpho", last_name="M")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.innovator = User.objects.create_user(email="policy-innovator@example.com", password="StrongPass123")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        self.client.force_authenticate(self.officer)

    def public(self, key, lang="en"):
        self.client.force_authenticate(None)
        response = self.client.get(f"/api/content/public/policies/{key}/", {"lang": lang})
        self.client.force_authenticate(self.officer)
        return response

    def approve(self, approval_id, user=None):
        self.client.force_authenticate(user or self.manager)
        response = self.client.post(f"/api/content/approvals/{approval_id}/approve/", {"comment": ""}, format="json")
        self.client.force_authenticate(self.officer)
        return response


class SeedTests(PolicyTestCase):
    def test_all_five_pages_are_seeded_with_the_old_text(self):
        self.assertEqual(sorted(PolicyPage.objects.values_list("key", flat=True)), sorted(KEYS))
        for key in KEYS:
            page = PolicyPage.objects.get(key=key)
            self.assertTrue(page.title["en"], key)
            self.assertTrue(page.sections, key)
            self.assertTrue(all(section["body"]["en"] for section in page.sections), key)
            self.assertEqual(page.sections, POLICY_SEED[key]["sections"])
        privacy = PolicyPage.objects.get(key="privacy")
        self.assertEqual(privacy.sections[0]["heading"]["en"], "Introduction")
        self.assertEqual(len(PolicyPage.objects.get(key="terms_of_agreement").sections), 10)
        self.assertTrue(PolicyPage.objects.get(key="about").title["tn"])


class PublicReadTests(PolicyTestCase):
    def test_anyone_can_read_a_page_in_english(self):
        response = self.public("privacy")
        self.assertEqual(response.status_code, 200)
        page = data(response)
        self.assertEqual(page["key"], "privacy")
        self.assertEqual(page["title"], "Privacy policy")
        self.assertEqual(page["lang"], "en")
        self.assertFalse(page["english_fallback"])
        self.assertEqual(set(page["sections"][0]), {"heading", "body"})
        self.assertTrue(page["updated_at"])

    def test_setswana_shows_where_it_exists_and_english_fills_the_gaps(self):
        about = data(self.public("about", "tn"))
        self.assertEqual(about["title"], POLICY_SEED["about"]["title"]["tn"])
        self.assertFalse(about["english_fallback"])
        privacy = data(self.public("privacy", "tn"))
        self.assertEqual(privacy["title"], "Pholisi ya sephiri")
        self.assertEqual(privacy["sections"][0]["heading"], "Introduction")
        self.assertTrue(privacy["english_fallback"])

    def test_unknown_page_is_404(self):
        self.assertEqual(self.public("cookies").status_code, 404)

    def test_public_read_does_not_include_drafts(self):
        self.client.put("/api/content/policies/privacy/draft/", content(title="Secret new title"), format="json")
        self.assertEqual(data(self.public("privacy"))["title"], "Privacy policy")


class StaffEditTests(PolicyTestCase):
    def test_list_and_detail(self):
        rows = data(self.client.get("/api/content/policies/"))
        self.assertEqual(sorted(row["key"] for row in rows), sorted(KEYS))
        row = next(row for row in rows if row["key"] == "privacy")
        self.assertEqual((row["has_draft"], row["pending_approval"], row["missing_setswana"]), (False, False, True))
        detail = data(self.client.get("/api/content/policies/about/"))
        self.assertEqual(set(detail), {"key", "name", "live", "published_at", "published_by", "draft", "draft_updated_at", "draft_updated_by", "pending_approval"})
        self.assertEqual(set(detail["live"]), {"title", "intro", "sections"})
        self.assertIsNone(detail["draft"])

    def test_save_and_discard_a_draft(self):
        response = self.client.put("/api/content/policies/privacy/draft/", content(body="  New text.\r\n\r\nSecond paragraph.  "), format="json")
        self.assertEqual(response.status_code, 200, response.content)
        draft = data(response)["draft"]
        self.assertEqual(draft["sections"][0]["body"]["en"], "New text.\n\nSecond paragraph.")
        self.assertEqual(data(response)["draft_updated_by"], "Kago T")
        self.assertEqual(PolicyPage.objects.get(key="privacy").sections[0]["body"]["en"][:13], "Citizen Entre")
        response = self.client.delete("/api/content/policies/privacy/draft/")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(PolicyPage.objects.get(key="privacy").draft)

    def test_validation_errors_have_paths(self):
        bad = content(body="")
        bad["title"] = {"en": "", "tn": "x"}
        bad["sections"].append({"heading": {"en": "A"}, "body": "not an object"})
        bad["sections"].append({"heading": {"fr": "Bonjour"}, "body": {"en": "x" * 20001}})
        response = self.client.put("/api/content/policies/privacy/draft/", bad, format="json")
        self.assertEqual(response.status_code, 400)
        paths = {error["path"] for error in response.json()["errors"]["errors"]}
        self.assertTrue({"title.en", "sections[0].body.en", "sections[2].body", "sections[3].heading", "sections[3].body.en"} <= paths, paths)
        empty = self.client.put("/api/content/policies/privacy/draft/", {"title": {"en": "T"}, "sections": []}, format="json")
        self.assertEqual(empty.status_code, 400)
        unknown = self.client.put("/api/content/policies/privacy/draft/", {**content(), "slug": "x"}, format="json")
        self.assertEqual(unknown.status_code, 400)

    def test_submit_needs_a_draft(self):
        response = self.client.post("/api/content/policies/privacy/submit/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_permissions(self):
        for user in (None, self.innovator):
            self.client.force_authenticate(user)
            self.assertIn(self.client.get("/api/content/policies/").status_code, (401, 403))
            self.assertIn(self.client.put("/api/content/policies/privacy/draft/", content(), format="json").status_code, (401, 403))
            self.assertIn(self.client.post("/api/content/policies/privacy/submit/", {}, format="json").status_code, (401, 403))
        self.assertIsNone(PolicyPage.objects.get(key="privacy").draft)


class ApprovalTests(PolicyTestCase):
    def submit(self, body="Approved text.", tn_body=""):
        self.assertEqual(self.client.put("/api/content/policies/privacy/draft/", content(body=body, tn_body=tn_body), format="json").status_code, 200)
        response = self.client.post("/api/content/policies/privacy/submit/", {}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)

    def test_live_text_stays_until_approved_then_changes(self):
        approval = self.submit()
        self.assertEqual(approval["target_type"], "policy")
        self.assertEqual(approval["kind"], "policy")
        self.assertNotEqual(data(self.public("privacy"))["sections"][0]["body"], "Approved text.")
        detail = data(self.client.get("/api/content/policies/privacy/"))
        self.assertEqual(detail["pending_approval"]["id"], approval["id"])
        response = self.approve(approval["id"])
        self.assertEqual(response.status_code, 200, response.content)
        page = data(self.public("privacy"))
        self.assertEqual(page["sections"][0]["body"], "Approved text.")
        self.assertEqual(page["intro"], "How we use your data.")
        stored = PolicyPage.objects.get(key="privacy")
        self.assertIsNone(stored.draft)
        self.assertEqual(stored.published_by, self.officer)
        self.assertEqual(ApprovalRequest.objects.get(pk=approval["id"]).status, "approved")

    def test_sending_back_leaves_the_live_text_and_the_draft(self):
        approval = self.submit()
        self.client.force_authenticate(self.manager)
        response = self.client.post(f"/api/content/approvals/{approval['id']}/reject/", {"comment": "Check the wording."}, format="json")
        self.client.force_authenticate(self.officer)
        self.assertEqual(response.status_code, 200, response.content)
        stored = PolicyPage.objects.get(key="privacy")
        self.assertEqual(stored.sections, POLICY_SEED["privacy"]["sections"])
        self.assertIsNotNone(stored.draft)

    def test_edits_after_sending_stay_as_a_draft(self):
        approval = self.submit()
        self.client.put("/api/content/policies/privacy/draft/", content(body="A later change."), format="json")
        self.assertEqual(self.approve(approval["id"]).status_code, 200)
        stored = PolicyPage.objects.get(key="privacy")
        self.assertEqual(stored.sections[0]["body"]["en"], "Approved text.")
        self.assertEqual(stored.draft["sections"][0]["body"]["en"], "A later change.")

    def test_setswana_changes_wait_for_the_setswana_step_when_the_flow_has_one(self):
        approval = self.submit(tn_body="Mafoko a Setswana.")
        self.assertEqual(approval["languages"], ["en", "tn"])
        english_only = self.submit()
        self.assertEqual(english_only["languages"], ["en", "tn"])  # the title already has Setswana
        self.assertEqual(ApprovalRequest.objects.get(pk=approval["id"]).status, "withdrawn")

    def test_author_cannot_approve_own_change(self):
        approval = self.submit()
        response = self.approve(approval["id"], user=self.officer)
        self.assertEqual(response.status_code, 403)
        self.assertEqual(PolicyPage.objects.get(key="privacy").sections, POLICY_SEED["privacy"]["sections"])
