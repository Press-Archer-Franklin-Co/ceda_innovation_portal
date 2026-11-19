from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.identity_providers import CedaStaffIdentityProvider, IdentityProviderRegistry
from apps.accounts.models import SocialAccount, User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.core.constants import RoleType
from apps.platform_config.testing import set_features

SSO_SETTINGS = dict(
    CEDA_SSO_CLIENT_ID="staff-client",
    CEDA_SSO_CLIENT_SECRET="staff-secret",
    CEDA_SSO_REDIRECT_URI="https://staff.example.com/auth/ceda_staff/callback",
    CEDA_SSO_DISCOVERY_URL="https://login.example.com/tenant/v2.0/.well-known/openid-configuration",
    CEDA_SSO_ALLOWED_DOMAINS=["ceda.co.bw"],
    CEDA_SSO_ALLOWED_GROUPS=["portal-staff-group"],
    CEDA_SSO_DEFAULT_ROLE="staff_member",
)

DISCOVERY = {
    "authorization_endpoint": "https://login.example.com/authorize",
    "token_endpoint": "https://login.example.com/token",
    "jwks_uri": "https://login.example.com/keys",
    "issuer": "https://login.example.com/tenant/v2.0",
}


def staff_claims(**overrides):
    claims = {
        "sub": "subject-1",
        "oid": "object-1",
        "name": "Neo Kebadile",
        "preferred_username": "neo.kebadile@ceda.co.bw",
        "groups": [],
    }
    claims.update(overrides)
    return claims


@override_settings(**SSO_SETTINGS)
class StaffSSOApiTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        set_features(self, staff_sso=True)
        self.client = APIClient()
        patcher = patch.object(CedaStaffIdentityProvider, "_discovery", return_value=DISCOVERY)
        patcher.start()
        self.addCleanup(patcher.stop)

    def _sign_in(self, claims):
        start = self.client.post("/api/auth/social/ceda_staff/start/", {}, format="json")
        self.assertEqual(start.status_code, 200, start.content)
        state = start.json()["authorization_url"].split("state=")[1].split("&")[0]
        with patch.object(CedaStaffIdentityProvider, "exchange_code_for_claims", return_value=claims):
            return self.client.post("/api/auth/social/ceda_staff/complete/", {"code": "auth-code", "state": state}, format="json")

    def test_provider_is_listed_and_enabled(self):
        providers = {item["id"]: item for item in IdentityProviderRegistry.list_social_providers()}
        self.assertTrue(providers["ceda_staff"]["enabled"])

    def test_allowed_domain_creates_staff_account(self):
        response = self._sign_in(staff_claims())
        self.assertEqual(response.status_code, 200, response.content)
        body = response.json()
        self.assertTrue(body["created"])
        self.assertEqual(body["provider"], "ceda_staff")
        user = User.objects.get(email="neo.kebadile@ceda.co.bw")
        self.assertTrue(user.is_staff)
        active_roles = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        self.assertEqual(active_roles, {RoleType.STAFF_MEMBER})
        self.assertIn(RoleType.STAFF_MEMBER, body["user"]["roles"])
        self.assertTrue(SocialAccount.objects.filter(user=user, provider="ceda_staff", provider_user_id="object-1").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="staff_sso_access_granted", target_id=str(user.id)).exists())

    def test_allowed_group_with_other_domain_is_let_in(self):
        response = self._sign_in(staff_claims(preferred_username="consultant@partner.example", groups=["Portal-Staff-Group"]))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(User.objects.get(email="consultant@partner.example").is_staff)

    def test_domain_not_on_allow_list_is_refused(self):
        response = self._sign_in(staff_claims(preferred_username="someone@gmail.com", email="someone@gmail.com"))
        self.assertEqual(response.status_code, 403)
        self.assertFalse(User.objects.filter(email="someone@gmail.com").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="staff_sso_refused").exists())

    def test_lookalike_domain_is_refused(self):
        response = self._sign_in(staff_claims(preferred_username="a@notceda.co.bw"))
        self.assertEqual(response.status_code, 403)
        response = self._sign_in(staff_claims(preferred_username="a@ceda.co.bw.evil.example"))
        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.count(), 0)

    @override_settings(CEDA_SSO_ALLOWED_DOMAINS=[], CEDA_SSO_ALLOWED_GROUPS=[])
    def test_empty_allow_lists_refuse_everyone(self):
        response = self._sign_in(staff_claims())
        self.assertEqual(response.status_code, 403)
        self.assertEqual(User.objects.count(), 0)

    def test_existing_admin_keeps_roles(self):
        admin = User.objects.create_user(email="neo.kebadile@ceda.co.bw", password="StrongPass123!", first_name="Neo", last_name="K", email_verified=True)
        RoleService.assign_roles(admin, [RoleType.ADMINISTRATOR])
        response = self._sign_in(staff_claims())
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()["created"])
        active_roles = set(admin.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        self.assertEqual(active_roles, {RoleType.ADMINISTRATOR})

    def test_existing_innovator_with_staff_email_gains_staff_role(self):
        user = User.objects.create_user(email="neo.kebadile@ceda.co.bw", password="StrongPass123!", first_name="Neo", last_name="K", email_verified=True)
        RoleService.assign_roles(user, [RoleType.INNOVATOR])
        response = self._sign_in(staff_claims())
        self.assertEqual(response.status_code, 200, response.content)
        active_roles = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        self.assertEqual(active_roles, {RoleType.INNOVATOR, RoleType.STAFF_MEMBER})

    @override_settings(CEDA_SSO_DEFAULT_ROLE="administrator")
    def test_default_role_cannot_be_administrator(self):
        response = self._sign_in(staff_claims())
        self.assertEqual(response.status_code, 200, response.content)
        user = User.objects.get(email="neo.kebadile@ceda.co.bw")
        self.assertFalse(user.roles.filter(code=RoleType.ADMINISTRATOR).exists())


class StaffSSODisabledTests(TestCase):
    def setUp(self):
        set_features(self, staff_sso=True)

    @override_settings(CEDA_SSO_CLIENT_ID="", CEDA_SSO_CLIENT_SECRET="", CEDA_SSO_REDIRECT_URI="", CEDA_SSO_DISCOVERY_URL="")
    def test_start_is_refused_when_not_configured(self):
        response = APIClient().post("/api/auth/social/ceda_staff/start/", {}, format="json")
        self.assertEqual(response.status_code, 400)
        providers = {item["id"]: item for item in IdentityProviderRegistry.list_social_providers()}
        self.assertFalse(providers["ceda_staff"]["enabled"])
