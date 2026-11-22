"""Human hand-over (C0 contract, owned by C1 in ``apps.conversations``).

C2 calls ``open_handoff`` and ``post_to_contact`` from here only. While C1 is not on main,
the stub below keeps the same signatures and records the hand-over as a support request,
so nothing is lost. TODO(C1): remove the stub once ``apps.conversations`` is on main.
"""

from __future__ import annotations

import logging
from types import SimpleNamespace

logger = logging.getLogger(__name__)

try:  # pragma: no cover - which branch runs depends on whether C1 is merged
    from apps.conversations.services import open_handoff, post_to_contact  # type: ignore  # noqa: F401

    HANDOFF_IS_STUB = False
except ImportError:
    HANDOFF_IS_STUB = True

    def open_handoff(*, channel: str, contact: dict, subject: str, transcript: list[dict], submission=None, language: str = "en", reason: str = ""):
        """Stub with the C1 signature. Records a support request; never raises."""
        from apps.support.models import SupportRequest

        lines = [f"{item.get('from', '?')}: {item.get('text', '')}" for item in transcript[-30:]]
        description = "\n".join(([f"Note: {reason}", ""] if reason else []) + lines) or subject
        try:
            created = SupportRequest.objects.create(
                request_type=f"{channel}_handoff",
                subject=subject[:255],
                description=description,
                email=(contact or {}).get("email") or "",
                phone_number=((contact or {}).get("phone") or "")[:30],
                created_by_id=(contact or {}).get("user_id"),
                submission=submission,
            )
        except Exception:  # the contract says hand-over never fails the caller
            logger.exception("Could not record a %s hand-over", channel)
            return SimpleNamespace(id="", channel=channel)
        return SimpleNamespace(id=str(created.id), channel=channel)

    def post_to_contact(conversation, text: str, *, author) -> None:
        raise NotImplementedError("Staff replies need the C1 Inbox.")
