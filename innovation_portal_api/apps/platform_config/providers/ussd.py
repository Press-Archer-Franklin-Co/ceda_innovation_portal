"""USSD providers (C2).

One generic provider works with any operator or aggregator by configuration only: which
request fields hold the session id, phone number, short code and typed text, and how the
reply must look (``CON``/``END`` plain text, JSON or XML from a template). Mascom, Orange
and BTC are connections that use it with their own settings; a new operator needs no code.

The webhook itself lives in ``apps.channels`` (``POST /api/channels/ussd/<token>/``). This
module only turns an operator request into a ``USSDRequest`` and a reply into the bytes
the operator expects.
"""

from __future__ import annotations

import base64
import hmac
import ipaddress
import json
from dataclasses import dataclass
from xml.sax.saxutils import escape as xml_escape

from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register

NOT_AVAILABLE_TEXT = "This service is not available yet. Please try again later."

TEXT_RESPONSE = "text"
JSON_RESPONSE = "json"
XML_RESPONSE = "xml"

DEFAULT_JSON_TEMPLATE = '{"message": "{{text}}", "continueSession": {{continue}}}'
DEFAULT_XML_TEMPLATE = "<response><message>{{text}}</message><action>{{action}}</action></response>"

# Presets fill in the mapping and reply format. They are only defaults: every value stays
# editable on the connection.
PRESETS: dict[str, dict] = {
    "africas_talking": {
        "label": "Africa's Talking style (CON/END)",
        "description": "Form fields sessionId, phoneNumber, serviceCode and text. The text holds every answer so far, joined by *. Plain text reply starting with CON or END.",
        "config": {
            "request_format": "form",
            "field_session_id": "sessionId",
            "field_phone": "phoneNumber",
            "field_short_code": "serviceCode",
            "field_text": "text",
            "text_mode": "cumulative",
            "response_format": TEXT_RESPONSE,
            "content_type": "text/plain",
        },
    },
    "json": {
        "label": "JSON",
        "description": "JSON body in and out. Change the field names and the reply template to match your operator.",
        "config": {
            "request_format": "json",
            "field_session_id": "sessionId",
            "field_phone": "msisdn",
            "field_short_code": "shortCode",
            "field_text": "input",
            "text_mode": "latest",
            "response_format": JSON_RESPONSE,
            "response_template": DEFAULT_JSON_TEMPLATE,
            "action_continue": "true",
            "action_end": "false",
            "content_type": "application/json",
        },
    },
    "xml": {
        "label": "XML",
        "description": "Form or query fields in, XML out. Change the reply template to match your operator.",
        "config": {
            "request_format": "form",
            "field_session_id": "sessionid",
            "field_phone": "msisdn",
            "field_short_code": "shortcode",
            "field_text": "input",
            "text_mode": "latest",
            "response_format": XML_RESPONSE,
            "response_template": DEFAULT_XML_TEMPLATE,
            "action_continue": "request",
            "action_end": "end",
            "content_type": "application/xml",
        },
    },
}


class WebhookRejected(Exception):
    """The request did not carry the secret, basic auth or address the connection expects."""


@dataclass
class USSDRequest:
    session_id: str
    phone: str
    short_code: str
    text: str  # the raw text field as the operator sent it


@dataclass
class USSDReply:
    body: str
    content_type: str


def _dig(data, path: str):
    current = data
    for part in [p for p in (path or "").split(".") if p]:
        if isinstance(current, dict):
            current = current.get(part)
        else:
            return None
    return current


MAPPING_FIELDS = (
    FieldSpec(
        "request_format",
        "Request format",
        FieldType.SELECT,
        default="form",
        choices=(("form", "Form fields or query string"), ("json", "JSON body")),
    ),
    FieldSpec("field_session_id", "Session id field", required=True, default="sessionId", help_text="Dotted path for JSON, for example request.session."),
    FieldSpec("field_phone", "Phone number field", required=True, default="phoneNumber"),
    FieldSpec("field_short_code", "Short code field", default="serviceCode"),
    FieldSpec("field_text", "Typed text field", required=True, default="text"),
    FieldSpec(
        "text_mode",
        "Typed text holds",
        FieldType.SELECT,
        default="cumulative",
        choices=(("cumulative", "Every answer so far, joined by *"), ("latest", "Only the latest answer")),
    ),
    FieldSpec(
        "response_format",
        "Reply format",
        FieldType.SELECT,
        default=TEXT_RESPONSE,
        choices=((TEXT_RESPONSE, "Plain text with CON or END"), (JSON_RESPONSE, "JSON from a template"), (XML_RESPONSE, "XML from a template")),
    ),
    FieldSpec(
        "response_template",
        "Reply template",
        FieldType.TEXTAREA,
        help_text="For JSON or XML. Use {{text}} for the screen, {{continue}} for true or false and {{action}} for the words below.",
    ),
    FieldSpec("action_continue", "Word for 'keep the session open'", default="request"),
    FieldSpec("action_end", "Word for 'end the session'", default="end"),
    FieldSpec("content_type", "Reply content type", default="text/plain"),
    FieldSpec("session_timeout", "Seconds a screen waits for an answer", FieldType.NUMBER, default=60),
)

SECURITY_FIELDS = (
    FieldSpec(
        "auth_mode",
        "How the operator proves it is them",
        FieldType.SELECT,
        default="none",
        choices=(("none", "Only the secret webhook address"), ("header", "A shared secret header"), ("basic", "Basic auth")),
    ),
    FieldSpec("secret_header_name", "Secret header name", default="X-USSD-Secret"),
    FieldSpec("shared_secret", "Shared secret", secret=True),
    FieldSpec("basic_username", "Basic auth username"),
    FieldSpec("basic_password", "Basic auth password", secret=True),
    FieldSpec("allowed_ips", "Allowed IP addresses", FieldType.LIST, help_text="Optional. One address or range per line, for example 196.45.0.0/16."),
)


class BaseUSSDProvider(BaseProvider):
    kind = "ussd"
    fields = MAPPING_FIELDS + SECURITY_FIELDS

    @classmethod
    def presets(cls) -> list[dict]:
        return [{"key": key, "label": item["label"], "description": item["description"], "config": item["config"]} for key, item in PRESETS.items()]

    @classmethod
    def as_dict(cls) -> dict:
        return {**super().as_dict(), "presets": cls.presets()}

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        fmt = config.get("response_format") or TEXT_RESPONSE
        template = config.get("response_template") or ""
        if fmt in (JSON_RESPONSE, XML_RESPONSE) and template and "{{text}}" not in template:
            errors["response_template"] = "The reply template needs {{text}} where the screen goes."
        if fmt == JSON_RESPONSE and template:
            try:
                json.loads(template.replace("{{text}}", "x").replace("{{continue}}", "true").replace("{{action}}", "x"))
            except ValueError:
                errors["response_template"] = "The reply template is not valid JSON."
        mode = config.get("auth_mode") or "none"
        if mode == "header" and not secrets.get("shared_secret"):
            warnings.append("Enter the shared secret the operator will send.")
        if mode == "basic" and not (config.get("basic_username") and secrets.get("basic_password")):
            warnings.append("Enter the basic auth username and password.")
        for item in config.get("allowed_ips") or []:
            try:
                ipaddress.ip_network(item, strict=False)
            except ValueError:
                errors["allowed_ips"] = f"{item} is not an IP address or range."
        return errors, warnings

    # -- inbound ----------------------------------------------------------------

    def authenticate(self, *, headers, remote_ip: str) -> None:
        """Raise WebhookRejected unless the request is from the operator."""
        allowed = self.config.get("allowed_ips") or []
        if allowed:
            try:
                address = ipaddress.ip_address(remote_ip or "")
            except ValueError as exc:
                raise WebhookRejected("The caller address is not allowed.") from exc
            if not any(address in ipaddress.ip_network(item, strict=False) for item in allowed):
                raise WebhookRejected("The caller address is not allowed.")
        mode = self.config.get("auth_mode") or "none"
        if mode == "header":
            expected = self.secrets.get("shared_secret", "")
            given = headers.get(self.config.get("secret_header_name") or "X-USSD-Secret", "")
            if not expected or not hmac.compare_digest(str(given), str(expected)):
                raise WebhookRejected("The shared secret header is missing or wrong.")
        elif mode == "basic":
            given = headers.get("Authorization", "")
            username, password = self.config.get("basic_username", ""), self.secrets.get("basic_password", "")
            expected = "Basic " + base64.b64encode(f"{username}:{password}".encode()).decode()
            if not password or not hmac.compare_digest(given, expected):
                raise WebhookRejected("Basic auth is missing or wrong.")

    def parse(self, data: dict) -> USSDRequest:
        def value(name: str) -> str:
            found = _dig(data, self.config.get(name) or "")
            return "" if found is None else str(found)

        return USSDRequest(
            session_id=value("field_session_id"),
            phone=value("field_phone"),
            short_code=value("field_short_code"),
            text=value("field_text"),
        )

    @staticmethod
    def new_input(text: str, consumed: str, mode: str) -> tuple[str | None, str]:
        """The answer typed on this screen and the new 'consumed' marker.

        ``cumulative`` operators send ``1*2*Neo``; we remember what we already read.
        Returns ``(None, consumed)`` on the first screen of a session.
        """
        text = text or ""
        if mode != "cumulative":
            return (text if consumed is not None else None), text
        if consumed is None:
            return None, text
        if consumed == "":
            return text, text
        if text.startswith(consumed + "*"):
            return text[len(consumed) + 1 :], text
        # The operator restarted the text (some do after an error); read the last part.
        return text.split("*")[-1], text

    # -- outbound ---------------------------------------------------------------

    def format_reply(self, text: str, *, end: bool) -> USSDReply:
        fmt = self.config.get("response_format") or TEXT_RESPONSE
        content_type = self.config.get("content_type") or "text/plain"
        if fmt == TEXT_RESPONSE:
            return USSDReply(f"{'END' if end else 'CON'} {text}", content_type)
        template = self.config.get("response_template") or (DEFAULT_JSON_TEMPLATE if fmt == JSON_RESPONSE else DEFAULT_XML_TEMPLATE)
        action = (self.config.get("action_end") if end else self.config.get("action_continue")) or ("end" if end else "request")
        continue_word = "false" if end else "true"
        if fmt == JSON_RESPONSE:
            safe_text = json.dumps(text)[1:-1]
            safe_action = json.dumps(action)[1:-1]
        else:
            safe_text, safe_action = xml_escape(text), xml_escape(action)
        body = template.replace("{{text}}", safe_text).replace("{{action}}", safe_action).replace("{{continue}}", continue_word)
        return USSDReply(body, content_type)

    def not_available(self) -> USSDReply:
        return self.format_reply(NOT_AVAILABLE_TEXT, end=True)

    # -- test -------------------------------------------------------------------

    def sample_request(self) -> dict:
        """A first request as the operator would send it, built from the field mapping."""
        data: dict = {}

        def put(path: str, value: str):
            if not path:
                return
            parts = path.split(".")
            target = data
            for part in parts[:-1]:
                target = target.setdefault(part, {})
            target[parts[-1]] = value

        put(self.config.get("field_session_id") or "", "test-session-0001")
        put(self.config.get("field_phone") or "", "+26771000000")
        put(self.config.get("field_short_code") or "", (getattr(getattr(self.connection, "channel", None), "address", "") if self.connection else "") or "*123#")
        put(self.config.get("field_text") or "", "")
        return data

    def first_screen(self) -> tuple[str, bool]:
        """The first screen of this connection's journey, or a sample when none is set."""
        if self.connection is not None and getattr(self.connection, "pk", None):
            try:
                from apps.channels.engine import preview_first_screen

                screen = preview_first_screen(self.connection)
                if screen is not None:
                    return screen
            except Exception:  # a broken journey must not break the test report
                pass
        return "CEDA Innovation\n1. Submit an idea\n2. Check my idea", False

    def test(self, **inputs) -> TestReport:
        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        sample = self.sample_request()

        def parse_check():
            parsed = self.parse(sample)
            ok = bool(parsed.session_id and parsed.phone)
            return ok, (
                f"Read session {parsed.session_id}, phone {parsed.phone}, short code {parsed.short_code or 'not given'}."
                if ok
                else "Could not read the session id or phone number with these field names."
            )

        report.run("Read a first request", parse_check)
        if not report.ok:
            return report
        text, end = self.first_screen()
        reply = self.format_reply(text, end=end)
        report.add("Build the reply", True, f"The operator would receive ({reply.content_type}):\n{reply.body}")
        report.extra["sample_request"] = sample
        report.extra["reply"] = {"body": reply.body, "content_type": reply.content_type}
        return report


@register
class GenericUSSDProvider(BaseUSSDProvider):
    key = "ussd_generic"
    label = "USSD operator or aggregator"
    description = "Works with any operator or aggregator by settings only. Pick a preset, then change the field names to what your operator sends."
    setup_steps = (
        "Pick the preset closest to your operator's documents.",
        "Change the field names and reply format if they differ.",
        "Send the operator the webhook address shown on this connection, the method (POST) and the format.",
        "Press Test to see the exact reply the operator will receive, then Activate.",
    )


@register
class LogOnlyUSSDProvider(BaseUSSDProvider):
    key = "ussd_log_only"
    label = "USSD log only (testing)"
    description = "Accepts Africa's Talking style requests from anyone and answers with CON or END. For testing without an operator."
    fields = MAPPING_FIELDS

    def authenticate(self, *, headers, remote_ip: str) -> None:
        return None
