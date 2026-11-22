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
import json
import hmac
import logging
import secrets as token_tools
import time
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlencode

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
class MediaItem:
    url: str
    content_type: str = ""


@dataclass
class InboundMessage:
    phone: str
    text: str  # the typed text, or the id of the button or list row chosen
    message_id: str = ""
    name: str = ""  # the sender's WhatsApp profile name
    wa_id: str = ""
    media: list[MediaItem] = field(default_factory=list)
    # Where the choice came from: "button", "list" or "text" (logged by name only, never the value).
    choice_source: str = "text"


@dataclass
class OutboundReply:
    text: str
    choices: list[Choice] = field(default_factory=list)
    list_button: str = "Choose"


def numbered(text: str, choices: list[Choice]) -> str:
    if not choices:
        return text
    return text + "\n" + "\n".join(f"{c.id}. {c.title}" for c in choices)


ELLIPSIS = "\u2026"


def cut_title(title: str, limit: int) -> str:
    """Fit a button or list title into WhatsApp's limit, cutting at a word, never mid-word.

    "Submit an idea to a challenge" at 20 becomes "Submit an idea to\u2026". A single word longer
    than the limit is the only case cut inside the word (there is no other way to fit it)."""
    title = " ".join((title or "").split())
    if len(title) <= limit:
        return title
    room = limit - 1  # leave space for the ellipsis
    cut = title[: room + 1]
    space = cut.rfind(" ")
    if space > 0:
        return title[:space].rstrip(" ,.;:-") + ELLIPSIS
    return title[:room] + ELLIPSIS


TEMPLATE_FIELD = FieldSpec(
    "templates",
    "Approved message templates",
    FieldType.MAPPING,
    help_text="Template name per message type, for messages sent more than 24 hours after the person last wrote.",
)


# Settings every WhatsApp connection has (prompt 10). Staff change them on the connection.
# TODO tn-review: the Setswana defaults below.
DEFAULT_RESTART_WORDS = ["menu", "start", "restart", "simolola", "lenane"]
DEFAULT_REPLIES = {
    "error.en": "Sorry, something went wrong. Please try again later.",
    "error.tn": "Maitshwarelo, sengwe se senyegile. Tsweetswee leka gape moragonyana.",
    "not_available.en": "This service is not available yet. Please try again later.",
    "not_available.tn": "Tirelo e ga e ise e nne teng. Tsweetswee leka gape moragonyana.",
    "file_not_expected.en": "Thank you. We can only take files when we ask for one.",
    "file_not_expected.tn": "Re a leboga. Re amogela difaele fela fa re di kopa.",
}
SHARED_WHATSAPP_FIELDS = (
    FieldSpec(
        "restart_words",
        "Words that start again",
        FieldType.LIST,
        default=DEFAULT_RESTART_WORDS,
        help_text="When someone sends only one of these words, the journey starts again from the top. One per line.",
    ),
    FieldSpec(
        "replies",
        "Standard replies",
        FieldType.MAPPING,
        default=DEFAULT_REPLIES,
        help_text="Replies the system sends, in English (.en) and Setswana (.tn): error, not_available, file_not_expected.",
    ),
)


@dataclass
class MediaResult:
    ok: bool
    content: bytes = b""
    content_type: str = ""
    error: str = ""
    too_big: bool = False
    unsupported: bool = False


class BaseWhatsAppProvider(BaseProvider):
    kind = "whatsapp"
    supports_interactive = False
    shared_fields = SHARED_WHATSAPP_FIELDS

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

    def authenticate(self, *, raw_body: bytes, headers, urls: list[str], data) -> None:
        """Raise WebhookRejected unless the request is from the provider. ``urls`` are the
        addresses the provider may have signed: the request URL and the configured one."""
        raise NotImplementedError

    def parse_inbound(self, data) -> list[InboundMessage]:
        raise NotImplementedError

    def webhook_response(self) -> tuple[str, str] | None:
        """(body, content type) to answer the webhook with, or None for the standard JSON."""
        return None

    def fetch_media(self, item: MediaItem, *, max_bytes: int) -> MediaResult:
        return MediaResult(False, unsupported=True, error="This provider cannot receive files yet.")

    def restart_words(self) -> set[str]:
        words = self.config.get("restart_words")
        if words is None:
            words = DEFAULT_RESTART_WORDS
        return {str(w).strip().lower() for w in words if str(w).strip()}

    def reply_text(self, key: str, lang: str = "en") -> str:
        saved = self.config.get("replies") or {}
        return saved.get(f"{key}.{lang}") or saved.get(f"{key}.en") or DEFAULT_REPLIES.get(f"{key}.{lang}") or DEFAULT_REPLIES.get(f"{key}.en", "")

    # outbound ------------------------------------------------------------------

    def send_text(self, to: str, text: str) -> SendResult:
        raise NotImplementedError

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        return self.send_text(to, numbered(reply.text, reply.choices))

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        return SendResult(False, error="This provider cannot send templates.")

    def check_credentials(self) -> tuple[bool, str, bool]:
        return True, "Checked when a test message is sent.", True

    def check_sender(self) -> tuple[bool, str] | None:
        """Whether the sender number belongs to this account, or None when not checked."""
        return None

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
        sender = self.check_sender()
        if sender is not None:
            started = time.monotonic()
            report.add("Sender number", sender[0], sender[1], int((time.monotonic() - started) * 1000))
            if not sender[0]:
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

    def authenticate(self, *, raw_body: bytes, headers, urls: list[str], data) -> None:
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
                "action": {"buttons": [{"type": "reply", "reply": {"id": c.id, "title": cut_title(c.title, 20)}} for c in reply.choices]},
            }
        elif len(reply.choices) <= MAX_LIST_ROWS:
            interactive = {
                "type": "list",
                "body": body,
                "action": {"button": cut_title(reply.list_button, 20), "sections": [{"title": "Options", "rows": [{"id": c.id, "title": cut_title(c.title, 24)} for c in reply.choices]}]},
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


TWILIO_SANDBOX_NUMBER = "+14155238886"
TWILIO_CONTENT_URL = "https://content.twilio.com/v1/Content"
# Twilio limits for in-session interactive messages (Content API, WhatsApp).
TWILIO_BUTTON_TITLE = 20
TWILIO_LIST_BUTTON = 20
TWILIO_LIST_ITEM = 24
CONTENT_CACHE_SECONDS = 30 * 24 * 3600


def _twilio_params(data) -> list[tuple[str, list[str]]]:
    """Every POST name with all its values, as Twilio's own validator reads them."""
    if hasattr(data, "getlist"):
        return [(key, [str(v) for v in data.getlist(key)]) for key in data.keys()]
    return [(key, [str(v) for v in (value if isinstance(value, (list, tuple)) else [value])]) for key, value in (data or {}).items()]


def twilio_signature(url: str, data, auth_token: str) -> str:
    """X-Twilio-Signature: HMAC-SHA1 (auth token) of the URL followed by each POST name and
    value, names sorted, repeated names with their values sorted and de-duplicated, Base64."""
    payload = url
    for key, values in sorted(_twilio_params(data)):
        for value in sorted(set(values)):
            payload += f"{key}{value}"
    return base64.b64encode(hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()).decode()


def _with_and_without_port(url: str) -> list[str]:
    """Twilio keeps an explicit port in what it signs; behind a proxy the port may differ."""
    from urllib.parse import urlsplit, urlunsplit

    parts = urlsplit(url)
    if not parts.hostname:
        return [url]
    host = parts.hostname
    default = {"https": 443, "http": 80}.get(parts.scheme)
    without = urlunsplit((parts.scheme, host, parts.path, parts.query, parts.fragment))
    port = parts.port or default
    with_port = urlunsplit((parts.scheme, f"{host}:{port}", parts.path, parts.query, parts.fragment)) if port else without
    return list(dict.fromkeys([url, without, with_port]))


@register
class WhatsAppTwilioProvider(BaseWhatsAppProvider):
    key = "whatsapp_twilio"
    label = "Twilio WhatsApp"
    description = "WhatsApp through Twilio, including the Twilio Sandbox. Choices go as numbered text, or as WhatsApp buttons and lists."
    supports_interactive = True
    setup_steps = (
        "In the Twilio console, copy the Account SID and Auth token.",
        "Enter your WhatsApp sender number in E.164 form. For the Sandbox it is +14155238886.",
        "In Messaging, Try it out, Send a WhatsApp message, Sandbox settings (or your sender's settings), paste the webhook address shown on this connection into 'When a message comes in', method POST, and save.",
        "Press Test, then Activate. To change keys later, enter the new ones here: the webhook address and the journey stay the same.",
    )
    fields = (
        FieldSpec("account_sid", "Account SID", required=True, placeholder="AC..."),
        FieldSpec("auth_token", "Auth token", required=True, secret=True),
        FieldSpec("from_number", "WhatsApp sender number", required=True, placeholder=TWILIO_SANDBOX_NUMBER),
        FieldSpec(
            "interactive_mode",
            "How choices are sent",
            FieldType.SELECT,
            default="buttons",
            choices=(("buttons", "WhatsApp buttons and lists (Twilio Content API)"), ("numbered", "Numbered text (works everywhere)")),
            help_text="Buttons for up to 3 choices, a list for up to 10. If Twilio refuses, numbered text is sent instead.",
        ),
        TEMPLATE_FIELD,
    )

    def _base(self) -> str:
        return f"https://api.twilio.com/2010-04-01/Accounts/{self.config.get('account_sid', '')}"

    def _auth(self) -> dict:
        return {"Authorization": http.basic_auth(self.config.get("account_sid", ""), self.secrets.get("auth_token", ""))}

    def _from(self) -> str:
        return f"whatsapp:{self.config.get('from_number', '')}"

    # inbound -------------------------------------------------------------------

    def authenticate(self, *, raw_body: bytes, headers, urls: list[str], data) -> None:
        signature = headers.get("X-Twilio-Signature", "")
        token = self.secrets.get("auth_token", "")
        if not signature or not token:
            raise WebhookRejected("twilio_signature_missing")
        candidates = [u for url in urls if url for u in _with_and_without_port(url)]
        if not any(hmac.compare_digest(signature, twilio_signature(url, data, token)) for url in dict.fromkeys(candidates)):
            raise WebhookRejected("twilio_signature_mismatch")

    def parse_inbound(self, data) -> list[InboundMessage]:
        get = data.get if hasattr(data, "get") else (lambda k, d=None: d)
        sender = str(get("From") or "").replace("whatsapp:", "").strip()
        if not sender:
            return []
        own = str(self.config.get("from_number") or "").replace(" ", "")
        if own and sender.replace(" ", "") == own:
            return []
        # A tapped quick reply button sends ButtonPayload (its id) and ButtonText; a list row
        # sends ListId and ListTitle. Body carries the title too, so typed text is the fallback.
        if get("ButtonPayload"):
            text, source = str(get("ButtonPayload")), "button"
        elif get("ListId"):
            text, source = str(get("ListId")), "list"
        else:
            text, source = str(get("Body") or get("ButtonText") or get("ListTitle") or ""), "text"
        media = []
        try:
            count = int(get("NumMedia") or 0)
        except (TypeError, ValueError):
            count = 0
        for index in range(min(count, 10)):
            url = get(f"MediaUrl{index}")
            if url:
                media.append(MediaItem(url=str(url), content_type=str(get(f"MediaContentType{index}") or "")))
        return [
            InboundMessage(
                phone=sender, text=text, message_id=str(get("MessageSid") or ""), name=str(get("ProfileName") or ""),
                wa_id=str(get("WaId") or ""), media=media, choice_source=source,
            )
        ]

    def webhook_response(self) -> tuple[str, str]:
        # Twilio reads the answer as TwiML. Replies go out through the REST API instead.
        return "<Response></Response>", "text/xml"

    def fetch_media(self, item: MediaItem, *, max_bytes: int) -> MediaResult:
        result = http.download(item.url, headers=self._auth(), max_bytes=max_bytes, timeout=8)
        if not result.ok:
            return MediaResult(False, too_big=result.too_big, error=result.error)
        return MediaResult(True, content=result.content, content_type=result.content_type or item.content_type)

    # outbound ------------------------------------------------------------------

    def _post_message(self, form: dict) -> SendResult:
        result = http.request(f"{self._base()}/Messages.json", method="POST", headers=self._auth(), form=form)
        data = result.body if isinstance(result.body, dict) else {}
        if result.ok and data.get("sid"):
            return SendResult(True, data["sid"], data.get("status", ""))
        code = data.get("code")
        message = (data.get("message") or result.error or f"Twilio answered with HTTP {result.status}.")[:200]
        return SendResult(False, error=f"Twilio error {code}: {message}" if code else message, provider_status=str(code or ""))

    def send_text(self, to: str, text: str) -> SendResult:
        return self._post_message({"To": f"whatsapp:{to}", "From": self._from(), "Body": text[:1600]})

    def send_template(self, to: str, template: str, language: str = "en", params: list[str] | None = None) -> SendResult:
        # Twilio content templates are sent by Content SID.
        form = {"To": f"whatsapp:{to}", "From": self._from(), "ContentSid": template}
        if params:
            form["ContentVariables"] = json.dumps({str(i + 1): p for i, p in enumerate(params)})
        return self._post_message(form)

    def _content_sid(self, reply: OutboundReply) -> str | None:
        """Create (once, then cached) a quick reply or list picker for this text and these choices."""
        from django.core.cache import cache

        kind = "twilio/quick-reply" if len(reply.choices) <= MAX_BUTTONS else "twilio/list-picker"
        body = reply.text[:1024] or "."
        if kind == "twilio/quick-reply":
            spec = {"body": body, "actions": [{"title": cut_title(c.title, TWILIO_BUTTON_TITLE), "id": c.id} for c in reply.choices]}
        else:
            spec = {
                "body": body,
                "button": cut_title(reply.list_button, TWILIO_LIST_BUTTON),
                "items": [{"item": cut_title(c.title, TWILIO_LIST_ITEM), "id": c.id, "description": ""} for c in reply.choices],
            }
        fingerprint = hashlib.sha256(json.dumps([self.config.get("account_sid", ""), kind, spec], sort_keys=True).encode()).hexdigest()[:32]
        cache_key = f"channels:twilio-content:{fingerprint}"
        sid = cache.get(cache_key)
        if sid:
            return sid
        payload = {"friendly_name": f"ceda_{fingerprint[:20]}", "language": "en", "types": {kind: spec}}
        result = http.request(TWILIO_CONTENT_URL, method="POST", headers=self._auth(), json_body=payload)
        data = result.body if isinstance(result.body, dict) else {}
        sid = data.get("sid") if result.ok else None
        if not sid:
            logger.warning("Twilio Content API refused a %s: HTTP %s %s", kind, result.status, str(data.get("message") or result.error)[:200])
            return None
        cache.set(cache_key, sid, CONTENT_CACHE_SECONDS)
        return sid

    def send_reply(self, to: str, reply: OutboundReply) -> SendResult:
        interactive = self.config.get("interactive_mode") == "buttons" and 0 < len(reply.choices) <= MAX_LIST_ROWS
        if interactive:
            try:
                sid = self._content_sid(reply)
            except Exception:  # any failure falls back to numbered text
                logger.warning("Twilio interactive message could not be built", exc_info=True)
                sid = None
            if sid:
                result = self._post_message({"To": f"whatsapp:{to}", "From": self._from(), "ContentSid": sid, "ContentVariables": "{}"})
                if result.ok:
                    return result
                logger.warning("Twilio refused an interactive message (%s); sending numbered text", result.error[:200])
        return self.send_text(to, numbered(reply.text, reply.choices))

    # checks --------------------------------------------------------------------

    def check_credentials(self):
        result = http.request(f"{self._base()}.json", headers=self._auth())
        if result.ok:
            return True, "Twilio accepted the Account SID and Auth token.", False
        if result.status in (401, 403):
            return False, "Twilio refused the Account SID or Auth token.", False
        return False, result.error or f"Twilio answered with HTTP {result.status}.", False

    def check_sender(self) -> tuple[bool, str]:
        number = str(self.config.get("from_number") or "").replace(" ", "")
        if number == TWILIO_SANDBOX_NUMBER:
            return True, "Sandbox number: people join the Sandbox first by sending 'join <your code>' to it."
        result = http.request(f"{self._base()}/IncomingPhoneNumbers.json?{urlencode({'PhoneNumber': number})}", headers=self._auth())
        numbers = ((result.body or {}) if isinstance(result.body, dict) else {}).get("incoming_phone_numbers") or []
        if result.ok and numbers:
            return True, f"{number} belongs to this Twilio account."
        if result.ok:
            # WhatsApp senders set up in Twilio's WhatsApp senders do not always appear here, so this does not block.
            return True, f"{number} is not among this account's phone numbers. That is normal for some WhatsApp senders; check the number is right."
        return False, result.error or f"Twilio answered with HTTP {result.status}."


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

    def authenticate(self, *, raw_body: bytes, headers, urls: list[str], data) -> None:
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
            "action": {"buttons": [{"type": "REPLY", "id": c.id, "title": cut_title(c.title, 20)} for c in reply.choices]},
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

    def authenticate(self, *, raw_body: bytes, headers, urls: list[str], data) -> None:
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
