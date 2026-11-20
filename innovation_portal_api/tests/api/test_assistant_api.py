"""C3 AI helper. The Anthropic SDK is always replaced by FakeClaude: no test reaches the real API."""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx2
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import Role, RoleCapability, User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assistant.client import AssistantClient, cost_usd
from apps.assistant.models import CachedAnswer, Introduction, KnowledgeEntry, ManualPage, ManualScreenshot, UsageRecord
from apps.audit.models import AuditLog
from apps.communications.models import Notification
from apps.core import capabilities
from apps.core.constants import RoleType, SubmissionType
from apps.platform_config.crypto import encrypt_secrets
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.testing import reset_platform_caches, set_features
from apps.programs.general_intake import GeneralIntakeService
from apps.reference.models import Sector
from apps.submissions.intake import DraftTokenService
from apps.submissions.models import ApplicationDraft, Submission, SubmissionResponse

API_KEY = "sk-ant-test-key-QQ77"
BASE = "/api/assistant"
GUIDANCE = "Always ask how the idea creates jobs in Botswana"

DRAFT_ANSWER = {
    "clear": ["The problem is easy to follow."],
    "unclear": [{"field_key": "solution", "quote": "We will do things.", "suggestion": "Say what you will make and for whom."}],
    "missing": [{"field_key": "who_benefits", "what": "Who will use it."}, {"field_key": "made_up_key", "what": "Jobs created."}],
    "officer_questions": ["How many jobs?", "Who pays?", "Where?", "A fourth question is cut."],
}
HINTS_ANSWER = {"summary": ["Line 1", "Line 2"], "strengths": ["Clear market"], "points_to_check": ["Check costs"], "next_step": "Ask for a budget."}
HELP_ANSWER = {"answer": "Open My ideas and press Edit.", "page_ids": [], "screenshot_ids": [], "confident": True, "wants_person": False}


def data(response):
    return response.json()["data"]


def message(payload: dict, *, usage=None, stop_reason="end_turn", model="claude-opus-5-5"):
    return SimpleNamespace(
        content=[SimpleNamespace(type="thinking", thinking=""), SimpleNamespace(type="text", text=json.dumps(payload))],
        usage=usage or SimpleNamespace(input_tokens=1000, output_tokens=500, cache_read_input_tokens=2000, cache_creation_input_tokens=100),
        stop_reason=stop_reason,
        model=model,
        _request_id="req_test",
    )


class FakeClaude:
    """Stands in for anthropic.Anthropic. Records every request; answers from a queue or a function."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []
        outer = self

        class _Messages:
            def create(self, **kwargs):
                return outer._answer(kwargs)

        self.messages = _Messages()
        self.beta = SimpleNamespace(messages=_Messages())

    def _answer(self, kwargs):
        self.calls.append(kwargs)
        answer = self.answers.pop(0) if len(self.answers) > 1 else self.answers[0]
        if isinstance(answer, Exception):
            raise answer
        if callable(answer):
            return answer(kwargs)
        return answer

    def __call__(self, *, api_key, timeout):
        assert api_key == API_KEY
        return self

    @property
    def last(self):
        return self.calls[-1]

    def system_text(self, index=-1):
        return "\n".join(block["text"] for block in self.calls[index]["system"])


def http_error(cls, status):
    request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
    return cls("error", response=httpx2.Response(status, request=request), body=None)


class AssistantTestCase(TestCase):
    def setUp(self):
        cache.clear()
        reset_platform_caches(self)
        capabilities.clear_cache()
        self.addCleanup(capabilities.clear_cache)
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = self.person("c3-officer@example.com", RoleType.INNOVATION_OFFICER)
        self.admin = self.person("c3-admin@example.com", RoleType.ADMINISTRATOR)
        self.innovator = self.person("c3-innovator@example.com", RoleType.INNOVATOR)
        self.other_innovator = self.person("c3-other@example.com", RoleType.INNOVATOR)
        self.program = GeneralIntakeService.program()
        self.sector = Sector.objects.create(slug="c3-agri", name={"en": "Agriculture", "tn": "Temothuo"})
        self.number = 0

    # -- helpers -----------------------------------------------------------------------------------

    def person(self, email, *roles, first="Neo", last="Molefe"):
        user = User.objects.create_user(email=email, password="StrongPass123", first_name=first, last_name=last)
        if roles:
            RoleService.assign_roles(user, list(roles))
        return user

    def connect(self, *, limit=50, **config):
        connection = IntegrationConnection.objects.create(
            kind="ai",
            provider="anthropic",
            name="Claude",
            config={"model": "claude-opus-5-5", "monthly_limit_usd": limit, "timeout_seconds": 30, **config},
            secrets_encrypted=encrypt_secrets({"api_key": API_KEY}),
            status=IntegrationConnection.Status.ACTIVE,
            is_active=True,
        )
        reset_platform_caches(self)
        return connection

    def switch_on(self, **config):
        set_features(self, ai_helper=True)
        return self.connect(**config)

    def fake(self, *answers):
        fake = FakeClaude(*answers)
        patcher = patch("apps.assistant.client.make_sdk_client", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def draft(self, owner=None, **answers):
        if owner is not None:  # one open draft per person and programme
            ApplicationDraft.objects.filter(innovator=owner, program=self.program).delete()
        return ApplicationDraft.objects.create(
            reference_number=f"DRAFT-C3-{ApplicationDraft.objects.count()}",
            program=self.program,
            innovator=owner,
            submission_type="idea",
            title="Solar fridge for farmers",
            draft_data={"problem": "Milk goes bad.", "solution": "We will do things.", "first_name": "Neo", **answers},
        )

    def idea(self, title, *, owner=None, sector=None, answer="", status="submitted"):
        self.number += 1
        submission = Submission.objects.create(
            reference_number=f"CEDA-C3-{self.number:04d}",
            program=self.program,
            innovator=owner,
            submission_type=SubmissionType.IDEA,
            title=title,
            current_status=status,
            sector=sector,
        )
        if answer:
            SubmissionResponse.objects.create(submission=submission, field_key_snapshot="solution", field_label_snapshot="Solution", field_type_snapshot="textarea", value=answer)
            SubmissionResponse.objects.create(submission=submission, field_key_snapshot="contact_number", field_label_snapshot="Phone", field_type_snapshot="phone", value="+26771234567")
        return submission

    def as_user(self, user):
        self.client.force_authenticate(user)

    def draft_check(self, draft, step="your-idea", **extra):
        return self.client.post(f"{BASE}/draft-check/", {"draft_id": str(draft.pk), "step": step, **extra}, format="json")


# -- off until a key ------------------------------------------------------------------------------


class HiddenWhenOffTests(AssistantTestCase):
    def assert_everything_hidden(self, fake):
        submission = self.idea("Hidden idea", owner=self.innovator)
        self.as_user(self.innovator)
        self.assertEqual(data(self.client.get(f"{BASE}/status/")), {"available": False, "features": {"draft_check": False, "hints": False, "related": False, "help": False, "web_chat": False}, "guests_can_ask": False})
        self.assertEqual(data(self.draft_check(self.draft(self.innovator))), {"available": False})
        self.assertEqual(data(self.client.post(f"{BASE}/help/", {"question": "How do I edit?"}, format="json")), {"available": False})
        self.as_user(self.officer)
        self.assertEqual(data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/")), {"available": False})
        self.assertEqual(data(self.client.get(f"{BASE}/submissions/{submission.pk}/related/")), {"available": False})
        self.assertEqual(fake.calls, [])

    def test_switch_off_hides_everything(self):
        fake = self.fake(message(HINTS_ANSWER))
        self.connect()
        set_features(self, ai_helper=False)
        self.assert_everything_hidden(fake)

    def test_no_connection_hides_everything(self):
        fake = self.fake(message(HINTS_ANSWER))
        set_features(self, ai_helper=True)
        self.assert_everything_hidden(fake)

    def test_monthly_limit_reached_hides_everything_and_is_recorded(self):
        fake = self.fake(message(HINTS_ANSWER))
        self.switch_on(limit=1)
        UsageRecord.objects.create(feature="hints", model="claude-opus-5-5", cost_usd=Decimal("1.00"))
        self.assert_everything_hidden(fake)
        self.assertTrue(UsageRecord.objects.filter(outcome="limit_reached").exists())

    def test_one_feature_switched_off_hides_only_that_feature(self):
        self.fake(message(HINTS_ANSWER))
        self.switch_on(feature_hints=False)
        status = data(self.client.get(f"{BASE}/status/"))
        self.assertFalse(status["features"]["hints"])
        self.assertTrue(status["features"]["draft_check"])
        self.as_user(self.officer)
        self.assertEqual(data(self.client.get(f"{BASE}/submissions/{self.idea('X').pk}/hints/")), {"available": False})

    def test_timeout_and_refused_key_hide_quietly(self):
        timeout = anthropic.APITimeoutError(request=httpx2.Request("POST", "https://api.anthropic.com/v1/messages"))
        self.fake(timeout)
        self.switch_on()
        self.as_user(self.innovator)
        response = self.draft_check(self.draft(self.innovator))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data(response), {"available": False})
        self.assertEqual(UsageRecord.objects.latest("created_at").outcome, "timeout")

        self.fake(http_error(anthropic.AuthenticationError, 401))
        self.assertEqual(data(self.draft_check(self.draft(self.innovator))), {"available": False})
        self.assertEqual(UsageRecord.objects.latest("created_at").outcome, "key_refused")

    def test_busy_is_retried_then_answers(self):
        fake = self.fake(http_error(anthropic.OverloadedError, 529), message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        with patch("apps.assistant.client.time.sleep"):
            response = self.draft_check(self.draft(self.innovator))
        self.assertTrue(data(response)["available"])
        self.assertEqual(len(fake.calls), 2)

    def test_refusal_hides(self):
        self.fake(message({}, stop_reason="refusal"))
        self.switch_on()
        self.as_user(self.innovator)
        self.assertEqual(data(self.draft_check(self.draft(self.innovator))), {"available": False})
        self.assertEqual(UsageRecord.objects.latest("created_at").outcome, "refused")

    def test_feature_switch_reaches_public_config(self):
        set_features(self, ai_helper=True)
        features = data(self.client.get("/api/platform/public-config/"))["features"]
        self.assertTrue(features["ai_helper"])


# -- innovator guidance ---------------------------------------------------------------------------


class DraftCheckTests(AssistantTestCase):
    def test_owner_gets_sections_and_request_is_shaped_right(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        KnowledgeEntry.objects.create(title="Jobs", audience="innovators", text=GUIDANCE)
        self.as_user(self.innovator)
        response = self.draft_check(self.draft(self.innovator), answers={"who_benefits": "Small farmers"})
        self.assertEqual(response.status_code, 200, response.content)
        result = data(response)
        self.assertTrue(result["available"])
        self.assertEqual(result["unclear"][0]["quote"], "We will do things.")
        self.assertEqual(len(result["officer_questions"]), 3)
        self.assertEqual([item["field_key"] for item in result["missing"]], ["who_benefits", ""])
        self.assertIn("You decide", result["note"])

        request = fake.last
        self.assertEqual(request["thinking"], {"type": "adaptive"})
        self.assertNotIn("budget_tokens", json.dumps(request))
        self.assertEqual(request["output_config"]["format"]["type"], "json_schema")
        self.assertEqual(request["system"][0]["cache_control"], {"type": "ephemeral"})
        self.assertIn(GUIDANCE, request["system"][0]["text"])
        self.assertIn("Small farmers", request["messages"][0]["content"])
        self.assertNotIn(API_KEY, json.dumps(request["system"]) + request["messages"][0]["content"])

    def test_guidance_change_changes_the_next_system_prompt(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        draft = self.draft(self.innovator)
        self.draft_check(draft)
        self.assertNotIn(GUIDANCE, fake.system_text())
        self.as_user(self.admin)
        self.assertEqual(self.client.post(f"{BASE}/admin/knowledge/", {"title": "Jobs", "audience": "innovators", "text": GUIDANCE}, format="json").status_code, 201)
        self.as_user(self.innovator)
        self.draft_check(draft)
        self.assertIn(GUIDANCE, fake.system_text())

    def test_officer_only_guidance_is_not_sent_for_innovators(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        KnowledgeEntry.objects.create(title="Internal", audience="officers", text="Watch for copied business plans")
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator))
        self.assertNotIn("copied business plans", fake.system_text())

    def test_sensitive_answers_are_never_sent(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator, contact_number="+26771234567", last_name="Molefe"), step="about-you")
        content = fake.last["messages"][0]["content"]
        self.assertNotIn("+26771234567", content)
        self.assertNotIn("Neo", content)
        self.assertNotIn("Molefe", content)

    def test_only_the_owner_or_the_guest_token_may_check(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        draft = self.draft(self.innovator)
        self.as_user(self.other_innovator)
        self.assertEqual(self.draft_check(draft).status_code, 404)
        self.client.force_authenticate(None)
        self.assertEqual(self.draft_check(draft).status_code, 404)
        self.assertEqual(fake.calls, [])

        guest_draft = self.draft(None)
        token = DraftTokenService.issue(guest_draft)
        response = self.client.post(f"{BASE}/draft-check/", {"draft_id": str(guest_draft.pk), "step": "your-idea"}, format="json", HTTP_X_DRAFT_TOKEN=token)
        self.assertTrue(data(response)["available"])
        response = self.client.post(f"{BASE}/draft-check/", {"draft_id": str(draft.pk), "step": "your-idea"}, format="json", HTTP_X_DRAFT_TOKEN=token)
        self.assertEqual(response.status_code, 404)

    def test_unknown_step_is_a_validation_error(self):
        self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        response = self.draft_check(self.draft(self.innovator), step="no-such-step")
        self.assertEqual(response.status_code, 400)
        self.assertIn("step", response.json()["errors"])

    def test_bad_request_is_a_validation_error(self):
        self.as_user(self.innovator)
        self.assertEqual(self.client.post(f"{BASE}/draft-check/", {"step": "your-idea"}, format="json").status_code, 400)


# -- officer hints and related ideas --------------------------------------------------------------


class HintsTests(AssistantTestCase):
    def test_officer_gets_labelled_hints_cached_until_the_submission_changes(self):
        fake = self.fake(message(HINTS_ANSWER))
        self.switch_on()
        submission = self.idea("Solar fridge", owner=self.innovator, answer="A fridge that runs on sun.")
        self.as_user(self.officer)
        first = data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/"))
        self.assertEqual(first["label"], "Suggestion from the AI helper")
        self.assertEqual(first["next_step"], "Ask for a budget.")
        self.assertFalse(first["cached"])
        self.assertNotIn("+26771234567", fake.last["messages"][0]["content"])
        self.assertTrue(data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/"))["cached"])
        self.assertEqual(len(fake.calls), 1)

        SubmissionResponse.objects.filter(submission=submission, field_key_snapshot="solution").update(value="A fridge and a cold room.")
        self.assertFalse(data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/"))["cached"])
        self.assertEqual(len(fake.calls), 2)

    def test_people_without_the_capability_are_refused(self):
        self.fake(message(HINTS_ANSWER))
        self.switch_on()
        submission = self.idea("Mine", owner=self.innovator)
        self.as_user(self.innovator)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/").status_code, 403)
        judge = self.person("c3-judge@example.com", RoleType.JUDGE)
        self.as_user(judge)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/related/").status_code, 403)

    def test_staff_who_cannot_open_the_submission_get_404(self):
        self.fake(message(HINTS_ANSWER))
        self.switch_on()
        judge = self.person("c3-judge2@example.com", RoleType.JUDGE)
        RoleCapability.objects.create(role=Role.objects.get(code=RoleType.JUDGE), capability="assistant.hints")
        capabilities.clear_cache()
        submission = self.idea("Not assigned", owner=self.innovator)
        self.as_user(judge)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/").status_code, 404)


class RelatedTests(AssistantTestCase):
    def test_related_ideas_never_include_submissions_the_officer_cannot_see(self):
        judge = self.person("c3-judge3@example.com", RoleType.JUDGE)
        RoleCapability.objects.create(role=Role.objects.get(code=RoleType.JUDGE), capability="assistant.hints")
        capabilities.clear_cache()
        main = self.idea("Sorghum flour mill", owner=self.innovator, sector=self.sector, answer="We mill sorghum into flour.")
        seen = self.idea("Sorghum farming cooperative", owner=self.other_innovator, sector=self.sector, answer="We grow sorghum for mills.")
        hidden = self.idea("Sorghum flour mill and bakery", owner=self.person("c3-third@example.com"), sector=self.sector, answer="We mill sorghum flour.")
        for submission in (main, seen):
            Assignment.objects.create(submission=submission, assignee=judge, role_type="judge")

        def answer(kwargs):
            return message({"items": [
                {"id": str(seen.pk), "relation": "complementary", "why": "One grows sorghum, the other mills it."},
                {"id": str(hidden.pk), "relation": "similar", "why": "Same mill."},
            ]})

        fake = self.fake(answer)
        self.switch_on()
        self.as_user(judge)
        result = data(self.client.get(f"{BASE}/submissions/{main.pk}/related/"))
        self.assertTrue(result["available"])
        self.assertEqual([item["id"] for item in result["complementary"]], [str(seen.pk)])
        self.assertEqual(result["similar"], [])
        self.assertNotIn(str(hidden.pk), fake.last["messages"][0]["content"])
        self.assertNotIn("Bakery", json.dumps(result))

        # A full-access officer sees both, from the database shortlist.
        self.as_user(self.officer)
        result = data(self.client.get(f"{BASE}/submissions/{main.pk}/related/?refresh=true"))
        self.assertEqual([item["id"] for item in result["similar"]], [str(hidden.pk)])
        self.assertIn(str(hidden.pk), fake.last["messages"][0]["content"])


# -- introductions --------------------------------------------------------------------------------


class IntroductionTests(AssistantTestCase):
    def setUp(self):
        super().setUp()
        self.mine = self.idea("Sorghum flour mill", owner=self.innovator)
        self.theirs = self.idea("Sorghum farm", owner=self.other_innovator)

    def suggest(self):
        self.as_user(self.officer)
        response = self.client.post(
            f"{BASE}/submissions/{self.mine.pk}/introductions/",
            {"other_submission": str(self.theirs.pk), "kind": "complementary", "reason": "One grows sorghum and the other mills it."},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return Introduction.objects.get(pk=data(response)["id"])

    def answer(self, user, intro, agree):
        self.as_user(user)
        return self.client.post(f"{BASE}/introductions/{intro.pk}/answer/", {"agree": agree}, format="json")

    def test_details_are_shared_only_when_both_say_yes(self):
        intro = self.suggest()
        self.assertEqual(Notification.objects.filter(notification_type="introduction").count(), 2)
        self.assertFalse(Notification.objects.filter(recipient=self.innovator, body__icontains=self.other_innovator.email).exists())

        first = data(self.answer(self.innovator, intro, True))
        self.assertEqual(first["status"], "waiting")
        self.assertIsNone(first["other"])
        self.as_user(self.other_innovator)
        self.assertIsNone(data(self.client.get(f"{BASE}/introductions/"))[0]["other"])

        second = data(self.answer(self.other_innovator, intro, True))
        self.assertEqual(second["status"], "agreed")
        self.assertEqual(second["other"]["email"], self.innovator.email)
        self.assertTrue(Notification.objects.filter(recipient=self.innovator, body__icontains=self.other_innovator.email).exists())
        self.assertTrue(AuditLog.objects.filter(action_type="introduction_answered").exists())

    def test_a_no_declines_and_shares_nothing(self):
        intro = self.suggest()
        self.answer(self.innovator, intro, True)
        result = data(self.answer(self.other_innovator, intro, False))
        self.assertEqual(result["status"], "declined")
        self.as_user(self.innovator)
        self.assertIsNone(data(self.client.get(f"{BASE}/introductions/"))[0]["other"])
        self.assertEqual(self.answer(self.innovator, intro, True).status_code, 400)

    def test_strangers_cannot_answer_and_innovators_cannot_suggest(self):
        intro = self.suggest()
        stranger = self.person("c3-stranger@example.com", RoleType.INNOVATOR)
        self.assertEqual(self.answer(stranger, intro, True).status_code, 404)
        self.as_user(self.innovator)
        response = self.client.post(f"{BASE}/submissions/{self.mine.pk}/introductions/", {"other_submission": str(self.theirs.pk), "reason": "x"}, format="json")
        self.assertEqual(response.status_code, 403)

    def test_guest_ideas_and_duplicates_are_refused(self):
        guest = self.idea("Guest idea", owner=None)
        self.as_user(self.officer)
        response = self.client.post(f"{BASE}/submissions/{self.mine.pk}/introductions/", {"other_submission": str(guest.pk), "reason": "x"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.suggest()
        response = self.client.post(f"{BASE}/submissions/{self.theirs.pk}/introductions/", {"other_submission": str(self.mine.pk), "reason": "again"}, format="json")
        self.assertEqual(response.status_code, 400)


# -- help -----------------------------------------------------------------------------------------


class HelpTests(AssistantTestCase):
    def manual(self):
        page = ManualPage.objects.create(title="Edit an idea", text="Open My ideas, choose the idea, press Edit.", portal_path="/dashboard")
        from apps.media_library.models import MediaAsset

        asset = MediaAsset.objects.create(kind="image", mime_type="image/png", file="media/test.png", width=1440, height=900)
        shot = ManualScreenshot.objects.create(page=page, asset=asset, caption={"en": "The Edit button", "tn": "Konopo ya Fetola"})
        return page, shot

    def test_answer_shows_manual_screenshots(self):
        page, shot = self.manual()
        fake = self.fake(message({**HELP_ANSWER, "page_ids": [str(page.pk)], "screenshot_ids": [str(shot.pk), "not-an-id"]}))
        self.switch_on()
        self.as_user(self.innovator)
        result = data(self.client.post(f"{BASE}/help/", {"question": "How do I edit my idea?"}, format="json"))
        self.assertTrue(result["available"])
        self.assertFalse(result["handed_over"])
        self.assertEqual(result["screenshots"][0]["id"], str(shot.pk))
        self.assertEqual(result["screenshots"][0]["caption"], "The Edit button")
        self.assertEqual(result["pages"][0]["portal_path"], "/dashboard")
        self.assertIn(f"Screenshot {shot.pk}", fake.system_text())

    def test_hands_over_when_asked_or_unsure(self):
        self.fake(message({**HELP_ANSWER, "confident": False}))
        self.switch_on()
        self.as_user(self.innovator)
        with patch("apps.assistant.services.open_handoff", return_value=SimpleNamespace(pk="conv-1")) as handoff:
            unsure = data(self.client.post(f"{BASE}/help/", {"question": "Why was my idea turned down?"}, format="json"))
            direct = data(self.client.post(f"{BASE}/help/", {"question": "I want a person", "handoff": True}, format="json"))
        self.assertTrue(unsure["handed_over"])
        self.assertTrue(direct["handed_over"])
        self.assertEqual(handoff.call_count, 2)
        kwargs = handoff.call_args_list[0].kwargs
        self.assertEqual(kwargs["channel"], "ai")
        self.assertEqual(kwargs["contact"]["user_id"], str(self.innovator.pk))
        self.assertEqual([line["from"] for line in kwargs["transcript"]], ["person", "bot"])

    def test_handoff_stub_records_the_request_when_c1_is_not_merged(self):
        from apps.assistant import handoff

        if not getattr(handoff.open_handoff, "__module__", "").startswith("apps.assistant"):
            self.skipTest("C1 is merged; its own tests cover open_handoff.")
        self.as_user(self.innovator)
        result = data(self.client.post(f"{BASE}/help/", {"question": "Call me please", "handoff": True}, format="json"))
        self.assertTrue(result["handed_over"])
        self.assertTrue(AuditLog.objects.filter(action_type="handoff_requested", metadata__channel="ai").exists())

    def test_guests_only_when_the_admin_allows(self):
        fake = self.fake(message(HELP_ANSWER))
        self.switch_on()
        self.assertEqual(data(self.client.post(f"{BASE}/help/", {"question": "How do I start?"}, format="json")), {"available": False})
        self.assertFalse(data(self.client.get(f"{BASE}/status/"))["guests_can_ask"])
        IntegrationConnection.objects.filter(kind="ai").update(config={"model": "claude-opus-5-5", "monthly_limit_usd": 50, "allow_guests_help": True})
        reset_platform_caches(self)
        self.assertTrue(data(self.client.post(f"{BASE}/help/", {"question": "How do I start?"}, format="json"))["available"])
        self.assertTrue(data(self.client.get(f"{BASE}/status/"))["guests_can_ask"])
        self.assertIsNone(fake.last.get("thinking", {}).get("budget_tokens"))

    def test_empty_question_is_a_validation_error(self):
        self.as_user(self.innovator)
        self.assertEqual(self.client.post(f"{BASE}/help/", {"question": ""}, format="json").status_code, 400)


# -- usage, cost and the limit --------------------------------------------------------------------


class UsageTests(AssistantTestCase):
    def test_usage_and_cost_are_recorded_and_audited(self):
        self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator))
        record = UsageRecord.objects.get(outcome="ok")
        self.assertEqual((record.feature, record.user, record.input_tokens, record.output_tokens, record.cache_read_tokens, record.cache_write_tokens), ("draft_check", self.innovator, 1000, 500, 2000, 100))
        # 1000 x $4 + 500 x $20 + 2000 x $0.20 + 100 x $5, per million tokens.
        self.assertEqual(record.cost_usd, Decimal("0.014900"))
        self.assertEqual(cost_usd("claude-opus-5-5", input_tokens=1000, output_tokens=500, cache_read=2000, cache_write=100), Decimal("0.0149"))
        audit = AuditLog.objects.get(action_type="assistant_call")
        self.assertEqual(audit.actor, self.innovator)
        self.assertEqual(audit.metadata["feature"], "draft_check")

    def test_spending_stops_at_the_limit(self):
        expensive = SimpleNamespace(input_tokens=0, output_tokens=60_000, cache_read_input_tokens=0, cache_creation_input_tokens=0)  # $1.20
        fake = self.fake(message(DRAFT_ANSWER, usage=expensive))
        self.switch_on(limit=1)
        self.as_user(self.innovator)
        draft = self.draft(self.innovator)
        self.assertTrue(data(self.draft_check(draft))["available"])
        self.assertEqual(data(self.draft_check(draft)), {"available": False})
        self.assertEqual(len(fake.calls), 1)

    def test_usage_report(self):
        self.fake(message(DRAFT_ANSWER))
        self.switch_on(limit=10)
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator))
        self.as_user(self.admin)
        report = data(self.client.get(f"{BASE}/admin/usage/"))
        self.assertEqual(report["month"]["limit_usd"], "10")
        self.assertEqual(report["month"]["spend_usd"], "0.01")
        self.assertEqual(report["by_feature"][0]["feature"], "draft_check")
        self.assertEqual(report["by_feature"][0]["calls"], 1)
        self.assertEqual(self.client.get(f"{BASE}/admin/usage/?days=0").status_code, 400)


# -- admin ----------------------------------------------------------------------------------------


class AdminTests(AssistantTestCase):
    def test_admin_endpoints_need_assistant_manage(self):
        self.as_user(self.officer)
        for path in ("overview", "usage", "knowledge", "manual-pages"):
            self.assertEqual(self.client.get(f"{BASE}/admin/{path}/").status_code, 403, path)
        self.assertEqual(self.client.post(f"{BASE}/admin/try/", {"feature": "help", "text": "x"}, format="json").status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(f"{BASE}/admin/overview/").status_code, (401, 403))

    def test_overview_says_waiting_for_a_key(self):
        self.as_user(self.admin)
        overview = data(self.client.get(f"{BASE}/admin/overview/"))
        self.assertEqual(overview["state"], "waiting_for_key")
        self.assertIn("Never sent", overview["privacy_note"])
        self.assertIn("Ga go ke go romelwa", data(self.client.get(f"{BASE}/admin/overview/?lang=tn"))["privacy_note"])

    def test_settings_keep_the_connection_active_and_are_audited(self):
        connection = self.switch_on()
        self.as_user(self.admin)
        response = self.client.patch(f"{BASE}/admin/settings/", {"feature_related": False, "monthly_limit_usd": "25.50", "helper_on": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        connection.refresh_from_db()
        self.assertTrue(connection.is_active)
        self.assertEqual(connection.config["monthly_limit_usd"], 25.5)
        self.assertFalse(data(response)["status"]["features"]["related"])
        self.assertTrue(AuditLog.objects.filter(action_type="assistant_settings_updated").exists())
        self.assertEqual(self.client.patch(f"{BASE}/admin/settings/", {"timeout_seconds": 1}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"{BASE}/admin/settings/", {}, format="json").status_code, 400)

    def test_knowledge_and_manual_crud_is_audited(self):
        self.as_user(self.admin)
        entry = data(self.client.post(f"{BASE}/admin/knowledge/", {"title": "Jobs", "text": GUIDANCE, "audience": "innovators"}, format="json"))
        self.assertEqual(self.client.patch(f"{BASE}/admin/knowledge/{entry['id']}/", {"is_active": False}, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"{BASE}/admin/knowledge/", {"title": "Bad", "text": "x", "audience": "aliens"}, format="json").status_code, 400)
        second = data(self.client.post(f"{BASE}/admin/knowledge/", {"title": "Two", "text": "y"}, format="json"))
        self.assertEqual(self.client.post(f"{BASE}/admin/knowledge/reorder/", {"ids": [second["id"], entry["id"]]}, format="json").status_code, 200)
        self.assertEqual(KnowledgeEntry.objects.get(pk=second["id"]).ordering, 0)
        self.assertEqual(self.client.delete(f"{BASE}/admin/knowledge/{entry['id']}/").status_code, 200)

        page = data(self.client.post(f"{BASE}/admin/manual-pages/", {"title": "Edit an idea", "text": "Press Edit.", "portal_path": "/dashboard"}, format="json"))
        actions = set(AuditLog.objects.values_list("action_type", flat=True))
        self.assertTrue({"assistant_knowledge_saved", "assistant_knowledge_deleted", "assistant_manual_saved"} <= actions)
        self.assertEqual(self.client.get(f"{BASE}/admin/manual-pages/").json()["data"][0]["id"], page["id"])

    def test_screenshot_upload_goes_to_the_media_library(self):
        import io

        from PIL import Image

        buffer = io.BytesIO()
        Image.new("RGB", (40, 30), "white").save(buffer, format="PNG")
        upload = SimpleUploadedFile("edit.png", buffer.getvalue(), content_type="image/png")
        page = ManualPage.objects.create(title="Edit", text="Press Edit.")
        self.as_user(self.admin)
        response = self.client.post(f"{BASE}/admin/manual-pages/{page.pk}/screenshots/", {"file": upload, "caption_en": "The button", "caption_tn": "Konopo"}, format="multipart")
        self.assertEqual(response.status_code, 201, response.content)
        shot = ManualScreenshot.objects.get(pk=data(response)["id"])
        self.assertEqual(shot.asset.width, 40)
        self.assertEqual(shot.caption, {"en": "The button", "tn": "Konopo"})
        self.assertEqual(self.client.patch(f"{BASE}/admin/screenshots/{shot.pk}/", {"caption": {"en": "Edit button"}}, format="json").status_code, 200)
        self.assertEqual(self.client.post(f"{BASE}/admin/manual-pages/{page.pk}/screenshots/", {"caption_en": "no file"}, format="multipart").status_code, 400)

    def test_try_it_uses_unsaved_guidance_and_works_with_the_feature_off(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on(feature_draft_check=False)
        self.as_user(self.admin)
        response = self.client.post(f"{BASE}/admin/try/", {"feature": "draft_check", "text": "We sell solar fridges.", "guidance": GUIDANCE}, format="json")
        self.assertTrue(data(response)["available"], response.content)
        self.assertIn(GUIDANCE, fake.system_text())
        self.assertFalse(KnowledgeEntry.objects.exists())
        self.assertEqual(UsageRecord.objects.get(outcome="ok").feature, "try_it")
        self.assertEqual(self.client.post(f"{BASE}/admin/try/", {"feature": "related", "text": "x"}, format="json").status_code, 400)

    def test_try_it_tells_the_admin_why_it_cannot_answer(self):
        set_features(self, ai_helper=True)
        self.as_user(self.admin)
        self.assertEqual(data(self.client.post(f"{BASE}/admin/try/", {"feature": "help", "text": "x"}, format="json")), {"available": False, "reason": "no_connection"})


# -- the connection in Platform settings ----------------------------------------------------------


class ConnectionTests(AssistantTestCase):
    def test_add_test_and_activate_with_the_key_never_returned(self):
        fake = self.fake(message({}, model="claude-opus-5-5"))
        self.as_user(self.admin)
        providers = data(self.client.get("/api/platform/providers/?kind=ai"))
        self.assertEqual([p["key"] for p in providers], ["anthropic"])
        response = self.client.post(
            "/api/platform/integrations/",
            {"kind": "ai", "provider": "anthropic", "name": "Claude", "config": {"model": "claude-haiku-5-5", "monthly_limit_usd": 20}, "secrets": {"api_key": API_KEY}},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertNotIn(API_KEY, response.content.decode())
        connection_id = data(response)["id"]
        report = data(self.client.post(f"/api/platform/integrations/{connection_id}/test/", {}, format="json"))["result"]
        self.assertTrue(report["ok"], report)
        self.assertIn("Connected", json.dumps(report))
        self.assertEqual(fake.last["model"], "claude-haiku-5-5")
        self.assertEqual(self.client.post(f"/api/platform/integrations/{connection_id}/activate/", {}, format="json").status_code, 200)
        self.assertNotIn(API_KEY, self.client.get(f"/api/platform/integrations/{connection_id}/").content.decode())
        self.assertEqual(UsageRecord.objects.get().feature, "connection_test")

    def test_a_refused_key_shows_the_plain_error(self):
        self.fake(http_error(anthropic.AuthenticationError, 401))
        connection = self.connect()
        IntegrationConnection.objects.filter(pk=connection.pk).update(is_active=False, status="draft")
        self.as_user(self.admin)
        report = data(self.client.post(f"/api/platform/integrations/{connection.pk}/test/", {}, format="json"))["result"]
        self.assertFalse(report["ok"])
        self.assertIn("refused the API key", json.dumps(report))

    def test_bad_settings_are_refused(self):
        self.as_user(self.admin)
        response = self.client.post(
            "/api/platform/integrations/",
            {"kind": "ai", "provider": "anthropic", "name": "Claude", "config": {"model": "gpt-4", "timeout_seconds": 500}, "secrets": {"api_key": API_KEY}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_status_never_fails_even_when_the_connection_is_broken(self):
        set_features(self, ai_helper=True)
        IntegrationConnection.objects.create(kind="ai", provider="anthropic", name="Broken", config={}, secrets_encrypted="not-a-token", status="active", is_active=True)
        reset_platform_caches(self)
        self.assertIsNone(AssistantClient.runtime())
        response = self.client.get(f"{BASE}/status/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(data(response)["available"])
