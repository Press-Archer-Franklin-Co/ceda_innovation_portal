"""Email set up in the staff console: presets, write-only password, Testing and Live, one sending path, needs setup."""

import json
import logging
import smtplib
from unittest.mock import patch

from django.core import mail
from django.core.cache import cache
from django.core.mail import send_mail
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog
from apps.communications.services import CommunicationService
from apps.core.constants import CommunicationChannel, CommunicationStatus, RoleType
from apps.platform_config.email_backend import PLATFORM_BACKEND
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.providers import get_provider_class
from apps.platform_config.providers.email import SIGN_IN_FAILED
from apps.platform_config.testing import reset_platform_caches, set_features

BASE = "/api/platform"
PASSWORD = "app-password-SECRET-991"
LOCMEM = "django.core.mail.backends.locmem.EmailBackend"
CONFIG = {"username": "ceda@gmail.com", "from_address": "ceda@gmail.com", "from_name": "CEDA Innovation", "reply_to": "help@ceda.co.bw", "test_recipients": "tester@example.com\nSecond@example.com"}


@override_settings(EMAIL_BACKEND=PLATFORM_BACKEND, PLATFORM_EMAIL_TRANSPORT=LOCMEM)
class Base(TestCase):
    def setUp(self):
        cache.clear()
        reset_platform_caches(self)
        RoleService.ensure_default_roles()
        self.admin = User.objects.create_user(email="admin.mail@example.com", password="StrongPass123", first_name="Lorato")
        RoleService.assign_roles(self.admin, [RoleType.ADMINISTRATOR])
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        mail.outbox = []

    def create(self, provider="email_gmail", **config):
        response = self.client.post(f"{BASE}/integrations/", {"kind": "email", "provider": provider, "name": "Mail", "config": {**CONFIG, **config}, "secrets": {"password": PASSWORD}}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response

    def activate(self, **config):
        connection_id = self.create(**config).json()["data"]["id"]
        tested = self.client.post(f"{BASE}/integrations/{connection_id}/test/", {}, format="json")
        self.assertTrue(tested.json()["data"]["result"]["ok"], tested.content)
        activated = self.client.post(f"{BASE}/integrations/{connection_id}/activate/")
        self.assertEqual(activated.status_code, 200, activated.content)
        reset_platform_caches(self)
        mail.outbox = []
        return connection_id


class ProviderTests(Base):
    def test_presets(self):
        rows = {row["key"]: row for row in self.client.get(f"{BASE}/providers/", {"kind": "email"}).json()["data"]}
        self.assertEqual(set(rows), {"email_gmail", "email_microsoft365", "email_yahoo", "email_smtp"})
        for key, host in (("email_gmail", "smtp.gmail.com"), ("email_microsoft365", "smtp.office365.com"), ("email_yahoo", "smtp.mail.yahoo.com")):
            defaults = get_provider_class(key).defaults()
            self.assertEqual((defaults["host"], defaults["port"], defaults["security"], defaults["environment"]), (host, 587, "tls", "testing"))
        self.assertNotIn("host", get_provider_class("email_smtp").defaults())
        for key in ("email_gmail", "email_yahoo"):
            password = next(item for item in rows[key]["fields"] if item["name"] == "password")
            self.assertTrue(password["secret"])
            self.assertIn("app password", password["help_text"])

    def test_password_never_returned_or_audited(self):
        created = self.create()
        self.assertNotIn("SECRET", created.content.decode())
        connection_id = created.json()["data"]["id"]
        detail = self.client.get(f"{BASE}/integrations/{connection_id}/")
        self.assertEqual(detail.json()["data"]["secrets"]["password"], {"is_set": True, "last4": ""})
        self.client.patch(f"{BASE}/integrations/{connection_id}/", {"config": {"from_name": "CEDA"}, "secrets": {"password": PASSWORD + "2"}}, format="json")
        self.client.post(f"{BASE}/integrations/{connection_id}/test/", {}, format="json")
        self.client.post(f"{BASE}/integrations/{connection_id}/activate/")
        self.client.post(f"{BASE}/integrations/{connection_id}/deactivate/")
        rows = AuditLog.objects.filter(target_model="IntegrationConnection", target_id=connection_id)
        self.assertEqual(set(rows.values_list("action_type", flat=True)), {"integration_created", "integration_updated", "integration_tested", "integration_activated", "integration_deactivated"})
        self.assertNotIn("SECRET", json.dumps([[row.before_state, row.after_state, row.metadata] for row in rows]))
        update = rows.get(action_type="integration_updated")
        self.assertEqual((update.before_state["keys"]["password"], update.after_state["keys"]["password"]), ("set", "set"))
        self.assertEqual((update.before_state["settings"]["from_name"], update.after_state["settings"]["from_name"]), ("CEDA Innovation", "CEDA"))

    def test_bad_settings_are_refused(self):
        for config, field in (({"port": 22}, "config.port"), ({"from_address": "nope"}, "config.from_address"), ({"security": "none"}, "config.security"), ({"from_name": "A\nBcc: x@y.z"}, "config.from_name")):
            response = self.client.post(f"{BASE}/integrations/", {"kind": "email", "provider": "email_smtp", "config": {**CONFIG, "host": "mail.example.com", **config}, "secrets": {"password": PASSWORD}}, format="json")
            self.assertEqual(response.status_code, 400, config)
            self.assertIn(field, response.content.decode(), config)

    def test_connection_result_is_plain(self):
        connection_id = self.create().json()["data"]["id"]
        url = f"{BASE}/integrations/{connection_id}/test/"
        result = self.client.post(url, {}, format="json").json()["data"]["result"]
        self.assertEqual((result["ok"], result["message"]), (True, "Sent to you"))
        self.assertEqual(mail.outbox[-1].to, [self.admin.email])
        error = smtplib.SMTPAuthenticationError(535, f"bad login {PASSWORD}".encode())
        with patch("django.core.mail.backends.locmem.EmailBackend.open", side_effect=error):
            response = self.client.post(url, {}, format="json")
        failed = response.json()["data"]["result"]
        self.assertEqual((failed["ok"], failed["message"]), (False, SIGN_IN_FAILED))
        self.assertNotIn("SECRET", response.content.decode())
        self.assertNotIn("535", response.content.decode())


class SendingTests(Base):
    def test_no_active_connection_logs_and_sends_nothing(self):
        with self.assertLogs("apps.platform_config.email_backend", logging.INFO) as logs:
            self.assertEqual(send_mail("Your code", "The code is 123456", None, ["person@example.com"]), 0)
        self.assertEqual(mail.outbox, [])
        text = " ".join(logs.output)
        self.assertIn("Your code", text)
        self.assertNotIn("123456", text)
        self.assertNotIn("person@", text)

    def test_testing_holds_other_recipients(self):
        self.activate()
        self.assertEqual(send_mail("Hello", "Body", None, ["stranger@example.com"]), 0)
        self.assertEqual(mail.outbox, [])
        self.assertEqual(send_mail("Hello", "Body", None, ["Tester <TESTER@example.com>", "stranger@example.com"]), 1)
        self.assertEqual(mail.outbox[0].to, ["Tester <TESTER@example.com>"])

    def test_live_sends_with_the_connection_identity(self):
        self.activate(environment="live")
        self.assertEqual(send_mail("Hello", "Body", "old@example.com", ["anyone@example.com"]), 1)
        sent = mail.outbox[0]
        self.assertEqual((sent.to, sent.reply_to), (["anyone@example.com"], ["help@ceda.co.bw"]))
        self.assertIn("ceda@gmail.com", sent.from_email)
        self.assertIn("CEDA Innovation", sent.from_email)

    def test_message_log_says_when_email_did_not_leave(self):
        user = User.objects.create_user(email="person@example.com", password="StrongPass123", first_name="Neo")
        log = CommunicationLog.objects.create(recipient=user, channel=CommunicationChannel.EMAIL, subject="Hi", rendered_body="Body", to_address=user.email)
        CommunicationService.dispatch_log(str(log.id))
        log.refresh_from_db()
        self.assertEqual((log.status, log.failure_reason), (CommunicationStatus.FAILED, "Email is not set up yet."))


class NeedsSetupTests(Base):
    def test_email_features_hide_until_active(self):
        set_features(self, subscriptions=True, code_sign_in=True, password_sign_in=True, sms_messages=False)
        with override_settings(MESSAGE_SENDERS={"sms": "", "whatsapp": "", "ussd": ""}):
            services = {row["kind"]: row for row in self.client.get(f"{BASE}/services/").json()["data"]}
            self.assertEqual(services["email"]["state"], "not_set_up")
            config = APIClient().get(f"{BASE}/public-config/").json()["data"]
            self.assertFalse(config["features"]["subscriptions"])
            self.assertFalse(config["sign_in"]["code"])
            self.assertTrue(config["sign_in"]["password"])

            connection_id = self.create().json()["data"]["id"]
            self.assertEqual({row["kind"]: row for row in self.client.get(f"{BASE}/services/").json()["data"]}["email"]["state"], "testing")
            self.client.post(f"{BASE}/integrations/{connection_id}/test/", {}, format="json")
            self.client.post(f"{BASE}/integrations/{connection_id}/activate/")
            reset_platform_caches(self)
            config = APIClient().get(f"{BASE}/public-config/").json()["data"]
            self.assertTrue(config["features"]["subscriptions"] and config["sign_in"]["code"] and config["sign_in"]["code_by_email"])
            hidden = self.client.get(f"{BASE}/integrations/{connection_id}/deactivate/").json()["data"]["hidden_features"]
            self.assertEqual({item["key"] for item in hidden}, {"subscriptions", "code_sign_in"})

    def test_password_sign_in_works_without_email(self):
        set_features(self, code_sign_in=True, password_sign_in=True)
        response = APIClient().post("/api/auth/start/", {"identifier": self.admin.email}, format="json")
        self.assertEqual((response.status_code, response.json()["next"]), (200, "password"))
