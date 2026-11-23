import base64
import hashlib
import hmac
import json
import logging
from contextlib import contextmanager
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.identity_providers import ConfiguredStaffIdentityProvider, IdentityProviderRegistry
from apps.accounts.models import LoginCode, User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog
from apps.communications.senders import LocMemMessageSender, MessageSenderRegistry
from apps.core.constants import CommunicationStatus, RoleType
from apps.platform_config.crypto import decrypt_secrets
from apps.platform_config.http import HttpResult
from apps.platform_config.models import FeatureFlag, IntegrationConnection, SSOTrialSession
from apps.platform_config.testing import reset_platform_caches, set_features

BASE = "/api/platform"
TENANT = "11111111-2222-3333-4444-555555555555"
ENTRA_SECRET = "entra-client-secret-9xQa"
TWILIO_TOKEN = "twilio-auth-token-ZZ42"
TWILIO_SID = "AC123"

ENTRA_DISCOVERY_URL = f"https://login.microsoftonline.com/{TENANT}/v2.0/.well-known/openid-configuration"
ENTRA_DISCOVERY = {
    "issuer": f"https://login.microsoftonline.com/{TENANT}/v2.0",
    "jwks_uri": f"https://login.microsoftonline.com/{TENANT}/discovery/v2.0/keys",
    "token_endpoint": f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/token",
    "authorization_endpoint": f"https://login.microsoftonline.com/{TENANT}/oauth2/v2.0/authorize",
}

TWILIO_ACCOUNT_URL = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}.json"
TWILIO_MESSAGES_URL = f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_SID}/Messages.json"


class FakeHttp:
    """Stands in for apps.platform_config.http.request. No network in tests."""

    def __init__(self, routes=None):
        self.routes = dict(routes or {})
        self.calls = []

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        for prefix, result in self.routes.items():
            if url.startswith(prefix):
                return result(url, kwargs) if callable(result) else result
        return HttpResult(status=404, text="not found")


def entra_http(token_ok=True):
    return FakeHttp(
        {
            ENTRA_DISCOVERY_URL: HttpResult(200, ENTRA_DISCOVERY),
            ENTRA_DISCOVERY["jwks_uri"]: HttpResult(200, {"keys": [{"kid": "k1"}]}),
            ENTRA_DISCOVERY["token_endpoint"]: (
                HttpResult(200, {"access_token": "token"})
                if token_ok
                else HttpResult(401, {"error": "invalid_client", "error_description": "Invalid client secret provided."})
            ),
        }
    )


def twilio_http(send_ok=True):
    return FakeHttp(
        {
            TWILIO_MESSAGES_URL: (
                HttpResult(201, {"sid": "SM0001", "status": "queued"})
                if send_ok
                else HttpResult(400, {"message": "The 'To' number is not valid."})
            ),
            TWILIO_ACCOUNT_URL: HttpResult(200, {"status": "active"}),
        }
    )


@contextmanager
def captured_logs():
    records = []

    class _Handler(logging.Handler):
        def emit(self, record):
            records.append(record.getMessage())

    handler = _Handler(level=logging.DEBUG)
    root = logging.getLogger()
    previous = root.level
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    try:
        yield records
    finally:
        root.removeHandler(handler)
        root.setLevel(previous)


@override_settings(
    PUBLIC_BASE_URL="https://portal.example.com",
    MESSAGE_SENDERS={"sms": "", "whatsapp": "", "ussd": ""},
)
class PlatformSettingsTestBase(TestCase):
    def setUp(self):
        cache.clear()
        reset_platform_caches(self)
        LocMemMessageSender.outbox = []
        RoleService.ensure_default_roles()
        self.admin = User.objects.create_user(email="admin@ceda.co.bw", password="StrongPass123!", first_name="Ada", last_name="Admin")
        RoleService.assign_roles(self.admin, [RoleType.ADMINISTRATOR])
        self.officer = User.objects.create_user(email="officer@ceda.co.bw", password="StrongPass123!", first_name="Ofi", last_name="Cer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    # helpers -----------------------------------------------------------------

    def create_entra(self, **config):
        payload = {
            "kind": "sso",
            "provider": "microsoft_entra",
            "name": "CEDA Entra",
            "config": {"tenant_id": TENANT, "client_id": "client-1", "allowed_domains": ["ceda.co.bw"], **config},
            "secrets": {"client_secret": ENTRA_SECRET},
        }
        response = self.client.post(f"{BASE}/integrations/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["data"]

    def create_twilio(self, **config):
        payload = {
            "kind": "sms",
            "provider": "twilio",
            "name": "Twilio",
            "config": {"account_sid": TWILIO_SID, "from_number": "+15005550006", **config},
            "secrets": {"auth_token": TWILIO_TOKEN},
        }
        response = self.client.post(f"{BASE}/integrations/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["data"]

    def run_test(self, connection_id, fake, **body):
        with patch("apps.platform_config.http.request", fake):
            return self.client.post(f"{BASE}/integrations/{connection_id}/test/", body, format="json")

    def activate(self, connection_id):
        return self.client.post(f"{BASE}/integrations/{connection_id}/activate/", {}, format="json")

    def make_active_entra(self):
        connection = self.create_entra()
        self.assertTrue(self.run_test(connection["id"], entra_http()).json()["data"]["result"]["ok"])
        self.assertEqual(self.activate(connection["id"]).status_code, 200)
        return connection

    def make_active_twilio(self, **config):
        connection = self.create_twilio(**config)
        self.assertTrue(self.run_test(connection["id"], twilio_http()).json()["data"]["result"]["ok"])
        self.assertEqual(self.activate(connection["id"]).status_code, 200)
        return connection


class SecretHandlingTests(PlatformSettingsTestBase):
    def test_secrets_are_encrypted_and_never_returned_or_logged(self):
        with captured_logs() as logs:
            connection = self.create_entra()
            self.run_test(connection["id"], entra_http(token_ok=False))
            detail = self.client.get(f"{BASE}/integrations/{connection['id']}/")
            listing = self.client.get(f"{BASE}/integrations/?kind=sso")
        row = IntegrationConnection.objects.get(id=connection["id"])
        self.assertNotIn(ENTRA_SECRET, row.secrets_encrypted)
        self.assertEqual(decrypt_secrets(row.secrets_encrypted)["client_secret"], ENTRA_SECRET)
        self.assertNotIn(ENTRA_SECRET, json.dumps(row.config))
        self.assertNotIn(ENTRA_SECRET, json.dumps(row.last_test_result))
        for response in (detail, listing):
            self.assertNotIn(ENTRA_SECRET, response.content.decode())
        # U9: keys are write-only, not even the last four characters come back.
        self.assertEqual(detail.json()["data"]["secrets"]["client_secret"], {"is_set": True, "last4": ""})
        for entry in AuditLog.objects.all():
            self.assertNotIn(ENTRA_SECRET, json.dumps([entry.metadata, entry.before_state, entry.after_state]))
        for message in logs:
            self.assertNotIn(ENTRA_SECRET, message)

    def test_secret_echoed_by_provider_is_scrubbed_from_results(self):
        connection = self.create_twilio()
        echo = FakeHttp({TWILIO_ACCOUNT_URL: HttpResult(500, {}, error=f"Bad token {TWILIO_TOKEN}")})
        result = self.run_test(connection["id"], echo).json()["data"]["result"]
        self.assertNotIn(TWILIO_TOKEN, json.dumps(result))

    def test_empty_value_keeps_secret_and_null_clears_it(self):
        connection = self.create_entra()
        url = f"{BASE}/integrations/{connection['id']}/"
        self.client.patch(url, {"secrets": {"client_secret": ""}}, format="json")
        row = IntegrationConnection.objects.get(id=connection["id"])
        self.assertEqual(decrypt_secrets(row.secrets_encrypted)["client_secret"], ENTRA_SECRET)
        response = self.client.patch(url, {"secrets": {"client_secret": None}}, format="json")
        self.assertEqual(response.json()["data"]["secrets"]["client_secret"], {"is_set": False, "last4": ""})
        row.refresh_from_db()
        self.assertNotIn("client_secret", decrypt_secrets(row.secrets_encrypted))

    def test_unknown_settings_and_secrets_in_wrong_place_are_refused(self):
        connection = self.create_entra()
        url = f"{BASE}/integrations/{connection['id']}/"
        self.assertEqual(self.client.patch(url, {"config": {"client_secret": "x"}}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"config": {"nonsense": "x"}}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"secrets": {"tenant_id": "x"}}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(url, {"provider": "generic_oidc"}, format="json").status_code, 400)

    def test_create_validation(self):
        self.assertEqual(self.client.post(f"{BASE}/integrations/", {"kind": "sso"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"{BASE}/integrations/", {"provider": "nope"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"{BASE}/integrations/", {"kind": "sms", "provider": "microsoft_entra"}, format="json").status_code, 400)


class StatusAndActivationTests(PlatformSettingsTestBase):
    def test_any_change_resets_status_to_draft_and_switches_off(self):
        set_features(self, password_sign_in=True)
        connection = self.make_active_twilio()
        row = IntegrationConnection.objects.get(id=connection["id"])
        self.assertTrue(row.is_active)
        response = self.client.patch(f"{BASE}/integrations/{connection['id']}/", {"config": {"from_number": "+15005550007"}}, format="json")
        data = response.json()["data"]
        self.assertEqual(data["status"], "draft")
        self.assertFalse(data["is_active"])
        response = self.client.patch(f"{BASE}/integrations/{connection['id']}/", {"secrets": {"auth_token": "another-token-1234"}}, format="json")
        self.assertEqual(response.json()["data"]["status"], "draft")

    def test_renaming_does_not_reset_status(self):
        connection = self.create_twilio()
        self.run_test(connection["id"], twilio_http())
        response = self.client.patch(f"{BASE}/integrations/{connection['id']}/", {"name": "Twilio (main)"}, format="json")
        self.assertEqual(response.json()["data"]["status"], "tested")

    def test_activate_refused_without_passed_test(self):
        connection = self.create_twilio()
        response = self.activate(connection["id"])
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "activation_blocked")
        failing = FakeHttp({TWILIO_ACCOUNT_URL: HttpResult(401, {"message": "Authenticate"})})
        result = self.run_test(connection["id"], failing).json()["data"]
        self.assertFalse(result["result"]["ok"])
        self.assertEqual(result["connection"]["status"], "failed")
        self.assertEqual(self.activate(connection["id"]).status_code, 400)

    def test_activate_refused_when_test_is_older_than_24_hours(self):
        connection = self.create_twilio()
        self.run_test(connection["id"], twilio_http())
        IntegrationConnection.objects.filter(id=connection["id"]).update(last_tested_at=timezone.now() - timezone.timedelta(hours=25))
        response = self.activate(connection["id"])
        self.assertEqual(response.status_code, 400)
        self.assertIn("24 hours", response.json()["errors"]["detail"])

    def test_only_one_active_connection_per_kind(self):
        first = self.make_active_twilio()
        second = self.make_active_twilio(from_number="+15005550009")
        active = IntegrationConnection.objects.filter(kind="sms", is_active=True)
        self.assertEqual(list(active.values_list("id", flat=True)), [IntegrationConnection.objects.get(id=second["id"]).id])
        self.assertEqual(IntegrationConnection.objects.get(id=first["id"]).status, "disabled")

    def test_test_steps_are_reported(self):
        connection = self.create_entra()
        result = self.run_test(connection["id"], entra_http()).json()["data"]["result"]
        self.assertTrue(result["ok"])
        self.assertEqual(
            [step["step"] for step in result["steps"]],
            ["Settings complete", "Discovery document loads", "Issuer matches", "Signing keys load", "Client ID and secret accepted"],
        )
        for step in result["steps"]:
            self.assertIn("ms", step)

    def test_wrong_issuer_and_bad_secret_fail(self):
        connection = self.create_entra()
        bad = entra_http(token_ok=False)
        bad.routes[ENTRA_DISCOVERY_URL] = HttpResult(200, {**ENTRA_DISCOVERY, "issuer": "https://evil.example.com"})
        result = self.run_test(connection["id"], bad).json()["data"]["result"]
        self.assertFalse(result["ok"])
        failed = {step["step"] for step in result["steps"] if not step["ok"]}
        self.assertEqual(failed, {"Issuer matches", "Client ID and secret accepted"})

    def test_history_lists_changes(self):
        connection = self.create_twilio()
        self.run_test(connection["id"], twilio_http())
        history = self.client.get(f"{BASE}/integrations/{connection['id']}/history/").json()["data"]
        self.assertEqual([item["action_type"] for item in history][:2], ["integration_tested", "integration_created"])


class SSOSettingsTests(PlatformSettingsTestBase):
    def test_administrator_cannot_be_mapped_or_default(self):
        response = self.client.post(
            f"{BASE}/integrations/",
            {"kind": "sso", "provider": "generic_oidc", "config": {"issuer_url": "https://id.example.com", "group_role_map": {"admins": "administrator"}}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("config.group_role_map", response.json()["errors"])
        response = self.client.post(
            f"{BASE}/integrations/",
            {"kind": "sso", "provider": "generic_oidc", "config": {"issuer_url": "https://id.example.com", "default_role": "administrator"}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_empty_allow_lists_save_with_warning(self):
        data = self.create_entra(allowed_domains=[], allowed_groups=[])
        self.assertTrue(any("nobody" in warning for warning in data["warnings"]))

    def test_redirect_uri_is_shown(self):
        data = self.create_entra()
        self.assertEqual(data["redirect_uri"], "https://portal.example.com/auth/callback")

    def test_common_tenant_is_refused(self):
        response = self.client.post(
            f"{BASE}/integrations/",
            {"kind": "sso", "provider": "microsoft_entra", "config": {"tenant_id": "common", "client_id": "c"}},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_providers_endpoint_returns_field_schemas(self):
        data = self.client.get(f"{BASE}/providers/?kind=sms").json()["data"]
        keys = {item["key"] for item in data}
        self.assertEqual(keys, {"twilio", "infobip", "africas_talking", "generic_http", "log_only"})
        twilio = next(item for item in data if item["key"] == "twilio")
        auth_token = next(field for field in twilio["fields"] if field["name"] == "auth_token")
        self.assertTrue(auth_token["secret"])
        sso = {item["key"] for item in self.client.get(f"{BASE}/providers/?kind=sso").json()["data"]}
        self.assertEqual(sso, {"microsoft_entra", "google_workspace", "generic_oidc"})


class SSOTrialTests(PlatformSettingsTestBase):
    def _start(self, connection_id):
        with patch("apps.accounts.identity_providers._http_json", return_value=ENTRA_DISCOVERY):
            response = self.client.post(f"{BASE}/integrations/{connection_id}/sso-trial/start/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        url = response.json()["data"]["authorization_url"]
        return url.split("state=")[1].split("&")[0]

    def _complete(self, state, claims):
        client = APIClient()
        with patch.object(ConfiguredStaffIdentityProvider, "exchange_code_for_claims", return_value=claims):
            return client.post(f"{BASE}/sso-trial/complete/", {"code": "c", "state": state}, format="json")

    def test_trial_creates_no_user_or_session_and_counts_as_test(self):
        connection = self.create_entra(group_role_map={"grp-officers": "innovation_officer"})
        state = self._start(connection["id"])
        users_before = User.objects.count()
        response = self._complete(state, {"sub": "s", "oid": "o", "name": "Neo K", "preferred_username": "neo@ceda.co.bw", "groups": ["GRP-OFFICERS"]})
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual(data["kind"], "sso_trial")
        self.assertTrue(data["ok"])
        self.assertEqual(data["trial"]["email"], "neo@ceda.co.bw")
        self.assertEqual(data["trial"]["groups"], ["grp-officers"])
        trial_result = IntegrationConnection.objects.get(id=connection["id"]).last_test_result["trial"]
        self.assertTrue(trial_result["allowed"])
        self.assertEqual(trial_result["role"], "innovation_officer")
        self.assertNotIn("access", data)
        self.assertNotIn("refresh", data)
        self.assertEqual(User.objects.count(), users_before)
        self.assertNotIn("sessionid", response.cookies)
        self.assertEqual(IntegrationConnection.objects.get(id=connection["id"]).status, "tested")

    def test_trial_reports_refusal(self):
        connection = self.create_entra()
        state = self._start(connection["id"])
        self._complete(state, {"sub": "s", "preferred_username": "someone@gmail.com"})
        trial = IntegrationConnection.objects.get(id=connection["id"]).last_test_result["trial"]
        self.assertFalse(trial["allowed"])
        self.assertTrue(trial["reason"])
        self.assertEqual(User.objects.filter(email="someone@gmail.com").count(), 0)

    def test_trial_state_is_single_use(self):
        connection = self.create_entra()
        state = self._start(connection["id"])
        self._complete(state, {"sub": "s", "preferred_username": "neo@ceda.co.bw"})
        self.assertEqual(self._complete(state, {"sub": "s", "preferred_username": "neo@ceda.co.bw"}).status_code, 400)
        self.assertEqual(self._complete("sso-trial.unknown", {}).status_code, 400)
        self.assertEqual(SSOTrialSession.objects.filter(used_at__isnull=False).count(), 1)


class RuntimeSourceTests(PlatformSettingsTestBase):
    def test_sso_runtime_uses_database_then_falls_back_to_environment(self):
        set_features(self, staff_sso=True, password_sign_in=True)
        self.assertNotIsInstance(IdentityProviderRegistry.staff_provider(), ConfiguredStaffIdentityProvider)
        connection = self.make_active_entra()
        provider = IdentityProviderRegistry.staff_provider()
        self.assertIsInstance(provider, ConfiguredStaffIdentityProvider)
        self.assertEqual(provider.config()["client_id"], "client-1")
        self.assertEqual(provider.config()["client_secret"], ENTRA_SECRET)
        runtime = self.client.get(f"{BASE}/integrations/runtime/").json()["data"]
        self.assertEqual(runtime["sso"]["source"], "database")
        self.assertEqual(self.client.post(f"{BASE}/integrations/{connection['id']}/deactivate/", {}, format="json").status_code, 200)
        self.assertNotIsInstance(IdentityProviderRegistry.staff_provider(), ConfiguredStaffIdentityProvider)
        self.assertEqual(self.client.get(f"{BASE}/integrations/runtime/").json()["data"]["sso"]["source"], "none")

    @override_settings(MESSAGE_SENDERS={"sms": "apps.communications.senders.LocMemMessageSender", "whatsapp": "", "ussd": ""})
    def test_sms_runtime_uses_database_over_environment(self):
        set_features(self, sms_messages=True)
        result = MessageSenderRegistry.deliver(channel="sms", to="+26771234567", body="hello")
        self.assertEqual(result.provider, "environment")
        self.assertEqual(len(LocMemMessageSender.outbox), 1)
        self.assertEqual(self.client.get(f"{BASE}/integrations/runtime/").json()["data"]["sms"]["source"], "environment")
        self.make_active_twilio()
        fake = twilio_http()
        with patch("apps.platform_config.http.request", fake):
            result = MessageSenderRegistry.deliver(channel="sms", to="+26771234567", body="hello")
        self.assertEqual(result.provider, "twilio")
        self.assertEqual(result.message_id, "SM0001")
        self.assertEqual(len(LocMemMessageSender.outbox), 1)
        self.assertEqual(fake.calls[-1][1]["form"]["To"], "+26771234567")
        self.assertEqual(self.client.get(f"{BASE}/integrations/runtime/").json()["data"]["sms"]["source"], "database")


class SignInSafetyRuleTests(PlatformSettingsTestBase):
    def test_password_sign_in_cannot_be_turned_off_without_working_sso(self):
        response = self.client.patch(f"{BASE}/features/password_sign_in/", {"enabled": False}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "staff_lockout")
        self.assertTrue(FeatureFlag.objects.get(key="password_sign_in").enabled)

        set_features(self, staff_sso=True)
        self.assertEqual(self.client.patch(f"{BASE}/features/password_sign_in/", {"enabled": False}, format="json").status_code, 400)

        connection = self.make_active_entra()
        response = self.client.patch(f"{BASE}/features/password_sign_in/", {"enabled": False}, format="json")
        self.assertEqual(response.status_code, 200, response.content)

        # Now SSO is the only way in: it cannot be switched off, edited away or deleted.
        self.assertEqual(self.client.patch(f"{BASE}/features/staff_sso/", {"enabled": False}, format="json").status_code, 400)
        self.assertEqual(self.client.post(f"{BASE}/integrations/{connection['id']}/deactivate/", {}, format="json").status_code, 400)
        self.assertEqual(self.client.delete(f"{BASE}/integrations/{connection['id']}/").status_code, 400)
        self.assertEqual(
            self.client.patch(f"{BASE}/integrations/{connection['id']}/", {"config": {"client_id": "other"}}, format="json").status_code,
            400,
        )
        self.assertTrue(IntegrationConnection.objects.get(id=connection["id"]).is_active)

    def test_coming_soon_feature_cannot_be_switched_on(self):
        # C2 made WhatsApp and USSD real, so mark a switch as coming soon here.
        FeatureFlag.objects.filter(key="translation_suggestions").update(coming_soon=True)
        response = self.client.patch(f"{BASE}/features/translation_suggestions/", {"enabled": True}, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["errors"]["code"], "coming_soon")

    def test_whatsapp_and_ussd_switches_are_no_longer_coming_soon(self):
        for key in ("whatsapp_messages", "ussd"):
            response = self.client.patch(f"{BASE}/features/{key}/", {"enabled": True}, format="json")
            self.assertEqual(response.status_code, 200, key)

    def test_flag_changes_are_audited(self):
        self.client.patch(f"{BASE}/features/public_search/", {"enabled": False}, format="json")
        entry = AuditLog.objects.get(action_type="feature_flag_changed", target_id="public_search")
        self.assertEqual(entry.after_state, {"enabled": False})
        flags = {item["key"]: item for item in self.client.get(f"{BASE}/features/").json()["data"]}
        self.assertFalse(flags["public_search"]["enabled"])
        self.assertEqual(flags["public_search"]["updated_by"]["id"], str(self.admin.id))

    def test_feature_validation(self):
        self.assertEqual(self.client.patch(f"{BASE}/features/public_search/", {}, format="json").status_code, 400)
        self.assertEqual(self.client.patch(f"{BASE}/features/does-not-exist/", {"enabled": True}, format="json").status_code, 404)


class SwitchedOffFeatureTests(PlatformSettingsTestBase):
    def _assert_disabled(self, response, feature):
        self.assertEqual(response.status_code, 404, response.content)
        self.assertEqual(response.json()["errors"]["code"], "feature_disabled")
        self.assertEqual(response.json()["errors"]["feature"], feature)

    def test_code_sign_in_off(self):
        set_features(self, code_sign_in=False)
        client = APIClient()
        self._assert_disabled(client.post("/api/auth/otp/request/", {"email": "a@example.com"}, format="json"), "code_sign_in")
        self._assert_disabled(client.post("/api/auth/otp/verify/", {"email": "a@example.com", "code": "123456"}, format="json"), "code_sign_in")

    def test_password_sign_in_off(self):
        set_features(self, password_sign_in=False)
        client = APIClient()
        self._assert_disabled(client.post("/api/auth/login/", {"email": "admin@ceda.co.bw", "password": "StrongPass123!"}, format="json"), "password_sign_in")

    def test_staff_sso_off(self):
        set_features(self, staff_sso=False)
        self._assert_disabled(APIClient().post("/api/auth/social/ceda_staff/start/", {}, format="json"), "staff_sso")
        providers = {item["id"]: item for item in IdentityProviderRegistry.list_social_providers()}
        self.assertFalse(providers["ceda_staff"]["enabled"])

    def test_phone_code_needs_sms_switched_on(self):
        set_features(self, code_sign_in=True, sms_messages=False)
        self._assert_disabled(APIClient().post("/api/auth/otp/request/", {"phone": "71234567"}, format="json"), "sms_messages")
        # Email codes still work.
        self.assertEqual(APIClient().post("/api/auth/otp/request/", {"email": "a@example.com"}, format="json").status_code, 200)


class SMSRuntimeTests(PlatformSettingsTestBase):
    def test_sms_switched_off_is_skipped(self):
        set_features(self, sms_messages=False)
        result = MessageSenderRegistry.deliver(channel="sms", to="+26771234567", body="hi")
        self.assertEqual(result.status, "skipped")
        self.assertIn("switched off", result.reason)

    def test_sign_in_code_goes_through_active_connection_and_is_logged_without_code(self):
        set_features(self, sms_messages=True, code_sign_in=True)
        self.make_active_twilio()
        fake = twilio_http()
        with patch("apps.platform_config.http.request", fake), patch(
            "apps.accounts.otp_services.OTPService._generate_code", return_value="246810"
        ):
            response = APIClient().post("/api/auth/otp/request/", {"phone": "71234567"}, format="json")
        self.assertEqual(response.status_code, 200)
        send = [call for call in fake.calls if call[0] == TWILIO_MESSAGES_URL][-1]
        self.assertIn("246810", send[1]["form"]["Body"])
        log = CommunicationLog.objects.get(subject="Sign-in code")
        self.assertEqual(log.provider, "twilio")
        self.assertEqual(log.provider_message_id, "SM0001")
        self.assertEqual(log.status, CommunicationStatus.SENT)
        self.assertEqual(log.rendered_body, "sign-in code")
        self.assertIsNone(log.recipient)
        self.assertEqual(log.to_address, "+26771234567")

    def test_failed_send_is_recorded(self):
        set_features(self, sms_messages=True)
        self.make_active_twilio()
        with patch("apps.platform_config.http.request", twilio_http(send_ok=False)):
            from apps.communications.services import CommunicationService

            log, result = CommunicationService.record_text_message(channel="sms", to="+26771234567", body_for_log="hi", subject="Test")
        self.assertEqual(log.status, CommunicationStatus.FAILED)
        self.assertIn("not valid", log.failure_reason)

    def test_daily_limit(self):
        set_features(self, sms_messages=True)
        self.make_active_twilio(daily_limit=1)
        with patch("apps.platform_config.http.request", twilio_http()):
            first = MessageSenderRegistry.deliver(channel="sms", to="+26771234567", body="1")
            CommunicationLog.objects.create(channel="sms", to_address="+26771234567", rendered_body="1", provider="twilio", status=CommunicationStatus.SENT)
            second = MessageSenderRegistry.deliver(channel="sms", to="+26771234567", body="2")
        self.assertEqual(first.status, "sent")
        self.assertEqual(second.status, "skipped")
        self.assertIn("daily limit", second.reason)

    def test_per_number_sign_in_code_limit(self):
        set_features(self, sms_messages=True, code_sign_in=True)
        self.make_active_twilio(codes_per_number_per_hour=2)
        with patch("apps.platform_config.http.request", twilio_http()):
            for _ in range(3):
                cache.clear()
                reset_platform_caches(self)
                APIClient().post("/api/auth/otp/request/", {"phone": "71234567"}, format="json")
        self.assertEqual(LoginCode.objects.filter(target="+26771234567").count(), 2)

    def test_send_test_message_from_console(self):
        connection = self.create_twilio()
        fake = twilio_http()
        response = self.run_test(connection["id"], fake, phone="71234567")
        result = response.json()["data"]["result"]
        self.assertTrue(result["ok"])
        self.assertEqual(result["message_id"], "SM0001")
        self.assertEqual([call for call in fake.calls if call[0] == TWILIO_MESSAGES_URL][0][1]["form"]["Body"], "CEDA Innovation Portal test message")
        self.assertNotIn("71234567", json.dumps(IntegrationConnection.objects.get(id=connection["id"]).config))


class DeliveryReceiptTests(PlatformSettingsTestBase):
    def _twilio_signature(self, url, params):
        payload = url + "".join(f"{key}{params[key]}" for key in sorted(params))
        return base64.b64encode(hmac.new(TWILIO_TOKEN.encode(), payload.encode(), hashlib.sha1).digest()).decode()

    def test_twilio_receipt_with_valid_signature_updates_log(self):
        connection = self.create_twilio()
        log = CommunicationLog.objects.create(channel="sms", to_address="+26771234567", rendered_body="x", provider="twilio", provider_message_id="SM9", status=CommunicationStatus.SENT)
        url = f"https://portal.example.com/api/platform/integrations/{connection['id']}/sms-status/"
        params = {"MessageSid": "SM9", "MessageStatus": "undelivered", "ErrorCode": "30003"}
        response = APIClient().post(
            f"{BASE}/integrations/{connection['id']}/sms-status/",
            params,
            format="multipart",
            HTTP_X_TWILIO_SIGNATURE=self._twilio_signature(url, params),
        )
        self.assertEqual(response.status_code, 200, response.content)
        log.refresh_from_db()
        self.assertEqual(log.status, CommunicationStatus.FAILED)
        self.assertEqual(log.provider_status, "undelivered")

    def test_twilio_receipt_with_bad_signature_is_refused(self):
        connection = self.create_twilio()
        response = APIClient().post(
            f"{BASE}/integrations/{connection['id']}/sms-status/",
            {"MessageSid": "SM9", "MessageStatus": "delivered"},
            format="multipart",
            HTTP_X_TWILIO_SIGNATURE="forged",
        )
        self.assertEqual(response.status_code, 403)

    def test_token_based_receipt(self):
        payload = {"kind": "sms", "provider": "generic_http", "config": {"url": "https://sms.example.bw/send"}, "secrets": {"webhook_secret": "receipt-secret-1"}}
        connection = self.client.post(f"{BASE}/integrations/", payload, format="json").json()["data"]
        log = CommunicationLog.objects.create(channel="sms", to_address="+26771234567", rendered_body="x", provider="generic_http", provider_message_id="m-1", status=CommunicationStatus.SENT)
        url = f"{BASE}/integrations/{connection['id']}/sms-status/"
        self.assertEqual(APIClient().post(f"{url}?token=wrong", {"message_id": "m-1", "status": "failed"}, format="json").status_code, 403)
        self.assertEqual(APIClient().post(f"{url}?token=receipt-secret-1", {"message_id": "m-1", "status": "failed", "error": "No route"}, format="json").status_code, 200)
        log.refresh_from_db()
        self.assertEqual(log.status, CommunicationStatus.FAILED)
        self.assertEqual(log.failure_reason, "No route")


class GenericHttpProviderTests(PlatformSettingsTestBase):
    def test_body_template_is_filled_and_response_read(self):
        set_features(self, sms_messages=True)
        payload = {
            "kind": "sms",
            "provider": "generic_http",
            "config": {
                "url": "https://sms.example.bw/send",
                "body_template": '{"msisdn": "{{to}}", "text": "{{message}}"}',
                "success_path": "result.code",
                "success_value": "0",
                "message_id_path": "result.id",
            },
            "secrets": {"headers": {"X-Api-Key": "gateway-key-777"}},
        }
        connection = self.client.post(f"{BASE}/integrations/", payload, format="json").json()["data"]
        fake = FakeHttp({"https://sms.example.bw/send": HttpResult(200, {"result": {"code": 0, "id": "abc"}})})
        result = self.run_test(connection["id"], fake, phone="71234567").json()["data"]["result"]
        self.assertTrue(result["ok"], result)
        sent = fake.calls[-1][1]
        self.assertEqual(sent["json_body"], {"msisdn": "+26771234567", "text": "CEDA Innovation Portal test message"})
        self.assertEqual(sent["headers"]["X-Api-Key"], "gateway-key-777")
        self.assertEqual(result["message_id"], "abc")
        detail = self.client.get(f"{BASE}/integrations/{connection['id']}/").content.decode()
        self.assertNotIn("gateway-key-777", detail)


class PublicConfigTests(PlatformSettingsTestBase):
    def test_public_config_shows_only_public_flags_and_sso_state(self):
        client = APIClient()
        data = client.get(f"{BASE}/public-config/").json()["data"]
        self.assertNotIn("sms_messages", data["features"])
        self.assertIn("password_sign_in", data["features"])
        self.assertFalse(data["sign_in"]["sso"]["active"])
        self.assertEqual(data["sign_in"]["sso"]["label"], "Sign in with CEDA account")
        set_features(self, staff_sso=True)
        self.make_active_entra()
        cache.clear()
        data = client.get(f"{BASE}/public-config/").json()["data"]
        self.assertTrue(data["sign_in"]["sso"]["active"])
        self.assertNotIn(ENTRA_SECRET, json.dumps(data))
        self.assertNotIn("client-1", json.dumps(data))


class AdministratorOnlyTests(PlatformSettingsTestBase):
    def test_non_administrators_get_403_everywhere(self):
        connection = self.create_twilio()
        cid = connection["id"]
        self.client.force_authenticate(self.officer)
        calls = [
            ("get", f"{BASE}/features/"),
            ("patch", f"{BASE}/features/public_search/"),
            ("get", f"{BASE}/providers/"),
            ("get", f"{BASE}/integrations/"),
            ("post", f"{BASE}/integrations/"),
            ("get", f"{BASE}/integrations/runtime/"),
            ("get", f"{BASE}/integrations/{cid}/"),
            ("patch", f"{BASE}/integrations/{cid}/"),
            ("delete", f"{BASE}/integrations/{cid}/"),
            ("post", f"{BASE}/integrations/{cid}/test/"),
            ("post", f"{BASE}/integrations/{cid}/activate/"),
            ("post", f"{BASE}/integrations/{cid}/deactivate/"),
            ("get", f"{BASE}/integrations/{cid}/history/"),
            ("post", f"{BASE}/integrations/{cid}/sso-trial/start/"),
        ]
        for method, url in calls:
            response = getattr(self.client, method)(url, {}, format="json")
            self.assertEqual(response.status_code, 403, f"{method.upper()} {url}")
        anonymous = APIClient()
        self.assertEqual(anonymous.get(f"{BASE}/features/").status_code, 401)
        self.assertTrue(IntegrationConnection.objects.filter(id=cid).exists())
