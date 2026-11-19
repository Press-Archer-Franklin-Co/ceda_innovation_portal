"""B2: guest quick start, resume tokens, claim, one step at a time, consent and submit, timeline."""
import re
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.communications.senders import LocMemMessageSender
from apps.core.constants import AssignmentRoleType, RoleType
from apps.platform_config.testing import set_features
from apps.programs.form_builder import FormDocumentService, FormPublishService
from apps.programs.form_schema import build_form_schema
from apps.programs.models import FormVersion, Program, ProgramStage
from apps.reference.models import Sector
from apps.submissions.models import ApplicationDraft, ConsentRecord, Submission

QUICK_START_URL = "/api/drafts/quick-start/"
OTP_REQUEST_URL = "/api/auth/otp/request/"
OTP_VERIFY_URL = "/api/auth/otp/verify/"
CODE = "123456"
PHONE = "+26771234567"
REFERENCE_PATTERN = re.compile(r"^CEDA-IP-\d{4}-\d{5}$")
LOCMEM_SENDERS = {"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""}

IDEA_ANSWERS = {"problem": "Farmers lose milk because it spoils before market.", "solution": "Solar-powered cooling at collection points."}
ABOUT_YOU = {"first_name": "Neo", "last_name": "Kebadile"}


def error_code(response):
    errors = response.json().get("errors") or {}
    code = errors.get("code") if isinstance(errors, dict) else None
    if code is None and isinstance(errors, dict):
        for value in errors.values():
            if isinstance(value, dict) and "code" in value:
                code = value["code"]
                break
    return code[0] if isinstance(code, list) else code


@override_settings(MESSAGE_SENDERS=LOCMEM_SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms")
class IdeaIntakeApiTests(TestCase):
    def setUp(self):
        cache.clear()
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        set_features(self, guest_quick_start=True, code_sign_in=True, sms_messages=True)
        self.client = APIClient()
        self.sector = Sector.objects.filter(active=True).order_by("ordering").first()
        patcher = patch("apps.accounts.otp_services.OTPService._generate_code", return_value=CODE)
        patcher.start()
        self.addCleanup(patcher.stop)

    # helpers ------------------------------------------------------------------

    def quick_start(self, title="Cold milk for farmers"):
        response = self.client.post(QUICK_START_URL, {"title": title, "sector": str(self.sector.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        data = response.json()["data"]
        return data["draft_id"], data["resume_token"]

    def as_guest(self, method, url, token, data=None):
        return getattr(self.client, method)(url, data or {}, format="json", HTTP_X_DRAFT_TOKEN=token)

    def fill_all_steps(self, draft_id, token=None):
        for code, answers in (("your-idea", IDEA_ANSWERS), ("about-you", ABOUT_YOU)):
            url = f"/api/drafts/{draft_id}/steps/{code}/"
            response = self.as_guest("put", url, token, {"answers": answers}) if token else self.client.put(url, {"answers": answers}, format="json")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()["data"]["errors"], {})

    def verify_phone_on_draft(self, draft_id, token):
        self.assertEqual(self.client.post(OTP_REQUEST_URL, {"phone": PHONE}, format="json").status_code, 200)
        response = self.as_guest("post", f"/api/drafts/{draft_id}/verify-phone/", token, {"phone": PHONE, "code": CODE})
        self.assertEqual(response.status_code, 200, response.content)

    # quick start ----------------------------------------------------------------

    def test_quick_start_creates_guest_draft_in_the_general_ideas_programme(self):
        draft_id, token = self.quick_start()
        second_id, _ = self.quick_start("Another idea")

        draft = ApplicationDraft.objects.get(id=draft_id)
        self.assertIsNone(draft.innovator)
        self.assertEqual(draft.sector, self.sector)
        self.assertTrue(draft.program.is_general_intake)
        self.assertTrue(draft.program.is_submission_open())
        self.assertTrue(token)
        self.assertEqual(Program.objects.filter(is_general_intake=True).count(), 1)
        self.assertEqual(ApplicationDraft.objects.get(id=second_id).program, draft.program)

    def test_quick_start_needs_title_and_sector(self):
        response = self.client.post(QUICK_START_URL, {"title": ""}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("sector", response.json()["errors"])

    def test_quick_start_is_off_when_the_feature_is_off(self):
        set_features(self, guest_quick_start=False)
        response = self.client.post(QUICK_START_URL, {"title": "x", "sector": str(self.sector.id)}, format="json")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(error_code(response), "feature_disabled")

    # resume token -----------------------------------------------------------------

    def test_guest_token_gives_access_to_its_own_draft_only(self):
        draft_id, token = self.quick_start()
        other_id, other_token = self.quick_start("Other")

        response = self.as_guest("patch", f"/api/drafts/{draft_id}/", token, {"title": "Cold milk, cheaper"})
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(ApplicationDraft.objects.get(id=draft_id).title, "Cold milk, cheaper")
        self.assertEqual(self.as_guest("get", f"/api/drafts/{draft_id}/", token).status_code, 200)

        wrong = self.as_guest("patch", f"/api/drafts/{draft_id}/", other_token, {"title": "Hijacked"})
        self.assertEqual(wrong.status_code, 403)
        self.assertEqual(error_code(wrong), "draft_token_invalid")
        forged = self.as_guest("patch", f"/api/drafts/{draft_id}/", token + "x", {"title": "Hijacked"})
        self.assertEqual(forged.status_code, 403)
        self.assertEqual(ApplicationDraft.objects.get(id=draft_id).title, "Cold milk, cheaper")

        anonymous = self.client.patch(f"/api/drafts/{draft_id}/", {"title": "Hijacked"}, format="json")
        self.assertEqual(anonymous.status_code, 401)
        self.assertEqual(self.as_guest("get", f"/api/drafts/{other_id}/", token).status_code, 403)

    def test_guest_token_expires(self):
        draft_id, token = self.quick_start()
        with override_settings(DRAFT_RESUME_TOKEN_MAX_AGE=-1):
            response = self.as_guest("get", f"/api/drafts/{draft_id}/", token)
        self.assertEqual(response.status_code, 403)

    def test_guest_cannot_list_or_delete_drafts(self):
        draft_id, token = self.quick_start()
        self.assertEqual(self.as_guest("get", "/api/drafts/", token).status_code, 401)
        self.assertEqual(self.as_guest("delete", f"/api/drafts/{draft_id}/", token).status_code, 401)

    # claim ------------------------------------------------------------------------

    def sign_in_with_phone(self):
        self.client.post(OTP_REQUEST_URL, {"phone": PHONE}, format="json")
        response = self.client.post(OTP_VERIFY_URL, {"phone": PHONE, "code": CODE}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        # The verify response is not wrapped in the envelope; it also starts a browser session.
        access = response.json()["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return User.objects.get(phone_number=PHONE)

    def test_visitor_quick_starts_verifies_phone_claims_and_submits(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        user = self.sign_in_with_phone()

        claim = self.as_guest("post", f"/api/drafts/{draft_id}/claim/", token)
        self.assertEqual(claim.status_code, 200, claim.content)
        self.assertEqual(ApplicationDraft.objects.get(id=draft_id).innovator, user)
        listed = self.client.get("/api/drafts/").json()
        listed = listed.get("results", listed) if isinstance(listed, dict) else listed
        self.assertIn(draft_id, [item["id"] for item in listed])

        # The token no longer opens the claimed draft for anyone else.
        stranger = APIClient()
        self.assertEqual(stranger.get(f"/api/drafts/{draft_id}/", HTTP_X_DRAFT_TOKEN=token).status_code, 403)

        response = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertRegex(data["reference"], REFERENCE_PATTERN)
        self.assertEqual(data["title"], "Cold milk for farmers")
        self.assertEqual(data["sector"]["id"], str(self.sector.id))
        self.assertTrue(data["next_steps"])
        self.assertEqual(data["copy_sent_to"]["channel"], "sms")
        self.assertNotEqual(data["copy_sent_to"]["to"], PHONE)
        submission = Submission.objects.get(reference_number=data["reference"])
        self.assertEqual(submission.innovator, user)
        self.assertEqual(submission.sector, self.sector)
        self.assertTrue(ConsentRecord.objects.filter(submission=submission, user=user).exists())

    def test_claim_needs_a_valid_token(self):
        draft_id, token = self.quick_start()
        _, other_token = self.quick_start("Other")
        user = self.sign_in_with_phone()
        self.assertEqual(self.client.post(f"/api/drafts/{draft_id}/claim/").status_code, 403)
        self.assertEqual(self.as_guest("post", f"/api/drafts/{draft_id}/claim/", other_token).status_code, 403)
        self.assertIsNone(ApplicationDraft.objects.get(id=draft_id).innovator)
        stranger = APIClient()
        self.assertEqual(stranger.post(f"/api/drafts/{draft_id}/claim/", HTTP_X_DRAFT_TOKEN=token).status_code, 401)
        self.assertTrue(user.pk)

    # one step at a time -------------------------------------------------------------

    def test_step_save_checks_only_that_step(self):
        draft_id, token = self.quick_start()
        url = f"/api/drafts/{draft_id}/steps/your-idea/"

        response = self.as_guest("put", url, token, {"answers": {"problem": IDEA_ANSWERS["problem"], "not_a_field": "x"}})
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertIn("saved_at", data)
        self.assertEqual(set(data["errors"]), {"solution", "not_a_field"})
        self.assertNotIn("first_name", data["errors"])  # another step: not checked here
        self.assertEqual(data["step_status"]["your-idea"], "in_progress")
        self.assertEqual(data["step_status"]["about-you"], "not_started")

        draft = ApplicationDraft.objects.get(id=draft_id)
        self.assertEqual(draft.draft_data["problem"], IDEA_ANSWERS["problem"])
        self.assertNotIn("not_a_field", draft.draft_data)
        self.assertEqual(draft.current_section_code, "your-idea")

        response = self.as_guest("put", url, token, {"answers": {"solution": IDEA_ANSWERS["solution"]}})
        data = response.json()["data"]
        self.assertEqual(data["errors"], {})
        self.assertEqual(data["step_status"]["your-idea"], "done")
        self.assertGreater(data["percent_complete"], 0)

        detail = self.as_guest("get", f"/api/drafts/{draft_id}/", token).json()
        self.assertEqual(detail["percent_complete"], data["percent_complete"])

        self.assertEqual(self.as_guest("put", f"/api/drafts/{draft_id}/steps/no-such-step/", token, {"answers": {}}).status_code, 404)

    # consent and guest submit -----------------------------------------------------------

    def test_submit_needs_consent(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)

        response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"create_account": False})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "consent_required")
        response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": False, "create_account": False})
        self.assertEqual(error_code(response), "consent_required")
        self.assertFalse(Submission.objects.exists())
        self.assertFalse(ConsentRecord.objects.exists())

    def test_guest_submit_needs_a_verified_phone(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True, "create_account": False})
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "phone_verification_required")

    def test_verify_phone_rejects_a_wrong_code(self):
        draft_id, token = self.quick_start()
        self.client.post(OTP_REQUEST_URL, {"phone": PHONE}, format="json")
        response = self.as_guest("post", f"/api/drafts/{draft_id}/verify-phone/", token, {"phone": PHONE, "code": "000000"})
        self.assertEqual(response.status_code, 400)
        self.assertIsNone(ApplicationDraft.objects.get(id=draft_id).guest_phone_verified_at)

    def test_guest_submit_without_an_account_keeps_only_name_and_phone(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)

        response = self.as_guest(
            "post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True, "create_account": False, "name": "Neo Kebadile"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertRegex(data["reference"], REFERENCE_PATTERN)
        self.assertTrue(data["is_guest"])
        self.assertIsNone(data["account"])
        self.assertEqual(data["copy_sent_to"]["channel"], "sms")

        submission = Submission.objects.get(reference_number=data["reference"])
        self.assertIsNone(submission.innovator)
        self.assertTrue(submission.is_guest)
        self.assertEqual(submission.guest_name, "Neo Kebadile")
        self.assertEqual(submission.guest_phone, PHONE)
        self.assertFalse(User.objects.filter(phone_number=PHONE).exists())
        consent = ConsentRecord.objects.get(submission=submission)
        self.assertIsNone(consent.user)
        self.assertEqual(consent.guest_phone, PHONE)
        self.assertTrue(consent.text_version)
        self.assertEqual(consent.ip_address, "127.0.0.1")
        self.assertTrue(any(data["reference"] in message.body for message in LocMemMessageSender.outbox))

        # The token is spent.
        self.assertEqual(self.as_guest("get", f"/api/drafts/{draft_id}/", token).status_code, 403)

    def test_guest_submit_with_create_account_makes_a_phone_account(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)

        response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True})
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["account"], {"created": True, "sign_in_with": "phone_code"})
        user = User.objects.get(phone_number=PHONE)
        self.assertTrue(user.phone_verified)
        self.assertEqual((user.first_name, user.last_name), ("Neo", "Kebadile"))
        submission = Submission.objects.get(reference_number=data["reference"])
        self.assertEqual(submission.innovator, user)
        self.assertFalse(submission.is_guest)

    def test_reference_numbers_count_up_within_the_year(self):
        references = []
        for title in ("First idea", "Second idea"):
            draft_id, token = self.quick_start(title)
            self.fill_all_steps(draft_id, token)
            self.verify_phone_on_draft(draft_id, token)
            response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True, "create_account": False})
            self.assertEqual(response.status_code, 200, response.content)
            references.append(response.json()["data"]["reference"])
        for reference in references:
            self.assertRegex(reference, REFERENCE_PATTERN)
        first, second = (int(reference.rsplit("-", 1)[1]) for reference in references)
        self.assertEqual(second, first + 1)
        self.assertEqual(references[0].split("-")[2], references[1].split("-")[2])

    # timeline ---------------------------------------------------------------------------

    def test_timeline_on_tracking_detail_and_public_tracking(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)
        data = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True}).json()["data"]
        submission = Submission.objects.get(reference_number=data["reference"])
        current_step = submission.workflow_instance.current_step
        ProgramStage.objects.create(
            program=submission.program,
            name=current_step.name,
            code=current_step.code,
            ordering=1,
            explanation="We check your idea is complete.",
            usual_duration="1 to 2 weeks",
        )
        officer = User.objects.create_user(email="officer.b2@example.com", password="x", first_name="Kagiso", last_name="Molefe")
        RoleService.assign_roles(officer, [RoleType.INNOVATION_OFFICER])
        Assignment.objects.create(submission=submission, workflow_step=current_step, assignee=officer, role_type=AssignmentRoleType.OFFICER)

        self.client.force_authenticate(submission.innovator)
        detail = self.client.get(f"/api/submissions/{submission.id}/tracking-detail/")
        self.assertEqual(detail.status_code, 200, detail.content)
        stages = detail.json()["data"]["timeline"]["stages"]
        self.assertEqual(stages[0]["code"], "submitted")
        self.assertEqual(stages[0]["status"], "done")
        current = next(stage for stage in stages if stage["status"] == "current")
        self.assertEqual(current["code"], current_step.code)
        self.assertEqual(current["usual_duration"], "1 to 2 weeks")
        self.assertEqual(current["explanation"], "We check your idea is complete.")
        self.assertEqual(current["officer"], "Kagiso M.")
        self.assertTrue(current["reached_at"])
        self.assertTrue(all(stage["status"] == "upcoming" for stage in stages[stages.index(current) + 1 :]))

        self.client.force_authenticate(None)
        public = self.client.get(f"/api/track/{submission.reference_number}/")
        self.assertEqual(public.status_code, 200)
        public_stages = public.json()["timeline"]["stages"]
        self.assertEqual([s["code"] for s in public_stages], [s["code"] for s in stages])
        self.assertTrue(all("officer" not in stage for stage in public_stages))
        self.assertNotIn("Kagiso", public.content.decode())

    # B4 / R-1 ---------------------------------------------------------------------

    def test_submit_takes_first_and_last_name_and_returns_first_name(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)
        response = self.as_guest(
            "post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True, "first_name": "Lesedi", "last_name": "Mosweu Kgari"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["first_name"], "Lesedi")
        user = User.objects.get(phone_number=PHONE)
        self.assertEqual((user.first_name, user.last_name), ("Lesedi", "Mosweu Kgari"))

    def test_guest_without_account_gets_first_name_back(self):
        draft_id, token = self.quick_start()
        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)
        response = self.as_guest(
            "post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True, "create_account": False, "first_name": "Neo", "last_name": "Kebadile"}
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["first_name"], "Neo")
        self.assertEqual(Submission.objects.get(reference_number=response.json()["data"]["reference"]).guest_name, "Neo Kebadile")

    # B4: published form versions ---------------------------------------------------------

    def test_draft_names_its_form_and_a_submission_keeps_its_version_after_a_new_publish(self):
        draft_id, token = self.quick_start()
        form = Program.objects.get(is_general_intake=True).form
        first = FormVersion.objects.get(form=form)
        body = self.as_guest("get", f"/api/drafts/{draft_id}/", token).json()
        draft = body.get("data", body)
        self.assertEqual((draft["form_id"], draft["form_version_id"]), (str(form.id), str(first.id)))

        self.fill_all_steps(draft_id, token)
        self.verify_phone_on_draft(draft_id, token)
        response = self.as_guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": True})
        self.assertEqual(response.status_code, 200, response.content)
        submission = Submission.objects.get(reference_number=response.json()["data"]["reference"])
        self.assertEqual((submission.form_version_id, submission.form_version_number), (first.id, 1))

        # Staff change the form and publish version 2: the submission still points at version 1.
        form.languages = ["en"]
        form.save()
        document = build_form_schema(form)
        document["steps"][0]["title"] = {"en": "Tell us your idea"}
        FormDocumentService.save_document(form, document)
        second, problems = FormPublishService.publish(form, actor=None)
        self.assertEqual(problems, [])
        self.assertEqual(second.number, 2)
        submission.refresh_from_db()
        self.assertEqual((submission.form_version_id, submission.form_version_number), (first.id, 1))
        self.assertNotEqual(first.schema["steps"][0]["title"]["en"], "Tell us your idea")
