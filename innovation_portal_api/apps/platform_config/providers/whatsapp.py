"""WhatsApp providers (C2).

Each provider can: check an incoming webhook is genuine, read the messages in it, and send
text, buttons (up to 3), a list (up to 10 rows) or an approved template. Providers that
cannot send buttons or lists send the same choices as numbered text.

WhatsApp only allows free text within 24 hours of the person's last message. Outside that
window only approved templates may be sent; their names are stored per message type in
the ``templates`` setting, and the console shows which are missing.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import secrets as token_tools
import time
import uuid
from dataclasses import dataclass, field

from apps.core.phone import mask_phone
from apps.platform_config import http
from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register
from apps.platform_config.providers.sms import SendResult

logger = logging.getLogger(__name__)

# Message types that may need a template outside the 24 hour window.
TEMPLATE_MESSAGE_TYPES: tuple[tuple[str, str], ...] = (
    ("staff_reply", "A staff reply to someone who asked for a person"),
    ("idea_update", "An update on someone's idea"),
    ("news", "News and new challenges for subscribers"),
    ("test", "The test message sent from this screen"),
)

MAX_BUTTONS = 3
MAX_LIST_ROWS = 10


class WebhookRejected(Exception):
    pass


@dataclass
class Choice:
    id: str
    title: str


@dataclass
class InboundMessage:
    phone: str
    text: str  # the typed text, or the id of the button or list row chosen
    message_id: str = ""
    name: str = ""


@dataclass
class OutboundReply:
    text: str
    choices: list[Choice] = field(default_factory=list)
    list_button: str = "Choose"


def numbered(text: str, choices: list[Choice]) -> str:
    if not choices:
        return text
    return text + "\n" + "\n".join(f"{c.id}. {c.title}" for c in choices)


TEMPLATE_FIELD = FieldSpec(
    "templates",
    "Approved message templates",
    FieldType.MAPPING,
    help_text="Template name per message type, for messages sent more than 24 hours after the person last wrote.",
)


class BaseWhatsAppProvider(BaseProvider):
    kind = "whatsapp"
    supports_interactive = False

    @classmethod
    def as_dict(cls) -> dict:
        return {**super().as_dict(), "template_types": [{"key": k, "label": v} for k, v in TEMPLATE_MESSAGE_TYPES]}

    @classmethod
    def generated_config(cls) -> dict:
        """Values made for a new connection (for example a verify token)."""
        return {}

    def templates_missing(self) -> list[str]:
        saved = self.config.get("templates") or {}
        return [key for key, _ in TEMPLATE_MESSAGE_TYPES if not saved.get(key)]

    # inbound -------------------------------------------------------------------

    def verify_handshake(self, params) -> str | None:
        """GET verification. Return the challenge to echo, or None to refuse."""
        return None

    def authenticate(self, *, raw_body: bytes, headers, url: str, data) -> None:
        raise NotImplementedError

    def parse_inbound(self, data) -> list[InboundMessage]:
        raise NotImplementedError

    # outbound ------------------------------------------------------------------

    def send_text(self, to: str, text: str) -> SendResult:
        raise NotImplementedError

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        return self.send_text(to, numbered(reply.text, reply.choices))

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        return SendResult(False, error="This provider cannot send templates.")

    def check_credentials(self) -> tuple[bool, str, bool]:
        return True, "Checked when a test message is sent.", True

    def test(self, phone: str | None = None, **inputs) -> TestReport:
        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        started = time.monotonic()
        ok, detail, skipped = self.check_credentials()
        report.add("Credentials accepted", ok, detail, int((time.monotonic() - started) * 1000), skipped=skipped)
        if not ok:
            return report
        absent = self.templates_missing()
        report.add(
            "Message templates",
            True,
            f"Missing templates for: {', '.join(absent)}. Messages of these types can only be sent within 24 hours of the person's last message." if absent else "Every message type has a template.",
        )
        if not phone:
            report.add("Test message sent", True, "No phone number entered, so no test message was sent.", 0, skipped=True)
            return report
        started = time.monotonic()
        template = (self.config.get("templates") or {}).get("test")
        if template:
            result = self.send_template(phone, template, self.config.get("template_language") or "en")
        else:
            result = self.send_text(phone, "CEDA Innovation Portal test message")
        elapsed = int((time.monotonic() - started) * 1000)
        if result.ok:
            report.add("Test message sent", True, f"Sent to {mask_phone(phone)}. Message ID {result.message_id or 'not given'}.", elapsed)
        else:
            hint = "" if template else " Without a 'test' template, the number must have written to you in the last 24 hours."
            report.add("Test message sent", False, (result.error or "The provider did not accept the message.") + hint, elapsed)
        return report


@register
class WhatsAppCloudProvider(BaseWhatsAppProvider):
    key = "whatsapp_cloud"
    label = "WhatsApp Business Platform (Meta)"
    description = "Meta's WhatsApp Cloud API. Buttons and lists are sent as real WhatsApp buttons and lists."
    supports_interactive = True
    setup_steps = (
        "In Meta for Developers, open your WhatsApp app and copy the phone number ID and the WhatsApp Business Account ID.",
        "Create a permanent access token (System user) with whatsapp_business_messaging, and copy the App secret from App settings > Basic.",
        "In WhatsApp > Configuration, paste the webhook address and the verify token shown on this connection, then subscribe to 'messages'.",
        "Press Test, type your own number to receive a test message, then Activate.",
    )
    fields = (
        FieldSpec("phone_number_id", "Phone number ID", required=True),
        FieldSpec("business_account_id", "WhatsApp Business Account ID", required=True),
        FieldSpec("access_token", "Access token", required=True, secret=True),
        FieldSpec("app_secret", "App secret", required=True, secret=True, help_text="Used to check the X-Hub-Signature-256 header on every webhook."),
        FieldSpec("verify_token", "Webhook verify token", required=True, help_text="Made for you. Paste it into Meta with the webhook address."),
        FieldSpec("api_version", "Graph API version", default="v21.0"),
        FieldSpec("template_language", "Template language code", default="en"),
        TEMPLATE_FIELD,
    )

    @classmethod
    def generated_config(cls) -> dict:
        return {"verify_token": token_tools.token_urlsafe(18)}

    def _base(self) -> str:
        return f"https://graph.facebook.com/{self.config.get('api_version') or 'v21.0'}"

    def _auth(self) -> dict:
        return {"Authorization": f"Bearer {self.secrets.get('access_token', '')}"}

    def verify_handshake(self, params) -> str | None:
        if params.get("hub.mode") != "subscribe":
            return None
        expected = self.config.get("verify_token") or ""
        given = params.get("hub.verify_token") or ""
        if expected and hmac.compare_digest(str(given), str(expected)):
            return str(params.get("hub.challenge") or "")
        return None

    def authenticate(self, *, raw_body: bytes, headers, url: str, data) -> None:
        secret = self.secrets.get("app_secret", "")
        given = headers.get("X-Hub-Signature-256", "")
        expected = "sha256=" + hmac.new(secret.encode(), raw_body or b"", hashlib.sha256).hexdigest()
        if not secret or not given or not hmac.compare_digest(given, expected):
            raise WebhookRejected("The X-Hub-Signature-256 header did not match.")

    def parse_inbound(self, data) -> list[InboundMessage]:
        found = []
        for entry in (data or {}).get("entry") or []:
            for change in entry.get("changes") or []:
                value = change.get("value") or {}
                names = {c.get("wa_id"): (c.get("profile") or {}).get("name", "") for c in value.get("contacts") or []}
                for message in value.get("messages") or []:
                    kind = message.get("type")
                    text = ""
                    if kind == "text":
                        text = (message.get("text") or {}).get("body", "")
                    elif kind == "interactive":
                        interactive = message.get("interactive") or {}
                        text = (interactive.get("button_reply") or interactive.get("list_reply") or {}).get("id", "")
                    elif kind == "button":
                        text = (message.get("button") or {}).get("payload") or (message.get("button") or {}).get("text", "")
                    sender = message.get("from", "")
                    found.append(InboundMessage(phone=f"+{sender.lstrip('+')}" if sender else "", text=text, message_id=message.get("id", ""), name=names.get(sender, "")))
        return found

    def _post(self, payload: dict) -> SendResult:
        result = http.request(f"{self._base()}/{self.config.get('phone_number_id', '')}/messages", method="POST", headers=self._auth(), json_body={"messaging_product": "whatsapp", **payload})
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and data.get("messages"):
            return SendResult(True, data["messages"][0].get("id", ""), "accepted")
        error = (data.get("error") or {}).get("message")
        return SendResult(False, error=error or result.error or f"WhatsApp answered with HTTP {result.status}.")

    def send_text(self, to: str, text: str) -> SendResult:
        return self._post({"to": to.lstrip("+"), "type": "text", "text": {"body": text[:4096]}})

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        if not reply.choices:
            return self.send_text(to, reply.text)
        body = {"text": reply.text[:1024] or "."}
        if len(reply.choices) <= MAX_BUTTONS:
            interactive = {
                "type": "button",
                "body": body,
                "action": {"buttons": [{"type": "reply", "reply": {"id": c.id, "title": c.title[:20]}} for c in reply.choices]},
            }
        elif len(reply.choices) <= MAX_LIST_ROWS:
            interactive = {
                "type": "list",
                "body": body,
                "action": {"button": reply.list_button[:20], "sections": [{"title": "Options", "rows": [{"id": c.id, "title": c.title[:24]} for c in reply.choices]}]},
            }
        else:
            return self.send_text(to, numbered(reply.text, reply.choices))
        return self._post({"to": to.lstrip("+"), "type": "interactive", "interactive": interactive})

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        payload = {"to": to.lstrip("+"), "type": "template", "template": {"name": template, "language": {"code": language}}}
        if params:
            payload["template"]["components"] = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in params]}]
        return self._post(payload)

    def check_credentials(self):
        result = http.request(f"{self._base()}/{self.config.get('phone_number_id', '')}?fields=display_phone_number,verified_name", headers=self._auth())
        if result.ok:
            body = result.body or {}
            return True, f"Meta accepted the access token for {body.get('display_phone_number', 'this number')} ({body.get('verified_name', 'no name')}).", False
        if result.status in (401, 403):
            return False, "Meta refused the access token.", False
        error = ((result.body or {}).get("error") or {}).get("message") if isinstance(result.body, dict) else ""
        return False, error or result.error or f"Meta answered with HTTP {result.status}.", False


@register
class WhatsAppTwilioProvider(BaseWhatsAppProvider):
    key = "whatsapp_twilio"
    label = "Twilio WhatsApp"
    description = "WhatsApp through Twilio. Choices are sent as numbered text."
    setup_steps = (
        "In the Twilio console, copy the Account SID and Auth token.",
        "Enter your WhatsApp sender number in E.164 form, for example +14155238886.",
        "Paste the webhook address shown on this connection into 'When a message comes in' (HTTP POST).",
    )
    fields = (
        FieldSpec("account_sid", "Account SID", required=True, placeholder="AC..."),
        FieldSpec("auth_token", "Auth token", required=True, secret=True),
        FieldSpec("from_number", "WhatsApp sender number", required=True, placeholder="+14155238886"),
        TEMPLATE_FIELD,
    )

    def _base(self) -> str:
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.config.get('account_sid', '')}"

    def _auth(self) -> dict:
        return {"Authorization": http.basic_auth(self.config.get("account_sid", ""), self.secrets.get("auth_token", ""))}

    def authenticate(self, *, raw_body: bytes, headers, url: str, data) -> None:
        signature = headers.get("X-Twilio-Signature", "")
        params = data or {}
        payload = url + "".join(f"{key}{params.get(key)}" for key in sorted(params.keys()))
        expected = base64.b64encode(hmac.new(self.secrets.get("auth_token", "").encode(), payload.encode(), hashlib.sha1).digest()).decode()
        if not signature or not hmac.compare_digest(signature, expected):
            raise WebhookRejected("Twilio signature did not match.")

    def parse_inbound(self, data) -> list[InboundMessage]:
        sender = str((data or {}).get("From") or "").replace("whatsapp:", "")
        if not sender:
            return []
        text = str(data.get("ButtonPayload") or data.get("Body") or "")
        return [InboundMessage(phone=sender, text=text, message_id=str(data.get("MessageSid") or ""), name=str(data.get("ProfileName") or ""))]

    def send_text(self, to: str, text: str) -> SendResult:
        form = {"To": f"whatsapp:{to}", "From": f"whatsapp:{self.config.get('from_number', '')}", "Body": text[:1600]}
        result = http.request(f"{self._base()}/Messages.json", method="POST", headers=self._auth(), form=form)
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and data.get("sid"):
            return SendResult(True, data["sid"], data.get("status", ""))
        return SendResult(False, error=data.get("message") or result.error or f"Twilio answered with HTTP {result.status}.")

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        # Twilio content templates are sent by Content SID.
        form = {"To": f"whatsapp:{to}", "From": f"whatsapp:{self.config.get('from_number', '')}", "ContentSid": template}
        result = http.request(f"{self._base()}/Messages.json", method="POST", headers=self._auth(), form=form)
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and data.get("sid"):
            return SendResult(True, data["sid"], data.get("status", ""))
        return SendResult(False, error=data.get("message") or result.error or f"Twilio answered with HTTP {result.status}.")

    def check_credentials(self):
        result = http.request(f"{self._base()}.json", headers=self._auth())
        if result.ok:
            return True, "Twilio accepted the Account SID and Auth token.", False
        if result.status in (401, 403):
            return False, "Twilio refused the Account SID or Auth token.", False
        return False, result.error or f"Twilio answered with HTTP {result.status}.", False


@register
class WhatsAppInfobipProvider(BaseWhatsAppProvider):
    key = "whatsapp_infobip"
    label = "Infobip WhatsApp"
    description = "WhatsApp through Infobip. Buttons are sent as real WhatsApp buttons."
    supports_interactive = True
    setup_steps = (
        "In the Infobip portal, copy your personal Base URL and create an API key with WhatsApp permissions.",
        "Enter your WhatsApp sender number.",
        "Set a webhook secret, then paste the webhook address into Infobip with the header X-Webhook-Secret set to it.",
    )
    fields = (
        FieldSpec("base_url", "Base URL", FieldType.URL, required=True, placeholder="https://xxxxx.api.infobip.com"),
        FieldSpec("api_key", "API key", required=True, secret=True),
        FieldSpec("sender", "WhatsApp sender number", required=True),
        FieldSpec("webhook_secret", "Webhook secret", required=True, secret=True, help_text="Infobip sends it in the X-Webhook-Secret header."),
        FieldSpec("template_language", "Template language code", default="en"),
        TEMPLATE_FIELD,
    )

    def _base(self) -> str:
        return (self.config.get("base_url") or "").rstrip("/")

    def _auth(self) -> dict:
        return {"Authorization": f"App {self.secrets.get('api_key', '')}"}

    def authenticate(self, *, raw_body: bytes, headers, url: str, data) -> None:
        expected = self.secrets.get("webhook_secret", "")
        given = headers.get("X-Webhook-Secret", "")
        if not expected or not hmac.compare_digest(str(given), str(expected)):
            raise WebhookRejected("The X-Webhook-Secret header is missing or wrong.")

    def parse_inbound(self, data) -> list[InboundMessage]:
        found = []
        for item in (data or {}).get("results") or []:
            message = item.get("message") or {}
            text = message.get("text") or message.get("id") or message.get("payload") or ""
            sender = str(item.get("from") or "")
            if sender:
                found.append(InboundMessage(phone=f"+{sender.lstrip('+')}", text=str(text), message_id=str(item.get("messageId") or ""), name=str((item.get("contact") or {}).get("name") or "")))
        return found

    def _post(self, path: str, payload: dict) -> SendResult:
        result = http.request(f"{self._base()}{path}", method="POST", headers=self._auth(), json_body={"from": self.config.get("sender", ""), **payload})
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and (data.get("messageId") or data.get("messages")):
            message_id = data.get("messageId") or (data.get("messages") or [{}])[0].get("messageId", "")
            return SendResult(True, message_id, "accepted")
        error = ((data.get("requestError") or {}).get("serviceException") or {}).get("text")
        return SendResult(False, error=error or result.error or f"Infobip answered with HTTP {result.status}.")

    def send_text(self, to: str, text: str) -> SendResult:
        return self._post("/whatsapp/1/message/text", {"to": to.lstrip("+"), "content": {"text": text[:4096]}})

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        if not reply.choices or len(reply.choices) > MAX_BUTTONS:
            return self.send_text(to, numbered(reply.text, reply.choices))
        content = {
            "body": {"text": reply.text[:1024] or "."},
            "action": {"buttons": [{"type": "REPLY", "id": c.id, "title": c.title[:20]} for c in reply.choices]},
        }
        return self._post("/whatsapp/1/message/interactive/buttons", {"to": to.lstrip("+"), "content": content})

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        message = {"from": self.config.get("sender", ""), "to": to.lstrip("+"), "content": {"templateName": template, "templateData": {"body": {"placeholders": params or []}}, "language": language}}
        result = http.request(f"{self._base()}/whatsapp/1/message/template", method="POST", headers=self._auth(), json_body={"messages": [message]})
        data = result.body if isinstance(result.body, dict) else {}
        messages = data.get("messages") or []
        if result.ok and messages:
            return SendResult(True, messages[0].get("messageId", ""), "accepted")
        return SendResult(False, error=result.error or f"Infobip answered with HTTP {result.status}.")

    def check_credentials(self):
        result = http.request(f"{self._base()}/account/1/balance", headers=self._auth())
        if result.ok:
            return True, "Infobip accepted the API key.", False
        if result.status in (401, 403):
            return False, "Infobip refused the API key.", False
        return False, result.error or f"Infobip answered with HTTP {result.status}.", False


@register
class WhatsAppLogOnlyProvider(BaseWhatsAppProvider):
    key = "whatsapp_log_only"
    label = "WhatsApp log only (testing)"
    description = "Writes replies to the server log instead of sending them. Incoming test messages need the shared secret header."
    supports_interactive = True
    fields = (
        FieldSpec("webhook_secret", "Webhook secret", required=True, secret=True, help_text="Send it in the X-Webhook-Secret header with test messages."),
        TEMPLATE_FIELD,
    )

    sent: list = []  # kept in memory so tests and demos can see what was "sent"

    def check_credentials(self):
        return True, "Nothing to check: replies are written to the log.", False

    def authenticate(self, *, raw_body: bytes, headers, url: str, data) -> None:
        expected = self.secrets.get("webhook_secret", "")
        given = headers.get("X-Webhook-Secret", "")
        if not expected or not hmac.compare_digest(str(given), str(expected)):
            raise WebhookRejected("The X-Webhook-Secret header is missing or wrong.")

    def parse_inbound(self, data) -> list[InboundMessage]:
        phone, text = str((data or {}).get("from") or ""), str((data or {}).get("text") or "")
        return [InboundMessage(phone=phone, text=text, name=str(data.get("name") or ""))] if phone else []

    def _log(self, to: str, payload) -> SendResult:
        WhatsAppLogOnlyProvider.sent.append({"to": to, "payload": payload})
        del WhatsAppLogOnlyProvider.sent[:-200]
        logger.info("[WhatsApp log only to %s] %s", mask_phone(to), payload)
        return SendResult(True, f"log-{uuid.uuid4().hex[:12]}", "logged")

    def send_text(self, to: str, text: str) -> SendResult:
        return self._log(to, {"text": text})

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        return self._log(to, {"text": reply.text, "choices": [c.title for c in reply.choices]})

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        return self._log(to, {"template": template, "params": params or []})
