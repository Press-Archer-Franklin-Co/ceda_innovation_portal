"""Pluggable senders for text channels (SMS, WhatsApp, USSD).

Each channel is configured with a dotted path to a sender class in
``settings.MESSAGE_SENDERS`` (``{"sms": "...", "whatsapp": "", "ussd": ""}``).
A channel with no sender is skipped and logged, never treated as delivered.

A sender only needs a ``send(*, to, body, metadata=None)`` method that raises on
failure. Real providers (an SMS gateway, the WhatsApp Business API) are added
later by pointing the setting at a new class.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

from django.conf import settings
from django.utils.module_loading import import_string

from apps.core.phone import mask_phone

logger = logging.getLogger(__name__)


class NoSenderConfigured(Exception):
    """Raised when a channel has no provider configured."""


@dataclass
class OutboundMessage:
    channel: str
    to: str
    body: str
    metadata: dict[str, Any] = field(default_factory=dict)


class BaseMessageSender:
    channel: str = ""

    def __init__(self, channel: str):
        self.channel = channel

    def send(self, *, to: str, body: str, metadata: dict[str, Any] | None = None) -> None:
        raise NotImplementedError


class ConsoleMessageSender(BaseMessageSender):
    """Development sender: writes the message to the log instead of sending it."""

    def send(self, *, to: str, body: str, metadata: dict[str, Any] | None = None) -> None:
        logger.info("[%s to %s] %s", self.channel.upper(), mask_phone(to), body)


class LocMemMessageSender(BaseMessageSender):
    """Test sender: keeps messages in memory, like Django's locmem email backend."""

    outbox: list[OutboundMessage] = []

    def send(self, *, to: str, body: str, metadata: dict[str, Any] | None = None) -> None:
        LocMemMessageSender.outbox.append(
            OutboundMessage(channel=self.channel, to=to, body=body, metadata=dict(metadata or {}))
        )


class MessageSenderRegistry:
    @staticmethod
    def get(channel: str) -> BaseMessageSender:
        dotted_path = (getattr(settings, "MESSAGE_SENDERS", {}) or {}).get(channel) or ""
        if not dotted_path:
            raise NoSenderConfigured(f"No {channel} provider is configured.")
        sender_class = import_string(dotted_path)
        return sender_class(channel)

    @staticmethod
    def is_configured(channel: str) -> bool:
        return bool((getattr(settings, "MESSAGE_SENDERS", {}) or {}).get(channel))

    @staticmethod
    def send(*, channel: str, to: str, body: str, metadata: dict[str, Any] | None = None) -> bool:
        """Send a message. Returns False (and logs) when the channel has no provider."""
        try:
            sender = MessageSenderRegistry.get(channel)
        except NoSenderConfigured:
            logger.warning("Skipped %s message to %s: no provider configured.", channel, mask_phone(to))
            return False
        sender.send(to=to, body=body, metadata=metadata)
        return True
