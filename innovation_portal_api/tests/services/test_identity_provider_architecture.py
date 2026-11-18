from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.exceptions import ValidationError

from apps.accounts.auth_identity_service import AuthIdentityService
from apps.accounts.identity_providers import (
    GitHubIdentityProvider,
    IdentityProviderRegistry,
    IdentityTrustLevel,
    NormalizedIdentity,
)
from apps.accounts.models import SocialAccount, User
from apps.accounts.services import RoleService
from apps.communications.models import NotificationPreference
from apps.core.constants import RoleType
from apps.profiles.models import InnovatorProfile


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
class IdentityProviderArchitectureTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()

    def test_registry_lists_enabled_social_providers(self):
        providers = {item["id"]: item["enabled"] for item in IdentityProviderRegistry.list_social_providers()}
        self.assertTrue(providers["google"])
        self.assertTrue(providers["github"])
        self.assertTrue(providers["microsoft"])

    def test_registry_rejects_unsupported_provider(self):
        with self.assertRaises(ValidationError):
            IdentityProviderRegistry.get("linkedin")

    def test_github_identity_maps_to_normalized_shape(self):
        provider = GitHubIdentityProvider()
        state_record = type("State", (), {"redirect_uri": "https://frontend.example.com/auth/github/callback", "state": "test-state"})()

        responses = [
            {"access_token": "gh-token"},
            {"id": 123, "login": "cedadev", "name": "CEDA Dev", "avatar_url": "https://example.com/avatar.png"},
            [
                {"email": "secondary@example.com", "verified": True, "primary": False},
                {"email": "primary@example.com", "verified": True, "primary": True},
            ],
        ]

        with patch("apps.accounts.identity_providers._http_json", side_effect=responses):
            identity = provider.fetch_identity(code="valid", state_record=state_record)

        self.assertIsInstance(identity, NormalizedIdentity)
        self.assertEqual(identity.provider, "github")
        self.assertEqual(identity.email, "primary@example.com")
        self.assertEqual(identity.username, "cedadev")
        self.assertEqual(identity.avatar_url, "https://example.com/avatar.png")
        self.assertEqual(identity.trust_level, IdentityTrustLevel.MEDIUM)

    def test_account_resolution_from_normalized_identity_creates_user_and_links_account(self):
        identity = NormalizedIdentity(
            provider="google",
            provider_user_id="google-new-1",
            email="normalized@example.com",
            email_verified=True,
            first_name="Normalized",
            last_name="User",
            display_name="Normalized User",
            username="normalized@example.com",
            avatar_url="",
            raw_claims={"sub": "google-new-1"},
            trust_level=IdentityTrustLevel.STRONG,
        )

        result = AuthIdentityService.resolve_social_login(identity=identity)

        user = User.objects.get(email="normalized@example.com")
        self.assertEqual(result["user"], user)
        self.assertTrue(result["created"])
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="google").exists())
        self.assertTrue(InnovatorProfile.objects.filter(user=user).exists())
        self.assertTrue(NotificationPreference.objects.filter(user=user).exists())
        self.assertTrue(user.roles.filter(code=RoleType.INNOVATOR, user_roles__is_active=True).exists())

    def test_safe_linking_rules_are_trust_aware(self):
        user = User.objects.create_user(
            email="existing@example.com",
            password="StrongPass123!",
            first_name="Existing",
            last_name="User",
        )
        identity = NormalizedIdentity(
            provider="github",
            provider_user_id="gh-untrusted",
            email="existing@example.com",
            email_verified=False,
            first_name="Existing",
            last_name="User",
            display_name="Existing User",
            username="existing",
            avatar_url="",
            raw_claims={},
            trust_level=IdentityTrustLevel.MEDIUM,
        )

        with self.assertRaises(ValidationError):
            AuthIdentityService.resolve_social_login(identity=identity)

        self.assertFalse(SocialAccount.objects.filter(provider="github", provider_user_id="gh-untrusted").exists())
