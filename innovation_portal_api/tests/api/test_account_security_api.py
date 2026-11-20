from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.identity_providers import IdentityTrustLevel, NormalizedIdentity
from apps.accounts.models import SocialAccount, User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.core.constants import RoleType


class FakeProvider:
    def __init__(self, provider, identity=None):
        self.provider = provider
        self._identity = identity

    def config(self):
        return {
            "client_id": "client-id",
            "client_secret": "client-secret",
            "redirect_uri": f"https://frontend.example.com/auth/{self.provider}/callback",
        }

    def authorization_url(self, *, state, nonce):
        return f"https://provider.example.com/{self.provider}?state={state}&nonce={nonce}", self.config()["redirect_uri"]

    def fetch_identity(self, *, code, state_record):
        del code, state_record
        return self._identity

    def is_enabled(self):
        return True


@override_settings(
    GOOGLE_CLIENT_ID="google-client",
    GOOGLE_CLIENT_SECRET="google-secret",
    GOOGLE_REDIRECT_URI="https://frontend.example.com/auth/google/callback",
    GITHUB_CLIENT_ID="github-client",
    GITHUB_CLIENT_SECRET="github-secret",
    GITHUB_REDIRECT_URI="https://frontend.example.com/auth/github/callback",
    MICROSOFT_CLIENT_ID="ms-client",
    MICROSOFT_CLIENT_SECRET="ms-secret",
    MICROSOFT_REDIRECT_URI="https://frontend.example.com/auth/microsoft/callback",
)
class AccountSecurityApiTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()

    def _social_signup(self, provider_name: str, email: str, provider_user_id: str):
        identity = NormalizedIdentity(
            provider=provider_name,
            provider_user_id=provider_user_id,
            email=email,
            email_verified=True,
            first_name="Social",
            last_name="User",
            display_name="Social User",
            username=email,
            avatar_url="",
            raw_claims={},
            trust_level=IdentityTrustLevel.STRONG if provider_name in {"google", "microsoft"} else IdentityTrustLevel.MEDIUM,
        )
        provider = FakeProvider(provider_name, identity=identity)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            start_response = self.client.post(f"/api/auth/social/{provider_name}/start/", {}, format="json")
        state = start_response.json()["authorization_url"].split("state=")[1].split("&")[0]
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post(
                f"/api/auth/social/{provider_name}/complete/",
                {"code": "ok", "state": state},
                format="json",
            )
        return response, User.objects.get(email=email)

    def test_local_registration_sets_primary_auth_method_password(self):
        response = self.client.post(
            "/api/auth/register/",
            {
                "email": "passwordonly@example.com",
                "first_name": "Password",
                "last_name": "Only",
                "phone_number": "+26770000001",
                "password": "StrongPass123!",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(email="passwordonly@example.com")
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.PASSWORD)

    def test_social_signup_sets_primary_auth_method_provider(self):
        response, user = self._social_signup("google", "socialprimary@example.com", "google-social-primary")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.GOOGLE)

    def test_password_only_user_security_summary(self):
        user = User.objects.create_user(
            email="summary-password@example.com",
            password="StrongPass123!",
            first_name="Password",
            last_name="Summary",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
            email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["primary_auth_method"], "password")
        self.assertTrue(response.data["data"]["has_password"])
        self.assertEqual(response.data["data"]["linked_provider_count"], 0)

    def test_social_only_user_security_summary(self):
        _, user = self._social_signup("google", "socialsummary@example.com", "google-summary")
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["primary_auth_method"], "google")
        self.assertFalse(response.data["data"]["has_password"])
        self.assertIn("no_password_fallback", response.data["data"]["account_risk_flags"])
        self.assertIn("Add a password for account recovery.", response.data["data"]["recommended_actions"])
        self.assertEqual(response.data["data"]["security_level"], "medium")
        self.assertTrue(response.data["data"]["policy_compliant"])

    def test_hybrid_user_security_summary(self):
        _, user = self._social_signup("google", "hybrid@example.com", "google-hybrid")
        self.client.force_authenticate(user)
        set_response = self.client.post("/api/auth/set-password/", {"password": "HybridPass123!"}, format="json")
        self.assertEqual(set_response.status_code, 200)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["data"]["has_password"])
        self.assertEqual(response.data["data"]["primary_auth_method"], "google")
        self.assertIn("password", response.data["data"]["recovery_methods"])
        self.assertEqual(response.data["data"]["security_level"], "high")

    def test_set_password_for_social_only_user(self):
        _, user = self._social_signup("google", "setpassword@example.com", "google-set-password")
        self.client.force_authenticate(user)
        response = self.client.post("/api/auth/set-password/", {"password": "PortalFallback!234"}, format="json")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.has_usable_password())
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.GOOGLE)
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="password_set").exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="recovery_posture_improved").exists())

    def test_set_password_blocked_when_password_already_exists(self):
        user = User.objects.create_user(
            email="alreadyhas@example.com",
            password="StrongPass123!",
            first_name="Already",
            last_name="Has",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
        )
        self.client.force_authenticate(user)
        response = self.client.post("/api/auth/set-password/", {"password": "AnotherFallback!234"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_change_password_success(self):
        user = User.objects.create_user(
            email="changepass@example.com",
            password="StrongPass123!",
            first_name="Change",
            last_name="Pass",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
        )
        self.client.force_authenticate(user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "StrongPass123!", "new_password": "UpdatedStrong123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertTrue(user.check_password("UpdatedStrong123!"))
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="password_changed").exists())

    def test_change_password_invalid_current_password(self):
        user = User.objects.create_user(
            email="badcurrent@example.com",
            password="StrongPass123!",
            first_name="Bad",
            last_name="Current",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
        )
        self.client.force_authenticate(user)
        response = self.client.post(
            "/api/auth/change-password/",
            {"current_password": "WrongPass123!", "new_password": "UpdatedStrong123!"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unlink_blocked_for_last_provider_without_password(self):
        _, user = self._social_signup("google", "unlinkblocked@example.com", "google-unlink-blocked")
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="unlink_blocked_no_recovery").exists())

    def test_unlink_allowed_when_password_exists(self):
        _, user = self._social_signup("google", "unlinkok@example.com", "google-unlink-ok")
        user.set_password("StrongPass123!")
        user.primary_auth_method = User.PrimaryAuthMethod.GOOGLE
        user.save(update_fields=["password", "primary_auth_method"])
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.PASSWORD)

    def test_unlink_allowed_when_another_provider_exists(self):
        _, user = self._social_signup("google", "twoproviders@example.com", "google-two-providers")
        SocialAccount.objects.create(
            user=user,
            provider="microsoft",
            provider_user_id="ms-two-providers",
            provider_email=user.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.MICROSOFT)
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="recovery_posture_weakened").exists())

    def test_linking_provider_keeps_existing_primary_auth_method(self):
        user = User.objects.create_user(
            email="keepprimary@example.com",
            password="StrongPass123!",
            first_name="Keep",
            last_name="Primary",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
            email_verified=True,
        )
        self.client.force_authenticate(user)
        identity = NormalizedIdentity(
            provider="microsoft",
            provider_user_id="ms-keep-primary",
            email=user.email,
            email_verified=True,
            first_name="Keep",
            last_name="Primary",
            display_name="Keep Primary",
            username=user.email,
            avatar_url="",
            raw_claims={},
            trust_level=IdentityTrustLevel.STRONG,
        )
        provider = FakeProvider("microsoft", identity=identity)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            self.client.post("/api/auth/social/microsoft/link/", {}, format="json")
        from apps.accounts.models import SocialAuthState

        state = SocialAuthState.objects.latest("created_at").state
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/microsoft/link/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        user.refresh_from_db()
        self.assertEqual(user.primary_auth_method, User.PrimaryAuthMethod.PASSWORD)

    def test_account_security_endpoint_shape(self):
        _, user = self._social_signup("google", "shape@example.com", "google-shape")
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            set(response.data["data"].keys()),
            {
                "primary_auth_method",
                "has_password",
                "linked_provider_count",
                "recovery_methods",
                "account_risk_flags",
                "recommended_actions",
                "security_level",
                "policy_compliant",
                "policy_flags",
                "blocking_flags",
                "recommended_action_codes",
                "enforcement_actions",
                "can_continue_without_action",
                "requires_password_fallback",
                "requires_verified_email",
                "requires_additional_recovery_method",
                "linked_accounts",
                "can_set_password",
                "can_change_password",
                "mfa_enabled",
                "mfa_method",
            },
        )

    def test_password_only_user_can_be_high_security(self):
        user = User.objects.create_user(
            email="highsecurity@example.com",
            password="StrongPass123!",
            first_name="High",
            last_name="Security",
            primary_auth_method=User.PrimaryAuthMethod.PASSWORD,
            email_verified=True,
        )
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="high-google",
            provider_email=user.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["security_level"], "high")
        self.assertTrue(response.data["data"]["policy_compliant"])

    def test_github_only_social_user_is_low_security(self):
        _, user = self._social_signup("github", "githubweak@example.com", "gh-weak")
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["security_level"], "low")
        self.assertIn("add_password", response.data["data"]["recommended_action_codes"])

    def test_staff_account_policy_is_stricter(self):
        _, user = self._social_signup("google", "staffstrict@example.com", "google-staff-strict")
        RoleService.assign_roles(user, [RoleType.INNOVATION_OFFICER])
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["data"]["policy_compliant"])
        self.assertTrue(response.data["data"]["requires_password_fallback"])
        self.assertIn("staff_requires_password_fallback", response.data["data"]["policy_flags"])

    def test_unlink_blocked_by_policy_for_staff_without_password_even_with_other_provider(self):
        _, user = self._social_signup("google", "staffunlink@example.com", "google-staff-unlink")
        SocialAccount.objects.create(
            user=user,
            provider="microsoft",
            provider_user_id="ms-staff-unlink",
            provider_email=user.email,
            provider_email_verified=True,
        )
        RoleService.assign_roles(user, [RoleType.ADMINISTRATOR])
        user.is_staff = True
        user.save(update_fields=["is_staff"])
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="unlink_blocked_by_policy").exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="staff_security_requirement_failed").exists())

    @override_settings(
        ACCOUNT_SECURITY_POLICY={
            "TRUSTED_PROVIDERS": ["google", "microsoft"],
            "STAFF_REQUIRE_PASSWORD_FALLBACK": False,
            "STAFF_REQUIRE_TWO_RECOVERY_METHODS": False,
            "STAFF_REQUIRE_VERIFIED_EMAIL": False,
            "WEAK_SOCIAL_COUNTS_AS_TRUSTED_FALLBACK": True,
            "LEVEL_THRESHOLDS": {"high": 4, "medium": 2},
        }
    )
    def test_policy_configuration_override_changes_evaluation(self):
        _, user = self._social_signup("github", "override@example.com", "gh-override")
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/account-security/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["data"]["security_level"], "medium")
