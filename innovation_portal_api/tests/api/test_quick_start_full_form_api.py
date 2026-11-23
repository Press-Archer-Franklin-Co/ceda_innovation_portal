"""Prompt 31 part B: the home quick start is step 1 of the one General ideas form, and continues into the full form.

What typed in the quick start carries into step 2, signed in and signed out; a refresh keeps it (the draft is read
back with the resume token); the name and phone are never asked twice.
"""
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.communications.senders import LocMemMessageSender
from apps.platform_config.testing import set_features
from apps.programs.general_idea import GeneralIdeaProgram
from apps.reference.models import Sector
from apps.submissions.models import ApplicationDraft, Submission
from tests.api.test_idea_intake_api import CODE, IDEA_ANSWERS, LOCMEM_SENDERS, OTP_REQUEST_URL, OTP_VERIFY_URL, PHONE, QUICK_START_URL


def data(response):
    body = response.json()
    return body.get("data", body)


@override_settings(MESSAGE_SENDERS=LOCMEM_SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms")
class QuickStartIntoFullFormTests(TestCase):
    def setUp(self):
        cache.clear()
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        set_features(self, guest_quick_start=True, code_sign_in=True, sms_messages=True, quick_start_basics_only=True)
        self.client = APIClient()
        self.sector = Sector.objects.filter(active=True).order_by("ordering").first()
        patcher = patch("apps.accounts.otp_services.OTPService._generate_code", return_value=CODE)
        patcher.start()
        self.addCleanup(patcher.stop)

    def quick_start(self, title="Cold milk for farmers"):
        response = self.client.post(QUICK_START_URL, {"title": title, "sector": str(self.sector.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)["draft_id"], data(response)["resume_token"]

    def guest(self, method, url, token, body=None):
        return getattr(self.client, method)(url, body or {}, format="json", HTTP_X_DRAFT_TOKEN=token)

    def test_the_quick_start_shows_the_general_idea_forms_own_steps(self):
        general = GeneralIdeaProgram.get()
        response = self.client.get("/api/forms/general-ideas/published/?lang=en")
        self.assertEqual(response.status_code, 200, response.content)
        steps = [step["code"] for step in data(response)["steps"]]
        self.assertEqual(steps, ["your-idea", "about-you"])
        # The draft the card makes uses that same form, not a separate one.
        draft_id, token = self.quick_start()
        draft = data(self.guest("get", f"/api/drafts/{draft_id}/", token))
        self.assertEqual(draft["form_id"], str(general.form_id))
        self.assertEqual(data(response)["id"], str(general.form_id))

    def test_signed_out_the_name_and_phone_carry_into_step_2_and_a_refresh_keeps_them(self):
        draft_id, token = self.quick_start()
        # 1.2: the name is saved to "About you" as it is typed; a refresh reads it back with the resume token.
        saved = self.guest("put", f"/api/drafts/{draft_id}/steps/about-you/", token, {"answers": {"first_name": "Neo", "last_name": "Kebadile"}})
        self.assertEqual(saved.status_code, 200, saved.content)
        refreshed = data(self.guest("get", f"/api/drafts/{draft_id}/", token))
        self.assertEqual((refreshed["title"], refreshed["draft_data"]["first_name"], refreshed["draft_data"]["last_name"]), ("Cold milk for farmers", "Neo", "Kebadile"))
        # Confirming the phone with the code signs them in (an account is made from the phone), then the draft joins it.
        self.assertEqual(self.client.post(OTP_REQUEST_URL, {"phone": PHONE}, format="json").status_code, 200)
        signed_in = self.client.post(OTP_VERIFY_URL, {"phone": PHONE, "code": CODE}, format="json")
        self.assertEqual(signed_in.status_code, 200, signed_in.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data(signed_in)['access']}")
        joined = self.guest("post", f"/api/drafts/{draft_id}/claim/", token)
        self.assertEqual(joined.status_code, 200, joined.content)
        self.assertTrue(data(joined)["send_now_allowed"])  # so the full form opens at step 2 and offers Send now
        # Step 2 ("About you") in the full form: the name typed in 1.2 and the confirmed phone are already there.
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {data(signed_in)['access']}")
        full = data(self.client.get(f"/api/drafts/{draft_id}/"))
        self.assertEqual(full["title"], "Cold milk for farmers")
        self.assertEqual(full["sector"], str(self.sector.id))
        self.assertEqual(full["draft_data"]["first_name"], "Neo")
        self.assertEqual(full["draft_data"]["last_name"], "Kebadile")
        self.assertEqual(full["draft_data"]["contact_number"], PHONE)
        user = User.objects.get(phone_number=PHONE)
        self.assertEqual((user.first_name, user.last_name), ("Neo", "Kebadile"))
        # Send now, finish later: the basics are enough while the switch is on.
        sent = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertIn(sent.status_code, (200, 201), sent.content)
        self.assertTrue(Submission.objects.filter(innovator=user, title="Cold milk for farmers").exists())

    def test_signed_in_the_full_form_does_not_ask_the_name_or_phone_again(self):
        user = User.objects.create_user(email="neo@example.co.bw", password="StrongPass123", first_name="Neo", last_name="Molefe", phone_number="+26772000000", email_verified=True)
        self.client.force_authenticate(user)
        draft_id, token = self.quick_start()
        joined = self.guest("post", f"/api/drafts/{draft_id}/claim/", token)
        self.assertEqual(joined.status_code, 200, joined.content)
        answers = data(self.client.get(f"/api/drafts/{draft_id}/"))["draft_data"]
        self.assertEqual((answers["first_name"], answers["last_name"], answers["contact_number"]), ("Neo", "Molefe", "+26772000000"))

    def test_claiming_keeps_what_the_person_typed(self):
        user = User.objects.create_user(email="kago@example.co.bw", password="StrongPass123", first_name="Kago", last_name="Old", email_verified=True)
        draft_id, token = self.quick_start()
        self.guest("put", f"/api/drafts/{draft_id}/steps/about-you/", token, {"answers": {"first_name": "Kagiso", "last_name": "New"}})
        self.guest("put", f"/api/drafts/{draft_id}/steps/your-idea/", token, {"answers": IDEA_ANSWERS})
        self.client.force_authenticate(user)
        self.assertEqual(self.guest("post", f"/api/drafts/{draft_id}/claim/", token).status_code, 200)
        answers = ApplicationDraft.objects.get(id=draft_id).draft_data
        self.assertEqual((answers["first_name"], answers["last_name"]), ("Kagiso", "New"))
        self.assertEqual(answers["problem"], IDEA_ANSWERS["problem"])

    def test_send_now_is_offered_only_when_the_basics_are_enough(self):
        user = User.objects.create_user(email="lesedi@example.co.bw", password="StrongPass123", first_name="Lesedi", last_name="M", email_verified=True)
        self.client.force_authenticate(user)
        draft_id, token = self.quick_start()
        self.assertTrue(data(self.guest("post", f"/api/drafts/{draft_id}/claim/", token))["send_now_allowed"])
        set_features(self, quick_start_basics_only=False)
        self.assertFalse(data(self.client.get(f"/api/drafts/{draft_id}/"))["send_now_allowed"])
        refused = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertEqual(refused.status_code, 400)
