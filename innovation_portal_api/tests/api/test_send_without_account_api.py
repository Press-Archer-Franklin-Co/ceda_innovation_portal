"""23 Nov: a signed-out visitor sends a General idea without an account, with an email or a phone (one is enough).

A code is needed only to make an account, or while "Confirm a guest's phone or email with a code" is on.
"""
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog
from apps.communications.senders import LocMemMessageSender
from apps.core.constants import ProgramTypeCode, RoleType
from apps.platform_config.testing import set_features
from apps.programs.models import Program, ProgramType
from apps.reference.models import Sector
from apps.submissions.models import Submission
from tests.api.form_helpers import published_form

CODE = "123456"
LOCMEM_SENDERS = {"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""}


def data(response):
    body = response.json()
    return body.get("data", body)


def error_code(response):
    text = response.content.decode()
    for code in ("contact_required", "email_verification_required", "phone_verification_required", "account_required", "consent_required"):
        if code in text:
            return code
    return None


@override_settings(MESSAGE_SENDERS=LOCMEM_SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms", EMAIL_BACKEND="django.core.mail.backends.locmem.EmailBackend")
class SendWithoutAccountTests(TestCase):
    def setUp(self):
        cache.clear()
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        set_features(self, guest_quick_start=True, code_sign_in=True, sms_messages=False, quick_start_basics_only=True, guest_contact_code=False)
        self.client = APIClient()
        self.sector = Sector.objects.filter(active=True).order_by("ordering").first()
        patcher = patch("apps.accounts.otp_services.OTPService._generate_code", return_value=CODE)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.addCleanup(cache.clear)  # leave no sign-in throttle counts for the next test file

    def start(self, program_id=None):
        body = {"title": "Cold milk for farmers", "sector": str(self.sector.id), **({"program_id": str(program_id)} if program_id else {})}
        response = self.client.post("/api/drafts/quick-start/", body, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        draft_id, token = data(response)["draft_id"], data(response)["resume_token"]
        # 1.2: the name goes to the form's "About you" step with the token.
        if not program_id:
            self.guest("put", f"/api/drafts/{draft_id}/steps/about-you/", token, {"answers": {"first_name": "Neo", "last_name": "Kebadile"}})
        return draft_id, token

    def guest(self, method, url, token, body=None):
        return getattr(self.client, method)(url, body or {}, format="json", HTTP_X_DRAFT_TOKEN=token)

    def send(self, draft_id, token, **extra):
        body = {"consent": True, "create_account": False, "first_name": "Neo", "last_name": "Kebadile", **extra}
        return self.guest("post", f"/api/drafts/{draft_id}/submit/", token, body)

    def test_email_only_sends_without_an_account_and_gets_an_email_copy(self):
        draft_id, token = self.start()
        users = User.objects.count()
        sent = self.send(draft_id, token, email="Neo@Example.co.bw")
        self.assertEqual(sent.status_code, 200, sent.content)
        result = data(sent)
        self.assertTrue(result["is_guest"])
        self.assertEqual(result["contact"], {"email": "neo@example.co.bw", "phone": ""})
        submission = Submission.objects.get(id=result["submission_id"])
        self.assertIsNone(submission.innovator_id)
        self.assertEqual((submission.guest_name, submission.guest_email), ("Neo Kebadile", "neo@example.co.bw"))
        self.assertEqual(User.objects.count(), users)  # no account made
        self.assertEqual([m.to for m in mail.outbox][-1:], [["neo@example.co.bw"]])

    def test_phone_only_is_kept_as_e164_and_no_text_goes_while_sms_is_off(self):
        draft_id, token = self.start()
        sent = self.send(draft_id, token, phone="71 234 567")
        self.assertEqual(sent.status_code, 200, sent.content)
        submission = Submission.objects.get(id=data(sent)["submission_id"])
        self.assertEqual((submission.guest_phone, submission.guest_email), ("+26771234567", ""))
        self.assertFalse(CommunicationLog.objects.filter(related_submission=submission, channel="sms").exists())

    def test_both_and_a_text_copy_only_when_sms_is_on(self):
        set_features(self, sms_messages=True)
        draft_id, token = self.start()
        sent = self.send(draft_id, token, phone="+267 71 234 567", email="neo@example.co.bw")
        self.assertEqual(sent.status_code, 200, sent.content)
        submission = Submission.objects.get(id=data(sent)["submission_id"])
        self.assertEqual((submission.guest_phone, submission.guest_email), ("+26771234567", "neo@example.co.bw"))
        self.assertTrue(CommunicationLog.objects.filter(related_submission=submission, channel="sms").exists())

    def test_neither_is_refused_with_contact_required(self):
        draft_id, token = self.start()
        refused = self.send(draft_id, token)
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(error_code(refused), "contact_required")
        self.assertIn("Give us an email or a phone number so we can reach you", refused.content.decode())
        self.assertEqual(self.send(draft_id, token, phone="12").status_code, 400)  # not a phone number
        self.assertFalse(Submission.objects.exists())

    def test_consent_is_still_needed(self):
        draft_id, token = self.start()
        refused = self.guest("post", f"/api/drafts/{draft_id}/submit/", token, {"consent": False, "create_account": False, "email": "neo@example.co.bw"})
        self.assertEqual(error_code(refused), "consent_required")

    def test_with_the_switch_on_the_contact_is_confirmed_with_a_code_first(self):
        set_features(self, guest_contact_code=True)
        draft_id, token = self.start()
        refused = self.send(draft_id, token, email="neo@example.co.bw")
        self.assertEqual(error_code(refused), "email_verification_required")
        self.assertEqual(self.client.post("/api/auth/otp/request/", {"email": "neo@example.co.bw"}, format="json").status_code, 200)
        confirmed = self.guest("post", f"/api/drafts/{draft_id}/verify-email/", token, {"email": "neo@example.co.bw", "code": CODE})
        self.assertEqual(confirmed.status_code, 200, confirmed.content)
        self.assertEqual(self.send(draft_id, token, email="neo@example.co.bw").status_code, 200)
        log = AuditLog.objects.filter(action_type="guest_draft_email_verified").first()
        self.assertNotIn("neo@example.co.bw", str(log.metadata))  # masked
        # A phone must be confirmed too when it is the contact.
        other_id, other_token = self.start()
        self.assertEqual(error_code(self.send(other_id, other_token, phone="71234567")), "phone_verification_required")

    def test_a_challenge_entry_still_needs_an_account(self):
        ptype, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.INNOVATION_CHALLENGE, defaults={"name": "Innovation challenge"})
        owner = User.objects.create_user(email="officer@example.co.bw", password="StrongPass123!", first_name="Kago", last_name="Tau")
        challenge = Program.objects.create(title="Water", slug="water", description="x", program_type=ptype, owner=owner, status="published", is_public=True,
                                           opening_date=timezone.now() - timezone.timedelta(days=1), closing_date=timezone.now() + timezone.timedelta(days=9))
        published_form(challenge)
        draft_id, token = self.start(program_id=challenge.id)
        self.assertEqual(error_code(self.send(draft_id, token, email="neo@example.co.bw")), "account_required")

    def test_signed_in_sending_is_unchanged(self):
        user = User.objects.create_user(email="lesedi@example.co.bw", password="StrongPass123!", first_name="Lesedi", last_name="M", email_verified=True)
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        draft_id, token = self.start()
        self.client.force_authenticate(user)
        self.assertEqual(self.guest("post", f"/api/drafts/{draft_id}/claim/", token).status_code, 200)
        sent = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertEqual(sent.status_code, 200, sent.content)
        submission = Submission.objects.get(id=data(sent)["submission_id"])
        self.assertEqual(submission.innovator_id, user.id)
        self.assertIsNone(data(sent)["contact"])

    def test_staff_see_how_to_reach_a_guest(self):
        draft_id, token = self.start()
        submission = Submission.objects.get(id=data(self.send(draft_id, token, email="neo@example.co.bw"))["submission_id"])
        officer = User.objects.create_user(email="kago@example.co.bw", password="StrongPass123!", first_name="Kago", last_name="Tau", email_verified=True)
        RoleService.assign_roles(officer, [RoleType.INNOVATION_OFFICER])
        self.client.force_authenticate(officer)
        rows = data(self.client.get("/api/submissions/staff-list/"))["results"]
        row = next(r for r in rows if r["id"] == str(submission.id))
        self.assertEqual((row["innovator"]["name"], row["innovator"]["is_guest"], row["innovator"]["contact"]), ("Neo Kebadile", True, "neo@example.co.bw"))
        detail = data(self.client.get(f"/api/submissions/{submission.id}/staff-summary/"))
        self.assertEqual((detail["innovator"]["email"], detail["innovator"]["is_guest"]), ("neo@example.co.bw", True))

    def test_signing_up_later_with_the_same_email_joins_the_guest_idea(self):
        draft_id, token = self.start()
        submission = Submission.objects.get(id=data(self.send(draft_id, token, email="neo@example.co.bw"))["submission_id"])
        self.client.post("/api/auth/otp/request/", {"email": "neo@example.co.bw"}, format="json")
        signed_in = self.client.post("/api/auth/otp/verify/", {"email": "neo@example.co.bw", "code": CODE}, format="json")
        self.assertEqual(signed_in.status_code, 200, signed_in.content)
        submission.refresh_from_db()
        self.assertEqual(submission.innovator.email, "neo@example.co.bw")
