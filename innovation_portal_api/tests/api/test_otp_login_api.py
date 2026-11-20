from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import LoginCode, User, UserMFAProfile
from apps.accounts.services import RoleService
from apps.communications.senders import LocMemMessageSender
from apps.core.constants import RoleType
from apps.platform_config.testing import set_features

REQUEST_URL = "/api/auth/otp/request/"
VERIFY_URL = "/api/auth/otp/verify/"
CODE = "123456"

def error_code(response):
    code = response.json()["errors"]["code"]
    return code[0] if isinstance(code, list) else code


LOCMEM_SENDERS = {"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""}


@override_settings(MESSAGE_SENDERS=LOCMEM_SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms")
class OTPLoginApiTests(TestCase):
    def setUp(self):
        cache.clear()
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        set_features(self, sms_messages=True, code_sign_in=True, password_sign_in=True)
        self.client = APIClient()
        patcher = patch("apps.accounts.otp_services.OTPService._generate_code", return_value=CODE)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _request(self, **payload):
        return self.client.post(REQUEST_URL, payload, format="json")

    def _verify(self, code=CODE, **payload):
        return self.client.post(VERIFY_URL, {**payload, "code": code}, format="json")

    # --- request ---------------------------------------------------------------

    def test_request_by_phone_normalises_to_e164_and_sends_sms(self):
        response = self._request(phone="71 234 567")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["channel"], "sms")
        self.assertEqual(body["data"]["expires_in_seconds"], 600)
        self.assertEqual(body["data"]["resend_after_seconds"], 60)
        code = LoginCode.objects.get()
        self.assertEqual(code.target, "+26771234567")
        self.assertNotEqual(code.code_hash, CODE)
        self.assertEqual(len(LocMemMessageSender.outbox), 1)
        self.assertEqual(LocMemMessageSender.outbox[0].to, "+26771234567")
        self.assertIn(CODE, LocMemMessageSender.outbox[0].body)

    def test_email_codes_work_with_sms_switched_off(self):
        # Demo set-up: code sign-in on, SMS off until SMS details are entered in Platform settings.
        set_features(self, code_sign_in=True, sms_messages=False)
        response = self._request(email="demo.person@example.com")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["channel"], "email")
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(CODE, mail.outbox[0].body)
        verified = self._verify(email="demo.person@example.com")
        self.assertEqual(verified.status_code, 200, verified.content)
        self.assertIn("access", verified.json())
        # Phone codes are refused while SMS is off.
        self.assertNotEqual(self._request(phone="71234567").status_code, 200)

    def test_request_by_email_sends_email(self):
        response = self._request(email="New.Person@Example.com")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(LoginCode.objects.get().target, "new.person@example.com")
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ["new.person@example.com"])

    def test_request_response_does_not_reveal_whether_account_exists(self):
        User.objects.create_user(email="known@example.com", password="StrongPass123!", first_name="K", last_name="U")
        known = self._request(email="known@example.com").json()
        unknown = self._request(email="unknown@example.com").json()
        self.assertEqual(known["message"], unknown["message"])
        self.assertEqual(set(known["data"]), set(unknown["data"]))
        self.assertEqual(known["data"]["channel"], unknown["data"]["channel"])

    def test_request_validation_errors(self):
        self.assertEqual(self._request().status_code, 400)
        self.assertEqual(self._request(phone="71234567", email="a@example.com").status_code, 400)
        self.assertEqual(self._request(phone="12ab").status_code, 400)
        self.assertEqual(self._request(phone="+2677123").status_code, 400)
        self.assertEqual(self._request(email="not-an-email").status_code, 400)
        self.assertFalse(LoginCode.objects.exists())

    def test_request_is_throttled(self):
        statuses = [self._request(phone=f"7123456{i}").status_code for i in range(6)]
        self.assertEqual(statuses[:5], [200] * 5)
        self.assertEqual(statuses[5], 429)

    @override_settings(LOGIN_CODE_RESEND_AFTER_SECONDS=45)
    def test_resend_wait_is_configurable_and_longer_after_the_hourly_cap(self):
        self.assertEqual(self._request(phone="71234567").json()["data"]["resend_after_seconds"], 45)
        for _ in range(4):
            cache.clear()
            self._request(phone="71234567")
        cache.clear()
        capped = self._request(phone="71234567").json()["data"]["resend_after_seconds"]
        self.assertGreater(capped, 45)
        self.assertLessEqual(capped, 3601)

    def test_new_request_replaces_older_code(self):
        self._request(phone="71234567")
        self._request(phone="71234567")
        self.assertEqual(LoginCode.objects.filter(used_at__isnull=True).count(), 1)

    def test_per_target_hourly_cap_stops_sending_but_answers_the_same(self):
        for _ in range(5):
            cache.clear()
            self._request(phone="71234567")
        cache.clear()
        response = self._request(phone="71234567")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(LoginCode.objects.count(), 5)
        self.assertEqual(len(LocMemMessageSender.outbox), 5)

    # --- verify ----------------------------------------------------------------

    def test_verify_new_phone_creates_innovator_without_email(self):
        self._request(phone="+267 71 234 567")
        response = self._verify(phone="71234567")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertIn("access", body)
        self.assertIn("refresh", body)
        self.assertTrue(body["created"])
        self.assertIsNone(body["user"]["email"])
        self.assertEqual(body["user"]["phone_number"], "+26771234567")
        self.assertTrue(body["user"]["phone_verified"])
        self.assertIn(RoleType.INNOVATOR, body["user"]["roles"])
        user = User.objects.get(phone_number="+26771234567")
        self.assertIsNone(user.email)
        self.assertFalse(user.has_usable_password())
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.PHONE_CODE)

    def test_two_phone_only_users_can_exist(self):
        self._request(phone="71234567")
        self.assertEqual(self._verify(phone="71234567").status_code, 200)
        cache.clear()
        self._request(phone="72345678")
        self.assertEqual(self._verify(phone="72345678").status_code, 200)
        self.assertEqual(User.objects.filter(email__isnull=True).count(), 2)

    def test_verify_existing_email_user_logs_in_and_marks_email_verified(self):
        user = User.objects.create_user(email="known@example.com", password="StrongPass123!", first_name="Known", last_name="User")
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        self._request(email="known@example.com")
        response = self._verify(email="KNOWN@example.com")
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertFalse(body["created"])
        self.assertEqual(body["user"]["id"], str(user.id))
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertTrue(user.has_usable_password())
        self.assertEqual(User.objects.count(), 1)

    def test_verify_existing_phone_user_logs_in(self):
        user = User.objects.create_user(
            email="phone.owner@example.com", password="StrongPass123!", first_name="P", last_name="O", phone_number="+26771234567"
        )
        self._request(phone="71234567")
        response = self._verify(phone="71234567")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["user"]["id"], str(user.id))
        user.refresh_from_db()
        self.assertTrue(user.phone_verified)

    def test_wrong_code_is_rejected_and_counts_an_attempt(self):
        self._request(phone="71234567")
        response = self._verify(code="000000", phone="71234567")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "otp_invalid")
        self.assertEqual(LoginCode.objects.get().attempts, 1)
        self.assertFalse(User.objects.exists())

    def test_expired_code_is_rejected(self):
        self._request(phone="71234567")
        LoginCode.objects.update(expires_at=timezone.now() - timezone.timedelta(seconds=1))
        response = self._verify(phone="71234567")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "otp_expired")
        self.assertFalse(User.objects.exists())

    def test_too_many_tries_locks_the_code(self):
        self._request(phone="71234567")
        for _ in range(4):
            cache.clear()
            self.assertEqual(error_code(self._verify(code="000000", phone="71234567")), "otp_invalid")
        cache.clear()
        fifth = self._verify(code="000000", phone="71234567")
        self.assertEqual(error_code(fifth), "otp_too_many_attempts")
        cache.clear()
        # Even the right code no longer works.
        right = self._verify(phone="71234567")
        self.assertEqual(right.status_code, 400)
        self.assertEqual(error_code(right), "otp_expired")
        self.assertFalse(User.objects.exists())

    def test_code_cannot_be_used_twice(self):
        self._request(phone="71234567")
        self.assertEqual(self._verify(phone="71234567").status_code, 200)
        cache.clear()
        self.assertEqual(self._verify(phone="71234567").status_code, 400)

    def test_verify_is_throttled(self):
        self._request(phone="71234567")
        cache.clear()
        statuses = [self._verify(code="000000", phone="71234567").status_code for _ in range(6)]
        self.assertEqual(statuses[5], 429)

    def test_verify_validation_errors(self):
        self.assertEqual(self.client.post(VERIFY_URL, {"phone": "71234567"}, format="json").status_code, 400)
        self.assertEqual(self._verify(code="12ab56", phone="71234567").status_code, 400)

    def test_disabled_account_is_refused(self):
        User.objects.create_user(email="off@example.com", password="StrongPass123!", first_name="O", last_name="F", is_active=False)
        self._request(email="off@example.com")
        response = self._verify(email="off@example.com")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "account_disabled")

    def test_mfa_user_gets_challenge_instead_of_tokens(self):
        user = User.objects.create_user(email="mfa@example.com", password="StrongPass123!", first_name="M", last_name="F")
        UserMFAProfile.objects.create(user=user, is_enabled=True, method=UserMFAProfile.MFAMethod.EMAIL)
        self._request(email="mfa@example.com")
        response = self._verify(email="mfa@example.com")
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertTrue(body["mfa_required"])
        self.assertNotIn("access", body)

    def test_existing_password_login_still_works(self):
        User.objects.create_user(email="pw@example.com", password="StrongPass123!", first_name="P", last_name="W")
        response = self.client.post("/api/auth/login/", {"email": "pw@example.com", "password": "StrongPass123!"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.json())


@override_settings(MESSAGE_SENDERS={"sms": "", "whatsapp": "", "ussd": ""})
class OTPWithoutSmsProviderTests(TestCase):
    def setUp(self):
        cache.clear()
        set_features(self, sms_messages=True)

    def test_request_still_answers_ok_when_no_sms_provider(self):
        response = APIClient().post(REQUEST_URL, {"phone": "71234567"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(LoginCode.objects.count(), 1)


class UserModelEmailTests(TestCase):
    def test_blank_email_is_stored_as_null(self):
        first = User.objects.create_user(email="", phone_number="+26771234567")
        second = User.objects.create_user(email=None, phone_number="+26772345678")
        self.assertIsNone(first.email)
        self.assertIsNone(second.email)
        self.assertEqual(str(first), "+26771234567")

    def test_user_needs_email_or_phone(self):
        with self.assertRaises(ValueError):
            User.objects.create_user(email=None)

    def test_register_still_requires_email(self):
        cache.clear()
        response = APIClient().post(
            "/api/auth/register/",
            {"first_name": "No", "last_name": "Email", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.json()["errors"])

    def test_register_duplicate_email_is_a_validation_error(self):
        cache.clear()
        User.objects.create_user(email="dup@example.com", password="StrongPass123!", first_name="D", last_name="U")
        response = APIClient().post(
            "/api/auth/register/",
            {"email": "dup@example.com", "first_name": "D", "last_name": "U", "password": "StrongPass123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
