"""The one way email leaves the portal: through the active Email connection in the staff console.

With no active connection nothing is sent and a line is written to the log (the demo default). The log line has the
subject and masked recipients only, never the body, because bodies can hold sign-in codes.
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.mail.backends.base import BaseEmailBackend

logger = logging.getLogger(__name__)

PLATFORM_BACKEND = "apps.platform_config.email_backend.PlatformEmailBackend"
NOT_SET_UP = "Email is not set up yet."
HELD = "Held in Testing."


def _provider():
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    return IntegrationRuntimeSelector.active_provider("email")


def uses_console_connection() -> bool:
    """False when a test or a command swapped EMAIL_BACKEND for another one."""
    return settings.EMAIL_BACKEND == PLATFORM_BACKEND


def delivery_block(addresses) -> str:
    """Why email to these addresses would not go out now ("" when at least one would)."""
    if not uses_console_connection():
        return ""
    provider = _provider()
    if provider is None:
        return NOT_SET_UP
    return "" if any(provider.allowed(address) for address in addresses if address) else HELD


def from_address() -> str:
    """The address people see and can write to: the active connection's reply-to or from address."""
    if uses_console_connection():
        provider = _provider()
        if provider is not None:
            return provider.config.get("reply_to") or provider.config.get("from_address") or settings.DEFAULT_FROM_EMAIL
    return settings.DEFAULT_FROM_EMAIL


class PlatformEmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        from apps.platform_config.providers.email import bare_address, mask_email

        messages = list(email_messages or [])
        if not messages:
            return 0
        provider = _provider()
        if provider is None:
            for message in messages:
                logger.info("email not sent, no active connection subject=%r recipients=%s", (message.subject or "")[:80], [mask_email(bare_address(item)) for item in message.recipients()])
            return 0
        try:
            return provider.deliver(messages)
        except Exception:
            if self.fail_silently:
                logger.warning("email could not be sent through the active connection")
                return 0
            raise
