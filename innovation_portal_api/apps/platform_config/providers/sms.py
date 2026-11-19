"""SMS gateway providers."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import time
import uuid
from dataclasses import dataclass
from urllib.parse import urlencode

from django.conf import settings

from apps.core.phone import mask_phone
from apps.platform_config import http
from apps.platform_config.providers.base import (
    BaseProvider,
    FieldSpec,
    FieldType,
    TestReport,
    register,
)

logger = logging.getLogger(__name__)

TEST_MESSAGE = "CEDA Innovation Portal test message"

SMS_SHARED_FIELDS = (
    FieldSpec("default_sender_id", "Default sender ID", help_text="Name or number shown to the recipient, if your provider allows it."),
    FieldSpec("default_country_code", "Default country code", default="+267", help_text="Used for numbers entered without a country code."),
    FieldSpec("daily_limit", "Daily send limit", FieldType.NUMBER, default=1000, help_text="Messages per day across the portal. Sends stop when reached."),
    FieldSpec("codes_per_number_per_hour", "Sign-in codes per number per hour", FieldType.NUMBER, default=5),
    FieldSpec(
        "webhook_secret",
        "Delivery receipt secret",
        secret=True,
        help_text="Optional. A random value added to the delivery receipt URL for providers that do not sign their callbacks.",
    ),
)


@dataclass
class SendResult:
    ok: bool
    message_id: str = ""
    provider_status: str = ""
    error: str = ""


@dataclass
class StatusUpdate:
    message_id: str
    delivered: bool | None  # True delivered/sent, False failed, None still in progress
    provider_status: str = ""
    error: str = ""


class WebhookRejected(Exception):
    pass


def status_callback_url(connection, token: str = "") -> str:
    base = f"{settings.PUBLIC_BASE_URL.rstrip('/')}/api/platform/integrations/{connection.id}/sms-status/"
    return f"{base}?{urlencode({'token': token})}" if token else base


class BaseSMSProvider(BaseProvider):
    kind = "sms"
    shared_fields = SMS_SHARED_FIELDS
    credentials_step = "Credentials accepted"

    def sender_id(self) -> str:
        return (self.config.get("sender_id") or self.config.get("default_sender_id") or "").strip()

    def callback_url(self) -> str:
        if self.connection is None or getattr(self.connection, "pk", None) is None:
            return ""
        return status_callback_url(self.connection, self.secrets.get("webhook_secret", ""))

    # runtime ------------------------------------------------------------------

    def send(self, to: str, body: str) -> SendResult:
        raise NotImplementedError

    def check_credentials(self) -> tuple[bool, str, bool]:
        return True, "Checked when a test message is sent.", True

    def parse_status_webhook(self, request) -> list[StatusUpdate]:
        """Check the callback is genuine and return status updates. Default: shared token."""
        expected = self.secrets.get("webhook_secret", "")
        given = request.query_params.get("token", "") or request.headers.get("X-Webhook-Token", "")
        if not expected or not hmac.compare_digest(str(given), str(expected)):
            raise WebhookRejected("Delivery receipt could not be verified.")
        return self._parse_status_payload(request)

    def _parse_status_payload(self, request) -> list[StatusUpdate]:
        data = request.data
        message_id = str(data.get("message_id") or data.get("id") or "")
        status = str(data.get("status") or "").lower()
        if not message_id:
            return []
        return [StatusUpdate(message_id, _delivered_from(status), status, str(data.get("error") or ""))]

    # test ---------------------------------------------------------------------

    def test(self, phone: str | None = None, **inputs) -> TestReport:
        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        started = time.monotonic()
        ok, detail, skipped = self.check_credentials()
        report.add(self.credentials_step, ok, detail, int((time.monotonic() - started) * 1000), skipped=skipped)
        if not ok:
            return report
        if phone:
            started = time.monotonic()
            result = self.send(phone, TEST_MESSAGE)
            elapsed = int((time.monotonic() - started) * 1000)
            if result.ok:
                report.add("Test message sent", True, f"Sent to {mask_phone(phone)}. Message ID {result.message_id or 'not given'}, status {result.provider_status or 'accepted'}.", elapsed)
                report.extra["message_id"] = result.message_id
                report.extra["provider_status"] = result.provider_status
            else:
                report.add("Test message sent", False, result.error or "The provider did not accept the message.", elapsed)
        else:
            report.add("Test message sent", True, "No phone number entered, so no test message was sent.", 0, skipped=True)
        return report


def _delivered_from(status: str) -> bool | None:
    status = (status or "").lower()
    if status in {"delivered", "sent", "success", "delivered_to_handset", "read"}:
        return True
    if status in {"failed", "undelivered", "rejected", "expired", "error", "undeliverable"}:
        return False
    return None


@register
class LogOnlySMSProvider(BaseSMSProvider):
    key = "log_only"
    label = "Log only (development)"
    description = "Writes messages to the server log instead of sending them. For development and demos."

    def check_credentials(self):
        return True, "Nothing to check: messages are written to the log.", False

    def send(self, to: str, body: str) -> SendResult:
        logger.info("[SMS log only to %s] %s", mask_phone(to), body)
        return SendResult(ok=True, message_id=f"log-{uuid.uuid4().hex[:12]}", provider_status="logged")

    def parse_status_webhook(self, request):
        raise WebhookRejected("The log only provider has no delivery receipts.")


@register
class TwilioSMSProvider(BaseSMSProvider):
    key = "twilio"
    label = "Twilio"
    description = "Send SMS through Twilio Programmable Messaging."
    setup_steps = (
        "In the Twilio console, copy the Account SID and Auth token.",
        "Enter either a sender number in E.164 form or a Messaging Service SID.",
        "Delivery receipts are signed by Twilio and checked automatically.",
    )
    fields = (
        FieldSpec("account_sid", "Account SID", required=True, placeholder="AC..."),
        FieldSpec("auth_token", "Auth token", required=True, secret=True),
        FieldSpec("from_number", "Sender number", placeholder="+15005550006"),
        FieldSpec("messaging_service_sid", "Messaging Service SID", placeholder="MG..."),
    )

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        if not config.get("from_number") and not config.get("messaging_service_sid"):
            warnings.append("Enter a sender number or a Messaging Service SID before testing.")
        return errors, warnings

    def _base(self) -> str:
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.config.get('account_sid', '')}"

    def _auth(self) -> dict:
        return {"Authorization": http.basic_auth(self.config.get("account_sid", ""), self.secrets.get("auth_token", ""))}

    def check_credentials(self):
        result = http.request(f"{self._base()}.json", headers=self._auth())
        if result.ok:
            account_status = (result.body or {}).get("status", "")
            if account_status and account_status != "active":
                return False, f"The Twilio account is {account_status}.", False
            return True, "Twilio accepted the Account SID and Auth token.", False
        if result.status in (401, 403):
            return False, "Twilio refused the Account SID or Auth token.", False
        return False, result.error or f"Twilio answered with HTTP {result.status}.", False

    def send(self, to: str, body: str) -> SendResult:
        form = {"To": to, "Body": body}
        if self.config.get("messaging_service_sid"):
            form["MessagingServiceSid"] = self.config["messaging_service_sid"]
        else:
            form["From"] = self.config.get("from_number") or self.sender_id()
        if self.callback_url():
            form["StatusCallback"] = status_callback_url(self.connection)
        result = http.request(f"{self._base()}/Messages.json", method="POST", headers=self._auth(), form=form)
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and data.get("sid"):
            return SendResult(True, data["sid"], data.get("status", ""))
        return SendResult(False, error=data.get("message") or result.error or f"Twilio answered with HTTP {result.status}.")

    def parse_status_webhook(self, request):
        signature = request.headers.get("X-Twilio-Signature", "")
        params = request.data
        url = status_callback_url(self.connection)
        payload = url + "".join(f"{key}{params.get(key)}" for key in sorted(params.keys()))
        expected = base64.b64encode(
            hmac.new(self.secrets.get("auth_token", "").encode(), payload.encode(), hashlib.sha1).digest()
        ).decode()
        if not signature or not hmac.compare_digest(signature, expected):
            raise WebhookRejected("Twilio signature did not match.")
        message_id = params.get("MessageSid", "")
        status = (params.get("MessageStatus") or "").lower()
        return [StatusUpdate(message_id, _delivered_from(status), status, params.get("ErrorCode", "") or "")] if message_id else []


@register
class InfobipSMSProvider(BaseSMSProvider):
    key = "infobip"
    label = "Infobip"
    description = "Send SMS through Infobip."
    setup_steps = (
        "In the Infobip portal, copy your personal Base URL and create an API key with SMS permissions.",
        "Enter a sender ID approved for Botswana.",
        "For delivery receipts, set a delivery receipt secret; it is added to the receipt URL.",
    )
    fields = (
        FieldSpec("base_url", "Base URL", FieldType.URL, required=True, placeholder="https://xxxxx.api.infobip.com"),
        FieldSpec("api_key", "API key", required=True, secret=True),
        FieldSpec("sender_id", "Sender ID", required=True),
    )

    def _base(self) -> str:
        return (self.config.get("base_url") or "").rstrip("/")

    def _auth(self) -> dict:
        return {"Authorization": f"App {self.secrets.get('api_key', '')}"}

    def check_credentials(self):
        result = http.request(f"{self._base()}/account/1/balance", headers=self._auth())
        if result.ok:
            body = result.body or {}
            return True, f"Infobip accepted the API key. Balance {body.get('balance', '?')} {body.get('currency', '')}.".strip(), False
        if result.status in (401, 403):
            return False, "Infobip refused the API key.", False
        return False, result.error or f"Infobip answered with HTTP {result.status}.", False

    def send(self, to: str, body: str) -> SendResult:
        message = {"destinations": [{"to": to.lstrip("+")}], "from": self.sender_id(), "text": body}
        if self.callback_url() and self.secrets.get("webhook_secret"):
            message["notifyUrl"] = self.callback_url()
        result = http.request(f"{self._base()}/sms/2/text/advanced", method="POST", headers=self._auth(), json_body={"messages": [message]})
        data = result.body if isinstance(result.body, dict) else {}
        messages = data.get("messages") or []
        if result.ok and messages:
            first = messages[0]
            group = ((first.get("status") or {}).get("groupName") or "").upper()
            if group == "REJECTED":
                return SendResult(False, first.get("messageId", ""), group, (first.get("status") or {}).get("description", "Rejected by Infobip."))
            return SendResult(True, first.get("messageId", ""), group)
        error = ((data.get("requestError") or {}).get("serviceException") or {}).get("text")
        return SendResult(False, error=error or result.error or f"Infobip answered with HTTP {result.status}.")

    def _parse_status_payload(self, request):
        updates = []
        for item in (request.data.get("results") or []):
            group = ((item.get("status") or {}).get("groupName") or "").lower()
            error = (item.get("error") or {}).get("description", "") if (item.get("error") or {}).get("id") else ""
            updates.append(StatusUpdate(str(item.get("messageId", "")), _delivered_from(group), group, error))
        return [update for update in updates if update.message_id]


@register
class AfricasTalkingSMSProvider(BaseSMSProvider):
    key = "africas_talking"
    label = "Africa's Talking"
    description = "Send SMS through Africa's Talking. Use the username 'sandbox' to try the sandbox."
    setup_steps = (
        "In the Africa's Talking dashboard, copy your username and generate an API key.",
        "Enter a sender ID (short code or alphanumeric) registered for your account, or leave it empty.",
        "For delivery receipts, set a delivery receipt secret and add the receipt URL in the dashboard.",
    )
    fields = (
        FieldSpec("username", "Username", required=True),
        FieldSpec("api_key", "API key", required=True, secret=True),
        FieldSpec("sender_id", "Sender ID"),
    )

    def _base(self) -> str:
        if (self.config.get("username") or "").strip() == "sandbox":
            return "https://api.sandbox.africastalking.com"
        return "https://api.africastalking.com"

    def _auth(self) -> dict:
        return {"apiKey": self.secrets.get("api_key", "")}

    def check_credentials(self):
        result = http.request(f"{self._base()}/version1/user?{urlencode({'username': self.config.get('username', '')})}", headers=self._auth())
        if result.ok:
            balance = ((result.body or {}).get("UserData") or {}).get("balance", "?")
            return True, f"Africa's Talking accepted the username and API key. Balance {balance}.", False
        if result.status in (401, 403):
            return False, "Africa's Talking refused the username or API key.", False
        return False, result.error or f"Africa's Talking answered with HTTP {result.status}.", False

    def send(self, to: str, body: str) -> SendResult:
        form = {"username": self.config.get("username", ""), "to": to, "message": body}
        if self.sender_id():
            form["from"] = self.sender_id()
        result = http.request(f"{self._base()}/version1/messaging", method="POST", headers=self._auth(), form=form)
        recipients = (((result.body or {}) if isinstance(result.body, dict) else {}).get("SMSMessageData") or {}).get("Recipients") or []
        if result.ok and recipients:
            first = recipients[0]
            status = first.get("status", "")
            if status.lower() in {"success", "sent", "queued", "submitted"}:
                return SendResult(True, first.get("messageId", ""), status)
            return SendResult(False, first.get("messageId", ""), status, f"Africa's Talking did not send the message: {status}.")
        return SendResult(False, error=result.error or f"Africa's Talking answered with HTTP {result.status}.")

    def _parse_status_payload(self, request):
        data = request.data
        message_id = str(data.get("id") or "")
        status = str(data.get("status") or "").lower()
        return [StatusUpdate(message_id, _delivered_from(status), status, str(data.get("failureReason") or ""))] if message_id else []


def _dig(data, path: str):
    current = data
    for part in [p for p in (path or "").split(".") if p]:
        if isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return None
        elif isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


@register
class GenericHTTPSMSProvider(BaseSMSProvider):
    key = "generic_http"
    label = "Other SMS gateway (HTTP)"
    description = "Any SMS aggregator with an HTTP API, for example a local Botswana provider."
    setup_steps = (
        "Ask your provider for the send URL, the request format and any API key header.",
        "Write the body template using {{to}}, {{message}} and {{sender}}.",
        "Say where the response shows success and the message ID, using dotted paths such as data.0.id.",
    )
    fields = (
        FieldSpec("url", "Send URL", FieldType.URL, required=True),
        FieldSpec("method", "Method", FieldType.SELECT, default="POST", choices=(("POST", "POST"), ("GET", "GET"))),
        FieldSpec("content_type", "Body format", FieldType.SELECT, default="json", choices=(("json", "JSON"), ("form", "Form fields"))),
        FieldSpec("headers", "Headers", FieldType.JSON, secret=True, help_text='JSON object, for example {"Authorization": "Bearer ..."}. Stored encrypted.'),
        FieldSpec(
            "body_template",
            "Body template",
            FieldType.TEXTAREA,
            required=True,
            default='{"to": "{{to}}", "message": "{{message}}", "from": "{{sender}}"}',
            help_text="For form bodies or GET, write key={{to}}&text={{message}}.",
        ),
        FieldSpec("success_path", "Success field", placeholder="status", help_text="Dotted path in the JSON response. Leave empty to treat any 2xx answer as success."),
        FieldSpec("success_value", "Success value", placeholder="OK"),
        FieldSpec("message_id_path", "Message ID field", placeholder="data.id"),
    )

    def _render(self, to: str, body: str) -> tuple[dict | None, str]:
        """Return (json body, form or query string)."""
        template = self.config.get("body_template") or ""
        values = {"to": to, "message": body, "sender": self.sender_id()}
        if (self.config.get("content_type") or "json") == "json" and (self.config.get("method") or "POST") == "POST":
            rendered = template
            for key, value in values.items():
                rendered = rendered.replace("{{" + key + "}}", json.dumps(value)[1:-1])
            return json.loads(rendered), ""
        rendered = template
        for key, value in values.items():
            rendered = rendered.replace("{{" + key + "}}", urlencode({"v": value})[2:])
        return None, rendered

    def send(self, to: str, body: str) -> SendResult:
        try:
            json_payload, encoded = self._render(to, body)
        except ValueError:
            return SendResult(False, error="The body template is not valid JSON after filling in the values.")
        headers = {str(k): str(v) for k, v in (self.secrets.get("headers") or {}).items()}
        method = (self.config.get("method") or "POST").upper()
        url = self.config.get("url", "")
        if method == "GET":
            result = http.request(f"{url}{'&' if '?' in url else '?'}{encoded}", headers=headers)
        elif json_payload is not None:
            result = http.request(url, method="POST", headers=headers, json_body=json_payload)
        else:
            result = http.request(url, method="POST", headers={"Content-Type": "application/x-www-form-urlencoded", **headers}, raw_body=encoded)
        if not result.ok:
            return SendResult(False, error=result.error or f"The gateway answered with HTTP {result.status}.")
        success_path = self.config.get("success_path") or ""
        if success_path:
            actual = _dig(result.body, success_path)
            expected = self.config.get("success_value")
            if expected not in (None, "") and str(actual) != str(expected):
                return SendResult(False, error=f"The gateway answered {success_path}={actual!s:.80}, expected {expected}.")
            if expected in (None, "") and not actual:
                return SendResult(False, error=f"The gateway answer has no {success_path}.")
        message_id = _dig(result.body, self.config.get("message_id_path") or "") if self.config.get("message_id_path") else ""
        return SendResult(True, str(message_id or ""), "accepted")
