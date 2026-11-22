"""Human hand-over (C0 contract, owned by C1).

The AI helper calls ``open_handoff(channel="ai", ...)`` so its questions land in the same staff
inbox as WhatsApp, USSD and the website help chat.

TODO(C1): while apps.conversations is not on main, the stub below keeps the request in the audit
log (with the transcript) so nothing is lost, and tells the people who manage the helper. Remove
the stub when C1 merges; the import above it then takes over with no other change.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

logger = logging.getLogger("apps.assistant")

try:  # pragma: no cover - which branch runs depends on whether C1 is merged
    from apps.conversations.services import open_handoff, post_to_contact  # noqa: F401
except ImportError:  # TODO(C1): remove this stub once apps.conversations is on main

    def open_handoff(*, channel: str, contact: dict, subject: str, transcript: list[dict], submission=None, language: str = "en", reason: str = ""):
        """Stub with the C1 signature. Records the request; never raises."""
        from apps.audit.services import AuditService

        user_id = contact.get("user_id") if isinstance(contact, dict) else None
        actor = None
        if user_id:
            from apps.accounts.models import User

            actor = User.objects.filter(pk=user_id).first()
        try:
            AuditService.log_raw_action(
                actor=actor,
                action_type="handoff_requested",
                target_model="Submission" if submission is not None else "Conversation",
                target_id=str(getattr(submission, "pk", "") or ""),
                metadata={
                    "channel": channel,
                    "subject": subject[:200],
                    "language": language,
                    "reason": reason[:200],
                    "transcript": transcript[-20:],
                    "has_contact": bool(contact),
                },
            )
        except Exception:
            logger.exception("assistant.handoff_stub_failed")
        logger.info("assistant.handoff_requested channel=%s (C1 inbox not on main yet)", channel)
        return SimpleNamespace(id=None, pk=None, channel=channel, subject=subject, stub=True)

    def post_to_contact(conversation, text: str, *, author) -> None:
        """Stub with the C1 signature. Nothing to send to until C1 is merged."""
        logger.info("assistant.post_to_contact skipped (C1 inbox not on main yet)")
