from django.conf import settings
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.core.constants import ProgramAudience, ProgramTypeCode


class ProgramAccessService:
    """Audience and entry-window rules for innovation challenges.

    Internal challenges are for CEDA staff only (identified by the CEDA email
    domain); public challenges are for non-CEDA people only.
    Other program types are unaffected.
    """

    @staticmethod
    def is_ceda_staff(user) -> bool:
        if not user or not user.is_authenticated:
            return False
        domain = getattr(settings, "DEFAULT_LOGIN_EMAIL_DOMAIN", "ceda.co.bw").lower()
        return (user.email or "").lower().endswith(f"@{domain}")

    @classmethod
    def exclude_hidden(cls, queryset, user, prefix: str = ""):
        """Hide internal challenges from anyone who is not CEDA staff."""
        if cls.is_ceda_staff(user):
            return queryset
        return queryset.exclude(
            **{
                f"{prefix}program_type__code": ProgramTypeCode.INNOVATION_CHALLENGE,
                f"{prefix}audience": ProgramAudience.INTERNAL,
            }
        )

    @classmethod
    def entry_block(cls, program, user, at=None) -> tuple[str, str]:
        """Return (code, message) explaining why `user` cannot enter `program`
        right now, or ("", "") if they can. Code is "audience", "window" or "limit"."""
        if not program.is_innovation_challenge:
            return "", ""
        staff = cls.is_ceda_staff(user)
        if program.audience == ProgramAudience.INTERNAL and not staff:
            return "audience", "This challenge is open to CEDA staff only."
        if program.audience == ProgramAudience.PUBLIC and staff:
            return "audience", "This challenge is open to non-CEDA participants only."
        at = at or timezone.now()
        opens_at = program.submission_opens_at
        if opens_at and at < opens_at:
            return "window", "This challenge has not opened for entries yet."
        if not program.is_submission_open(at):
            return "window", "This challenge has closed for entries."
        limit = program.max_entries_per_person
        if limit and cls.entries_used(program, user) >= limit:
            noun = "entry" if limit == 1 else "entries"
            return "limit", f"You have already submitted the maximum of {limit} {noun} for this challenge."
        return "", ""

    @staticmethod
    def entries_used(program, user) -> int:
        if not user or not user.is_authenticated:
            return 0
        return program.submissions.filter(innovator=user, submitted_at__isnull=False).count()

    @classmethod
    def entry_status(cls, program, user) -> dict:
        code, message = cls.entry_block(program, user)
        return {
            "can_enter": not code,
            "blocked_by": code,
            "message": message,
            "entries_used": cls.entries_used(program, user),
            "max_entries": program.max_entries_per_person,
        }

    @classmethod
    def assert_can_enter(cls, program, user):
        code, message = cls.entry_block(program, user)
        if code == "audience":
            raise PermissionDenied(message)
        if code:
            raise ValidationError(message)
