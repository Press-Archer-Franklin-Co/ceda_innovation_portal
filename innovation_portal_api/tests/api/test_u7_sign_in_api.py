"""U7: one sign-in for everyone (start/finish/signup), the second step setting, demo logins."""
from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.identity_providers import CedaStaffIdentityProvider
from apps.accounts.models import AuthPolicy, User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.senders import LocMemMessageSender
from apps.core.constants import RoleType
from apps.platform_config.testing import set_features
from apps.submissions.models import ConsentRecord

START, FINISH, SIGNUP, DEMO = "/api/auth/start/", "/api/auth/finish/", "/api/auth/signup/", "/api/auth/demo-login/"
CODE = "123456"
PHONE = "+26771234567"
LOCMEM_SENDERS = {"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""}
SSO_SETTINGS = dict(
    CEDA_SSO_CLIENT_ID="staff-client",
    CEDA_SSO_CLIENT_SECRET="staff-secret",
    CEDA_SSO_REDIRECT_URI="https://portal.example.com/auth/callback",
    CEDA_SSO_DISCOVERY_URL="https://login.example.com/tenant/v2.0/.well-known/openid-configuration",
    CEDA_SSO_ALLOWED_DOMAINS=["ceda.co.bw"],
    CEDA_SSO_ALLOWED_GROUPS=[],
    CEDA_SSO_DEFAULT_ROLE="staff_member",
)
DISCOVERY = {
    "authorization_endpoint": "https://login.example.com/authorize",
    "token_endpoint": "https://login.example.com/token",
    "jwks_uri": "https://login.example.com/keys",
    "issuer": "https://login.example.com/tenant/v2.0",
}


def error_code(response):
    errors = response.json().get("errors")
    if isinstance(errors, dict):
        code = errors.get("code")
        if code is None:
            for value in errors.values():
                if isinstance(value, dict) and "code" in value:
                    code = value["code"]
                    break
        return code[0] if isinstance(code, list) else code
    return None


def make_user(email=None, *, roles=(RoleType.INNOVATOR,), password="StrongPass123!", phone="", demo=False):
    user = User.objects.create_user(
        email=email, password=password, phone_number=phone, first_name="Neo", last_name="Molefe",
        email_verified=bool(email), phone_verified=bool(phone), is_demo_account=demo,
    )
    RoleService.assign_roles(user, list(roles))
    return user


def set_policy(step):
    policy = AuthPolicy.current()
    policy.second_step = step
    policy.save()


@override_settings(MESSAGE_SENDERS=LOCMEM_SENDERS, LOGIN_CODE_PHONE_CHANNEL="sms", DEMO_LOGINS=False)
class SignInFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        set_features(self, code_sign_in=True, sms_messages=True, password_sign_in=True)
        self.client = APIClient()
        patcher = patch("apps.accounts.otp_services.OTPService._generate_code", return_value=CODE)
        patcher.start()
        self.addCleanup(patcher.stop)

    def start(self, identifier, **extra):
        return self.client.post(START, {"identifier": identifier, **extra}, format="json")

    def finish(self, identifier, **extra):
        return self.client.post(FINISH, {"identifier": identifier, **extra}, format="json")

    # step 1 ----------------------------------------------------------------------

    def test_start_rejects_something_that_is_neither_phone_nor_email(self):
        response = self.start("not a contact")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "invalid_identifier")

    def test_start_asks_new_people_for_one_more_step(self):
        for identifier in ("71 234 567", "new.person@example.com"):
            response = self.start(identifier)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()["next"], "signup")
        self.assertEqual(LocMemMessageSender.outbox, [])

    def test_code_step_sends_a_code_by_phone_and_by_email(self):
        set_policy("code")
        make_user(phone=PHONE)
        response = self.start("71234567")
        self.assertEqual(response.json()["next"], "code")
        self.assertEqual(response.json()["channel"], "sms")
        self.assertNotIn(PHONE, response.content.decode())
        self.assertEqual(len(LocMemMessageSender.outbox), 1)

        make_user("code.person@example.com")
        response = self.start("Code.Person@example.com")
        self.assertEqual(response.json()["next"], "code")
        self.assertEqual(response.json()["channel"], "email")
        self.assertNotIn(CODE, response.content.decode())

    def test_password_step_when_the_owner_chooses_password(self):
        set_policy("password")
        make_user("pw.person@example.com")
        self.assertEqual(self.start("pw.person@example.com").json(), {"next": "password"})

    def test_account_without_password_gets_a_code_even_in_password_mode(self):
        set_policy("password")
        make_user(phone=PHONE, password=None)
        self.assertEqual(self.start(PHONE).json()["next"], "code")

    def test_forgot_password_sends_a_code(self):
        set_policy("password")
        make_user("forgot@example.com")
        self.assertEqual(self.start("forgot@example.com", want_code=True).json()["next"], "code")

    @override_settings(**SSO_SETTINGS)
    def test_sso_domain_redirects_to_the_provider(self):
        set_features(self, staff_sso=True)
        with patch.object(CedaStaffIdentityProvider, "_discovery", return_value=DISCOVERY):
            response = self.start("kago.tau@ceda.co.bw")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["next"], "sso")
        self.assertTrue(response.json()["redirect"].startswith("https://login.example.com/authorize"))
        # Another domain never goes to SSO.
        self.assertEqual(self.start("someone@example.com").json()["next"], "signup")

    def test_sso_domain_falls_back_when_sso_is_off(self):
        set_features(self, staff_sso=False)
        set_policy("password")
        make_user("kago.tau@ceda.co.bw", roles=(RoleType.INNOVATION_OFFICER,))
        self.assertEqual(self.start("kago.tau@ceda.co.bw").json()["next"], "password")

    # step 2 ----------------------------------------------------------------------

    def test_each_role_signs_in_with_a_password_and_goes_home(self):
        set_policy("password")
        expected = {
            RoleType.INNOVATOR: "/home",
            RoleType.INNOVATION_OFFICER: "/staff/",
            RoleType.JUDGE: "/staff/",
            RoleType.INNOVATION_MANAGER: "/staff/",
            RoleType.ADMINISTRATOR: "/staff/",
        }
        for index, (role, home) in enumerate(expected.items()):
            make_user(f"role{index}@example.com", roles=(role,))
            self.assertEqual(self.start(f"role{index}@example.com").json()["next"], "password")
            response = self.finish(f"role{index}@example.com", password="StrongPass123!")
            self.assertEqual(response.status_code, 200, (role, response.content))
            body = response.json()
            self.assertIn("access", body)
            self.assertEqual(body["redirect"], home, role)
            cache.clear()  # the auth throttle allows 5 a minute per address

    def test_wrong_password_is_refused_the_same_way_for_unknown_accounts(self):
        set_policy("password")
        make_user("known@example.com")
        wrong = self.finish("known@example.com", password="nope-nope")
        unknown = self.finish("unknown@example.com", password="nope-nope")
        self.assertEqual((wrong.status_code, error_code(wrong)), (400, "invalid_credentials"))
        self.assertEqual((unknown.status_code, error_code(unknown)), (400, "invalid_credentials"))

    def test_code_finish_signs_in_and_honours_next_only_when_allowed(self):
        set_policy("code")
        make_user(phone=PHONE)
        self.start(PHONE)
        response = self.finish(PHONE, code=CODE, next="/staff/users")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["redirect"], "/home")  # an innovator cannot go to /staff

        officer = make_user("officer.next@example.com", roles=(RoleType.INNOVATION_OFFICER,))
        set_policy("password")
        ok = self.finish(officer.email, password="StrongPass123!", next="/staff/users")
        self.assertEqual(ok.json()["redirect"], "/staff/users")
        cache.clear()
        evil = self.finish(officer.email, password="StrongPass123!", next="//evil.example.com/x")
        self.assertEqual(evil.json()["redirect"], "/staff/")

    def test_wrong_code_is_refused(self):
        set_policy("code")
        make_user(phone=PHONE)
        self.start(PHONE)
        response = self.finish(PHONE, code="000000")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(error_code(response), "otp_invalid")

    def test_finish_needs_exactly_one_of_code_or_password(self):
        self.assertEqual(self.finish(PHONE).status_code, 400)
        self.assertEqual(self.finish(PHONE, code=CODE, password="x").status_code, 400)

    # one more step -------------------------------------------------------------------

    def test_signup_with_code_makes_the_account_then_the_code_verifies_it(self):
        set_policy("code")
        response = self.client.post(
            SIGNUP, {"identifier": "71234567", "full_name": "Neo Molefe", "email": "", "language": "tn", "consent": True}, format="json"
        )
        self.assertEqual(response.status_code, 201, response.content)
        self.assertEqual(response.json()["next"], "code")
        user = User.objects.get(phone_number=PHONE)
        self.assertFalse(user.phone_verified)
        self.assertEqual((user.first_name, user.last_name, user.preferred_language), ("Neo", "Molefe", "tn"))
        self.assertTrue(user.roles.filter(code=RoleType.INNOVATOR).exists())
        self.assertTrue(ConsentRecord.objects.filter(user=user, purpose="account_terms").exists())

        finished = self.finish("71234567", code=CODE)
        self.assertEqual(finished.status_code, 200, finished.content)
        user.refresh_from_db()
        self.assertTrue(user.phone_verified)

    def test_signup_with_password_signs_in_at_once(self):
        set_policy("password")
        response = self.client.post(
            SIGNUP, {"identifier": "new@example.com", "full_name": "Lorato S", "consent": True, "password": "LongEnough1"}, format="json"
        )
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access", response.json())
        self.assertEqual(response.json()["redirect"], "/home")

    def test_signup_needs_consent_and_a_free_phone(self):
        set_policy("code")
        make_user(phone=PHONE)
        response = self.client.post(SIGNUP, {"identifier": "other@example.com", "full_name": "A B", "phone": "71234567"}, format="json")
        self.assertEqual(response.status_code, 400)
        errors = response.json()["errors"]
        self.assertEqual(errors["consent"]["code"], "consent_required")
        self.assertEqual(errors["phone"]["code"], "phone_taken")


class SecondStepSettingTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()

    def test_only_settings_managers_change_it_and_public_config_shows_it(self):
        innovator = make_user("plain@example.com")
        admin = make_user("admin.u7@example.com", roles=(RoleType.ADMINISTRATOR,))
        self.client.force_authenticate(innovator)
        self.assertEqual(self.client.patch("/api/auth/settings/sign-in/", {"second_step": "password"}, format="json").status_code, 403)
        self.client.force_authenticate(admin)
        response = self.client.patch("/api/auth/settings/sign-in/", {"second_step": "password"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(AuthPolicy.current().second_step, "password")
        self.assertEqual(self.client.patch("/api/auth/settings/sign-in/", {"second_step": "magic"}, format="json").status_code, 400)
        self.client.force_authenticate(None)
        config = self.client.get("/api/platform/public-config/").json()["data"]
        self.assertEqual(config["sign_in"]["second_step"], "password")
        self.assertTrue(AuditLog.objects.filter(action_type="auth_second_step_changed").exists())


class DemoLoginTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        set_policy("password")
        self.client = APIClient()
        self.demo_officer = make_user("demo.officer@example.com", roles=(RoleType.INNOVATION_OFFICER,), demo=True)
        self.demo_innovator = make_user("demo.innovator@example.com", demo=True)
        self.real = make_user("real.person@example.com", roles=(RoleType.ADMINISTRATOR,))

    def config(self):
        return self.client.get("/api/platform/public-config/").json()["data"]

    def test_list_and_endpoint_absent_when_the_server_setting_is_off(self):
        set_features(self, demo_logins=True)
        with override_settings(DEMO_LOGINS=False):
            self.assertNotIn("demo_logins", self.config())
            self.assertEqual(self.client.post(DEMO, {"account": str(self.demo_officer.id)}, format="json").status_code, 404)

    def test_list_and_endpoint_absent_when_the_switch_is_off(self):
        set_features(self, demo_logins=False)
        with override_settings(DEMO_LOGINS=True):
            self.assertNotIn("demo_logins", self.config())
            self.assertEqual(self.client.post(DEMO, {"account": str(self.demo_officer.id)}, format="json").status_code, 404)

    @override_settings(DEMO_LOGINS=True)
    def test_list_shows_only_demo_accounts_without_contact_details_or_passwords(self):
        set_features(self, demo_logins=True)
        accounts = self.config()["demo_logins"]["accounts"]
        self.assertEqual([a["id"] for a in accounts], [str(self.demo_innovator.id), str(self.demo_officer.id)])  # innovator first
        self.assertEqual(accounts[1]["role"], RoleType.INNOVATION_OFFICER)
        for account in accounts:
            self.assertEqual(set(account), {"id", "name", "initials", "role", "role_label"})
        body = str(accounts)
        self.assertNotIn("@example.com", body)
        self.assertNotIn(str(self.real.id), body)

    @override_settings(DEMO_LOGINS=True)
    def test_one_click_sign_in_for_demo_accounts_only_and_audited(self):
        set_features(self, demo_logins=True)
        response = self.client.post(DEMO, {"account": str(self.demo_officer.id)}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("access", response.json())
        self.assertEqual(response.json()["redirect"], "/staff/")
        self.assertTrue(AuditLog.objects.filter(action_type="demo_login", actor=self.demo_officer).exists())
        self.assertEqual(self.client.post(DEMO, {"account": str(self.real.id)}, format="json").status_code, 404)

    @override_settings(DEMO_LOGINS=True)
    def test_demo_accounts_skip_two_step_only_while_demo_logins_are_on(self):
        from apps.accounts.mfa_services import MFAService

        # A plain object, not a MagicMock: the JSON renderer would keep making new mocks.
        challenge = SimpleNamespace(id="challenge-1", method="email", email_hint="d***@example.com", expires_at="2026-11-21T12:00:00Z")
        profile = SimpleNamespace(method="email")
        with patch.object(MFAService, "is_enabled", return_value=True), patch.object(MFAService, "issue_challenge", return_value=challenge), patch.object(MFAService, "ensure_profile", return_value=profile):
            set_features(self, demo_logins=True)
            on = self.client.post(FINISH, {"identifier": self.demo_officer.email, "password": "StrongPass123!"}, format="json")
            self.assertIn("access", on.json())
            cache.clear()
            set_features(self, demo_logins=False)
            off = self.client.post(FINISH, {"identifier": self.demo_officer.email, "password": "StrongPass123!"}, format="json")
            self.assertTrue(off.json().get("mfa_required"))
            cache.clear()
            real = self.client.post(FINISH, {"identifier": self.real.email, "password": "StrongPass123!"}, format="json")
            self.assertTrue(real.json().get("mfa_required"))

    @override_settings(DEMO_LOGINS=False)
    def test_demo_accounts_cannot_sign_in_when_the_server_setting_is_off(self):
        response = self.client.post(FINISH, {"identifier": self.demo_officer.email, "password": "StrongPass123!"}, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(error_code(response), "demo_account_disabled")
        old = self.client.post("/api/auth/login/", {"email": self.demo_officer.email, "password": "StrongPass123!"}, format="json")
        self.assertEqual(old.status_code, 403)

    @override_settings(DEMO_LOGINS=False, DEBUG=False)
    def test_demo_account_cannot_become_administrator_without_demo_logins(self):
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            RoleService.set_roles(user=self.demo_officer, role_codes=[RoleType.ADMINISTRATOR], actor=self.real)
        with override_settings(DEMO_LOGINS=True):
            RoleService.set_roles(user=self.demo_officer, role_codes=[RoleType.ADMINISTRATOR], actor=self.real)
