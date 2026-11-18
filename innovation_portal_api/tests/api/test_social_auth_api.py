from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import SocialAccount, SocialAuthState, User
from apps.accounts.services import RoleService
from apps.accounts.social_services import GitHubProviderService, SocialIdentity
from apps.audit.models import AuditLog
from apps.communications.models import NotificationPreference
from apps.core.constants import RoleType
from apps.profiles.models import InnovatorProfile


class FakeProvider:
    def __init__(self, provider, identity=None, error=None):
        self.provider = provider
        self._identity = identity
        self._error = error

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
        if self._error:
            raise self._error
        return self._identity


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
class SocialAuthApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

    def _begin(self, provider, fake_provider):
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=fake_provider):
            response = self.client.post(f"/api/auth/social/{provider}/start/", {}, format="json")
        self.assertEqual(response.status_code, 200)
        authorization_url = response.json()["authorization_url"]
        return authorization_url.split("state=")[1].split("&")[0]

    def test_google_first_time_social_signup_success(self):
        identity = SocialIdentity(
            provider="google",
            provider_user_id="google-user-1",
            email="google.user@example.com",
            email_verified=True,
            first_name="Google",
            last_name="User",
            full_name="Google User",
            extra_data={"picture": "https://example.com/pic.png"},
        )
        provider = FakeProvider("google", identity=identity)
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post(
                "/api/auth/social/google/complete/",
                {"code": "valid-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="google.user@example.com")
        self.assertTrue(user.email_verified)
        self.assertTrue(user.roles.filter(code=RoleType.INNOVATOR, user_roles__is_active=True).exists())
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(NotificationPreference.objects.filter(user=user).exists())
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="google").exists())
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)
        self.assertEqual(response.data["user"]["email"], "google.user@example.com")
        self.assertFalse(response.data["user"]["is_admin"])
        self.assertIn("profile", response.data["user"])
        self.assertIsNotNone(response.data["user"]["profile"])
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="social_signup_success").exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="social_login_success").exists())
        self.assertIn("sessionid", self.client.cookies)

        follow_up = self.client.get("/api/auth/social/linked-accounts/")
        self.assertEqual(follow_up.status_code, 200)

    def test_github_social_login_success_for_new_user(self):
        identity = SocialIdentity(
            provider="github",
            provider_user_id="github-77",
            email="dev@example.com",
            email_verified=True,
            first_name="Dev",
            last_name="User",
            full_name="Dev User",
            extra_data={"login": "devuser"},
        )
        provider = FakeProvider("github", identity=identity)
        state = self._begin("github", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/github/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(email="dev@example.com").exists())
        self.assertTrue(SocialAccount.objects.filter(provider="github", provider_user_id="github-77").exists())

    def test_existing_account_is_safely_linked(self):
        user = User.objects.create_user(
            email="existing@example.com",
            password="StrongPass123!",
            first_name="Existing",
            last_name="User",
        )
        identity = SocialIdentity(
            provider="google",
            provider_user_id="google-existing",
            email="existing@example.com",
            email_verified=True,
            first_name="Existing",
            last_name="User",
            full_name="Existing User",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity)
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(email="existing@example.com").count(), 1)
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="google").exists())
        user.refresh_from_db()
        self.assertTrue(user.email_verified)
        self.assertTrue(response.data["linked_existing_account"])

    def test_duplicate_prevention_for_existing_social_account(self):
        user = User.objects.create_user(
            email="repeat@example.com",
            password="StrongPass123!",
            first_name="Repeat",
            last_name="User",
            email_verified=True,
        )
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="google-repeat",
            provider_email=user.email,
            provider_email_verified=True,
        )
        identity = SocialIdentity(
            provider="google",
            provider_user_id="google-repeat",
            email="repeat@example.com",
            email_verified=True,
            first_name="Repeat",
            last_name="User",
            full_name="Repeat User",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity)
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(User.objects.filter(email="repeat@example.com").count(), 1)
        self.assertEqual(SocialAccount.objects.filter(provider="google", provider_user_id="google-repeat").count(), 1)

    def test_missing_email_from_provider_is_rejected(self):
        identity = SocialIdentity(
            provider="google",
            provider_user_id="missing-email",
            email="",
            email_verified=True,
            first_name="No",
            last_name="Email",
            full_name="No Email",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity, error=ValidationError({"email": "The provider did not supply an email address."}))
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unverified_email_is_rejected_for_existing_local_account(self):
        User.objects.create_user(
            email="unsafe@example.com",
            password="StrongPass123!",
            first_name="Unsafe",
            last_name="Link",
        )
        identity = SocialIdentity(
            provider="google",
            provider_user_id="unsafe-google",
            email="unsafe@example.com",
            email_verified=False,
            first_name="Unsafe",
            last_name="Link",
            full_name="Unsafe Link",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity, error=ValidationError({"email": "Cannot link a social account with an unverified provider email."}))
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertFalse(SocialAccount.objects.filter(provider_user_id="unsafe-google").exists())

    def test_invalid_or_reused_state_is_rejected(self):
        provider = FakeProvider(
            "github",
            identity=SocialIdentity(
                provider="github",
                provider_user_id="gh-1",
                email="gh@example.com",
                email_verified=True,
                first_name="GH",
                last_name="User",
                full_name="GH User",
                extra_data={},
            ),
        )
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/github/complete/", {"code": "ok", "state": "bad-state"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_provider_list_shows_enabled_providers(self):
        response = self.client.get("/api/auth/social/providers/")
        self.assertEqual(response.status_code, 200)
        providers = {item["id"]: item["enabled"] for item in response.data["providers"]}
        self.assertTrue(providers["google"])
        self.assertTrue(providers["github"])
        self.assertTrue(providers["microsoft"])

    @override_settings(
        GOOGLE_CLIENT_ID="",
        GOOGLE_CLIENT_SECRET="",
        GOOGLE_REDIRECT_URI="",
        GITHUB_CLIENT_ID="",
        GITHUB_CLIENT_SECRET="",
        GITHUB_REDIRECT_URI="",
        MICROSOFT_CLIENT_ID="",
        MICROSOFT_CLIENT_SECRET="",
        MICROSOFT_REDIRECT_URI="",
    )
    def test_provider_list_shows_disabled_providers(self):
        response = self.client.get("/api/auth/social/providers/")
        self.assertEqual(response.status_code, 200)
        providers = {item["id"]: item["enabled"] for item in response.data["providers"]}
        self.assertFalse(providers["google"])
        self.assertFalse(providers["github"])
        self.assertFalse(providers["microsoft"])

    def test_invalid_provider_is_rejected(self):
        response = self.client.post("/api/auth/social/linkedin/start/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    @override_settings(
        GITHUB_CLIENT_ID="",
        GITHUB_CLIENT_SECRET="",
        GITHUB_REDIRECT_URI="",
    )
    def test_disabled_provider_is_rejected_in_start_endpoint(self):
        response = self.client.post("/api/auth/social/github/start/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    @override_settings(
        GITHUB_CLIENT_ID="",
        GITHUB_CLIENT_SECRET="",
        GITHUB_REDIRECT_URI="",
    )
    def test_disabled_provider_is_rejected_in_complete_endpoint(self):
        response = self.client.post("/api/auth/social/github/complete/", {"code": "x", "state": "y"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_microsoft_social_login_success_for_new_user(self):
        identity = SocialIdentity(
            provider="microsoft",
            provider_user_id="ms-123",
            email="ms.user@example.com",
            email_verified=True,
            first_name="MS",
            last_name="User",
            full_name="MS User",
            extra_data={"tenant": "common"},
        )
        provider = FakeProvider("microsoft", identity=identity)
        state = self._begin("microsoft", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/microsoft/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(User.objects.filter(email="ms.user@example.com").exists())
        self.assertEqual(response.data["provider"], "microsoft")

    def test_social_login_creates_profile_and_tokens(self):
        identity = SocialIdentity(
            provider="google",
            provider_user_id="profile-creator",
            email="profiled@example.com",
            email_verified=True,
            first_name="Profiled",
            last_name="User",
            full_name="Profiled User",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity)
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(email="profiled@example.com")
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(user.roles.filter(code=RoleType.INNOVATOR, user_roles__is_active=True).exists())
        self.assertIn("access", response.data)

    def test_invalid_code_failure_is_propagated(self):
        provider = FakeProvider("google", error=ValidationError({"provider": "Invalid authorization code."}))
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "bad", "state": state}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_linked_accounts_endpoint_returns_current_links(self):
        user = User.objects.create_user(
            email="linked@example.com",
            password="StrongPass123!",
            first_name="Linked",
            last_name="User",
        )
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="google-linked",
            provider_email=user.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.get("/api/auth/social/linked-accounts/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["data"]["linked_accounts"]), 1)
        self.assertEqual(response.data["data"]["linked_accounts"][0]["provider"], "google")

    def test_link_provider_success_for_authenticated_user(self):
        user = User.objects.create_user(
            email="linkme@example.com",
            password="StrongPass123!",
            first_name="Link",
            last_name="Me",
        )
        self.client.force_authenticate(user)
        provider = FakeProvider(
            "github",
            identity=SocialIdentity(
                provider="github",
                provider_user_id="gh-link-1",
                email=user.email,
                email_verified=True,
                first_name="Link",
                last_name="Me",
                full_name="Link Me",
                extra_data={"login": "linkme"},
            ),
        )
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            start_response = self.client.post("/api/auth/social/github/link/", {}, format="json")
        self.assertEqual(start_response.status_code, 200)
        state = SocialAuthState.objects.latest("created_at").state
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            complete_response = self.client.post(
                "/api/auth/social/github/link/",
                {"code": "ok", "state": state},
                format="json",
            )
        self.assertEqual(complete_response.status_code, 200)
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="github").exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="social_account_linked").exists())

    def test_disabled_provider_is_rejected_in_link_endpoint(self):
        user = User.objects.create_user(
            email="disabled-link@example.com",
            password="StrongPass123!",
            first_name="Disabled",
            last_name="Link",
        )
        self.client.force_authenticate(user)
        with override_settings(GITHUB_CLIENT_ID="", GITHUB_CLIENT_SECRET="", GITHUB_REDIRECT_URI=""):
            response = self.client.post("/api/auth/social/github/link/", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_link_provider_blocked_when_already_linked_elsewhere(self):
        owner = User.objects.create_user(
            email="owner@example.com",
            password="StrongPass123!",
            first_name="Owner",
            last_name="User",
        )
        other = User.objects.create_user(
            email="other@example.com",
            password="StrongPass123!",
            first_name="Other",
            last_name="User",
        )
        SocialAccount.objects.create(
            user=owner,
            provider="google",
            provider_user_id="google-owner",
            provider_email=owner.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(other)
        provider = FakeProvider(
            "google",
            identity=SocialIdentity(
                provider="google",
                provider_user_id="google-owner",
                email=other.email,
                email_verified=True,
                first_name="Other",
                last_name="User",
                full_name="Other User",
                extra_data={},
            ),
        )
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            self.client.post("/api/auth/social/google/link/", {}, format="json")
        state = SocialAuthState.objects.latest("created_at").state
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/link/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_unlink_provider_success(self):
        user = User.objects.create_user(
            email="unlink@example.com",
            password="StrongPass123!",
            first_name="Unlink",
            last_name="User",
        )
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="unlink-google",
            provider_email=user.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(SocialAccount.objects.filter(user=user, provider="google").exists())
        self.assertTrue(AuditLog.objects.filter(actor=user, action_type="social_account_unlinked").exists())

    def test_unlink_provider_blocked_when_it_is_only_login_method(self):
        user = User.objects.create_user(
            email="onlysocial@example.com",
            password="StrongPass123!",
            first_name="Only",
            last_name="Social",
        )
        user.set_unusable_password()
        user.save(update_fields=["password"])
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="only-social-google",
            provider_email=user.email,
            provider_email_verified=True,
        )
        self.client.force_authenticate(user)
        response = self.client.delete("/api/auth/social/google/link/")
        self.assertEqual(response.status_code, 400)

    def test_social_auth_invalid_state_creates_audit_log(self):
        provider = FakeProvider(
            "google",
            identity=SocialIdentity(
                provider="google",
                provider_user_id="audit-invalid",
                email="audit@example.com",
                email_verified=True,
                first_name="Audit",
                last_name="User",
                full_name="Audit User",
                extra_data={},
            ),
        )
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "x", "state": "invalid"}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertTrue(AuditLog.objects.filter(action_type="social_state_invalid").exists())

    def test_existing_social_login_repairs_missing_profile(self):
        user = User.objects.create_user(
            email="repair@example.com",
            password="StrongPass123!",
            first_name="Repair",
            last_name="User",
            email_verified=True,
        )
        SocialAccount.objects.create(
            user=user,
            provider="google",
            provider_user_id="repair-google",
            provider_email=user.email,
            provider_email_verified=True,
        )
        InnovatorProfile.objects.filter(user=user).delete()
        NotificationPreference.objects.filter(user=user).delete()
        identity = SocialIdentity(
            provider="google",
            provider_user_id="repair-google",
            email="repair@example.com",
            email_verified=True,
            first_name="Repair",
            last_name="User",
            full_name="Repair User",
            extra_data={},
        )
        provider = FakeProvider("google", identity=identity)
        state = self._begin("google", provider)
        with patch("apps.accounts.social_services.SocialProviderRegistry.get", return_value=provider):
            response = self.client.post("/api/auth/social/google/complete/", {"code": "ok", "state": state}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(NotificationPreference.objects.filter(user=user).exists())

    def test_github_selects_primary_verified_email(self):
        emails = [
            {"email": "secondary@example.com", "verified": True, "primary": False},
            {"email": "primary@example.com", "verified": True, "primary": True},
            {"email": "unverified@example.com", "verified": False, "primary": False},
        ]
        selected = GitHubProviderService._select_verified_email(emails)
        self.assertEqual(selected["email"], "primary@example.com")

    def test_github_email_selection_returns_none_without_verified_email(self):
        emails = [
            {"email": "private@example.com", "verified": False, "primary": True},
            {"email": "other@example.com", "verified": False, "primary": False},
        ]
        self.assertIsNone(GitHubProviderService._select_verified_email(emails))
