"""Email through an SMTP server, set up in the staff console (3.27 Integrations).

Testing sends only to the listed test recipients; anything else is logged as held. Live sends to everyone.
The password is write-only, like every provider key.
"""

from __future__ import annotations

import copy
import logging
import re
import smtplib
import socket
import ssl
import time
from email.utils import formataddr, parseaddr

from django.conf import settings
from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.mail import EmailMessage
from django.core.validators import validate_email
from django.utils.module_loading import import_string

from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 15
ALLOWED_PORTS = (25, 465, 587, 2525)
SECURITY_CHOICES = (("tls", "TLS (STARTTLS)"), ("ssl", "SSL"), ("none", "None"))
ENVIRONMENT_CHOICES = (("testing", "Testing"), ("live", "Live"))
SIGN_IN_FAILED = "Could not sign in to the mail server: check the username and app password."
NOT_REACHED = "Could not reach the mail server: check the host, port and security."
SECURE_FAILED = "Could not make a secure connection to the mail server: check the port and security."
REFUSED = "The mail server refused the email: check the from address."
FAILED = "The test email could not be sent. Check the settings and try again."


def mask_email(address: str) -> str:
    name, _, domain = (address or "").partition("@")
    return f"{name[:1]}***@{domain}" if domain else "***"


def bare_address(address: str) -> str:
    return parseaddr(address or "")[1].strip().lower()


def _fields(*, host="", port=587, security="tls", needs_login=True, password_help="") -> tuple[FieldSpec, ...]:
    return (
        FieldSpec("host", "SMTP host", required=True, default=host or None, placeholder="smtp.example.com"),
        FieldSpec("port", "Port", FieldType.NUMBER, required=True, default=port, help_text="Usually 587 for TLS and 465 for SSL."),
        FieldSpec("security", "Security", FieldType.SELECT, required=True, default=security, choices=SECURITY_CHOICES),
        FieldSpec("username", "Username", required=needs_login, help_text="Usually the full email address."),
        FieldSpec("password", "Password or app password", required=needs_login, secret=True, help_text=password_help or "Saved encrypted and never shown again."),
        FieldSpec("from_address", "From address", required=True, placeholder="innovation@ceda.co.bw"),
        FieldSpec("from_name", "From name", default="CEDA Innovation Portal"),
        FieldSpec("reply_to", "Reply-to address", help_text="Optional."),
        FieldSpec("environment", "Environment", FieldType.SELECT, required=True, default="testing", choices=ENVIRONMENT_CHOICES, help_text="Testing sends only to the test recipients. Live sends to everyone."),
        FieldSpec("test_recipients", "Test recipients", FieldType.LIST, help_text="One email address per line. In Testing, only these people get email."),
    )


class BaseEmailProvider(BaseProvider):
    kind = "email"

    @classmethod
    def validate(cls, config: dict, secrets: dict) -> tuple[dict, list[str]]:
        errors: dict[str, str] = {}
        port = config.get("port")
        if port not in (None, "") and port not in ALLOWED_PORTS:
            errors["port"] = f"Use one of these ports: {', '.join(map(str, ALLOWED_PORTS))}."
        host = str(config.get("host") or "")
        if host and not re.fullmatch(r"[A-Za-z0-9.-]{1,253}", host):
            errors["host"] = "Enter a server name such as smtp.example.com."
        for name in ("from_address", "reply_to"):
            if config.get(name):
                try:
                    validate_email(config[name])
                except DjangoValidationError:
                    errors[name] = "Enter a valid email address."
        for name in ("from_name", "username"):
            if re.search(r"[\r\n]", str(config.get(name) or "")):
                errors[name] = "This cannot have line breaks."
        for address in config.get("test_recipients") or []:
            try:
                validate_email(address)
            except DjangoValidationError:
                errors["test_recipients"] = f"\"{address[:60]}\" is not a valid email address."
                break
        if config.get("security") == "none" and secrets.get("password"):
            errors["security"] = "Choose TLS or SSL: a password must not travel unprotected."
        return errors, []

    # runtime ------------------------------------------------------------------

    def transport(self):
        """The real SMTP connection. PLATFORM_EMAIL_TRANSPORT lets tests use Django's locmem outbox."""
        backend = import_string(getattr(settings, "PLATFORM_EMAIL_TRANSPORT", "django.core.mail.backends.smtp.EmailBackend"))
        security = self.config.get("security") or "tls"
        return backend(
            host=self.config.get("host"),
            port=int(self.config.get("port") or 587),
            username=self.config.get("username") or "",
            password=self.secrets.get("password") or "",
            use_tls=security == "tls",
            use_ssl=security == "ssl",
            timeout=SMTP_TIMEOUT_SECONDS,
            fail_silently=False,
        )

    @property
    def is_live(self) -> bool:
        return self.config.get("environment") == "live"

    def from_header(self) -> str:
        name = (self.config.get("from_name") or "").strip()
        address = self.config.get("from_address") or ""
        return formataddr((name, address)) if name else address

    def allowed(self, address: str) -> bool:
        if self.is_live:
            return True
        return bare_address(address) in {item.strip().lower() for item in self.config.get("test_recipients") or []}

    def _prepared(self, message):
        """A copy with our from address, and in Testing only the test recipients. None when nobody is left."""
        out = copy.copy(message)
        out.from_email = self.from_header()
        if self.config.get("reply_to") and not out.reply_to:
            out.reply_to = [self.config["reply_to"]]
        held = []
        for name in ("to", "cc", "bcc"):
            kept = []
            for address in getattr(message, name) or []:
                (kept if self.allowed(address) else held).append(address)
            setattr(out, name, kept)
        if held:
            logger.info("email held in Testing subject=%r recipients=%s", (message.subject or "")[:80], [mask_email(bare_address(item)) for item in held])
        return out if out.recipients() else None

    def deliver(self, messages) -> int:
        prepared = [item for item in (self._prepared(message) for message in messages) if item is not None]
        if not prepared:
            return 0
        return self.transport().send_messages(prepared) or 0

    # test ---------------------------------------------------------------------

    def test(self, to_email: str | None = None, **inputs) -> TestReport:
        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            report.extra["message"] = report.steps[-1].detail
            return report
        transport = self.transport()
        started = time.monotonic()
        try:
            transport.open()
        except Exception as exc:  # noqa: BLE001 - never show a raw error
            detail = _plain_error(exc)
            report.add("Signed in to the mail server", False, detail, int((time.monotonic() - started) * 1000))
            report.extra["message"] = detail
            return report
        report.add("Signed in to the mail server", True, "The mail server accepted the sign-in.", int((time.monotonic() - started) * 1000))
        started = time.monotonic()
        try:
            if not to_email:
                detail = "Your staff account has no email address, so no test email was sent."
                report.add("Test email sent", False, detail)
                report.extra["message"] = detail
                return report
            message = EmailMessage(
                "CEDA Innovation Portal test email",
                "This test email shows that the portal can send through this mail server.",
                self.from_header(),
                [to_email],
                reply_to=[self.config["reply_to"]] if self.config.get("reply_to") else None,
            )
            transport.send_messages([message])  # goes to the signed-in staff member, in Testing too
            report.add("Test email sent", True, "Sent to you.", int((time.monotonic() - started) * 1000))
            report.extra["message"] = "Sent to you"
        except Exception as exc:  # noqa: BLE001 - never show a raw error
            detail = _plain_error(exc)
            report.add("Test email sent", False, detail, int((time.monotonic() - started) * 1000))
            report.extra["message"] = detail
        finally:
            try:
                transport.close()
            except Exception:  # noqa: BLE001
                pass
        return report


def _plain_error(exc: Exception) -> str:
    logger.info("email connection test failed: %s", exc.__class__.__name__)
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return SIGN_IN_FAILED
    if isinstance(exc, (smtplib.SMTPSenderRefused, smtplib.SMTPRecipientsRefused)):
        return REFUSED
    if isinstance(exc, (ssl.SSLError, smtplib.SMTPNotSupportedError)):
        return SECURE_FAILED
    if isinstance(exc, (socket.timeout, socket.gaierror, ConnectionError, smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, OSError)):
        return NOT_REACHED
    return FAILED


APP_PASSWORD = "Use an app password, not your normal password. Create one in your {name} account security settings."


@register
class GmailEmailProvider(BaseEmailProvider):
    key = "email_gmail"
    label = "Gmail"
    description = "Send through a Gmail or Google Workspace mailbox."
    setup_steps = ("Turn on 2-step verification in the Google account.", "Create an app password.", "Enter the address and app password here.", "Test, then activate.")
    fields = _fields(host="smtp.gmail.com", password_help=APP_PASSWORD.format(name="Google"))


@register
class MicrosoftEmailProvider(BaseEmailProvider):
    key = "email_microsoft365"
    label = "Microsoft 365 / Outlook"
    description = "Send through a Microsoft 365 or Outlook mailbox."
    setup_steps = ("Make sure SMTP sign-in is allowed for the mailbox.", "Enter the address and password here.", "Test, then activate.")
    fields = _fields(host="smtp.office365.com")


@register
class YahooEmailProvider(BaseEmailProvider):
    key = "email_yahoo"
    label = "Yahoo"
    description = "Send through a Yahoo mailbox."
    setup_steps = ("Create an app password in Yahoo account security.", "Enter the address and app password here.", "Test, then activate.")
    fields = _fields(host="smtp.mail.yahoo.com", password_help=APP_PASSWORD.format(name="Yahoo"))


@register
class OtherSMTPEmailProvider(BaseEmailProvider):
    key = "email_smtp"
    label = "Other SMTP server"
    description = "Send through any SMTP server. Type its host, port and security."
    setup_steps = ("Get the server details from whoever runs your mail.", "Enter them here.", "Test, then activate.")
    fields = _fields(needs_login=False)
