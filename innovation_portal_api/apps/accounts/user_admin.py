"""U9 (3.23): administrators invite people and deactivate or reactivate them. Nobody is deleted.

Every change writes an audit entry with before and after.
"""

from __future__ import annotations

from django.conf import settings
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User, UserRole
from apps.audit.services import AuditService
from apps.core.constants import RoleType


def status_of(user) -> str:
    """active | invited | deactivated"""
    if not user.is_active:
        return "deactivated"
    if getattr(user, "invited_at", None) and user.last_login is None:
        return "invited"
    return "active"


def _state(user) -> dict:
    return {
        "status": status_of(user),
        "roles": sorted(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)),
    }


def _split_name(full_name: str) -> tuple[str, str]:
    parts = (full_name or "").strip().split()
    if not parts:
        return "", ""
    return parts[0][:150], " ".join(parts[1:])[:150]


@transaction.atomic
def invite(*, full_name: str, email: str, roles: list[str], actor) -> User:
    from apps.accounts.services import RoleService

    email = (email or "").strip().lower()
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError({"email": "Someone with this email already has an account. Change their roles instead."})
    first, last = _split_name(full_name)
    if not first:
        raise ValidationError({"full_name": "Write the person's name."})
    user = User.objects.create_user(email=email, password=None, first_name=first, last_name=last)
    user.invited_at = timezone.now()
    user.invited_by = actor
    user.save(update_fields=["invited_at", "invited_by", "updated_at"])
    try:
        RoleService.set_roles(user=user, role_codes=roles, actor=actor, reason="admin_invite", notify=False)  # the invite email says it
    except ValueError as exc:
        raise ValidationError({"roles": str(exc)}) from exc
    AuditService.log_action(actor=actor, action_type="user_invited", target=user, before_state={}, after_state={**_state(user), "email": user.email})
    transaction.on_commit(lambda: _send_invite(user, actor))
    return user


def _send_invite(user, actor) -> None:
    from apps.communications.email_notifications import EmailNotificationService

    url = f"{settings.STAFF_BASE_URL.rstrip('/')}/login"
    try:
        EmailNotificationService.send_generic_notification_email(
            user=user,
            subject="You are invited to the CEDA Innovation Portal",
            headline="You are invited",
            intro=f"{(actor.full_name or actor.email) if actor else 'CEDA'} invited you to the CEDA Innovation Portal staff workspace. "
            "Sign in with this email address; we send you a one-time code.",
            summary_items=[{"label": "Email", "value": user.email}],
            action_label="Sign in",
            action_url=url,
        )
    except Exception:  # noqa: BLE001 - the invite stands even if the email fails; Resend is on the screen
        import logging

        logging.getLogger(__name__).warning("invite email failed for user %s", user.pk)


def _last_admin(user) -> bool:
    if not UserRole.objects.filter(user=user, role__code=RoleType.ADMINISTRATOR, is_active=True).exists():
        return False
    return not UserRole.objects.filter(role__code=RoleType.ADMINISTRATOR, is_active=True, user__is_active=True).exclude(user=user).exists()


@transaction.atomic
def deactivate(user, *, actor, reason: str = "") -> User:
    from apps.accounts import sessions

    if actor is not None and actor.pk == user.pk:
        raise ValidationError({"detail": "You cannot deactivate yourself. Ask another administrator."})
    if _last_admin(user):
        raise ValidationError({"detail": "This is the last active administrator. Give someone else the administrator role first."})
    if not user.is_active:
        return user
    before = _state(user)
    user.is_active = False
    user.save(update_fields=["is_active", "updated_at"])
    sessions.end_all(user)
    AuditService.log_action(actor=actor, action_type="user_deactivated", target=user, before_state=before, after_state=_state(user), metadata={"reason": reason[:300]})
    return user


@transaction.atomic
def reactivate(user, *, actor) -> User:
    if user.is_active:
        return user
    before = _state(user)
    user.is_active = True
    user.save(update_fields=["is_active", "updated_at"])
    AuditService.log_action(actor=actor, action_type="user_reactivated", target=user, before_state=before, after_state=_state(user))
    return user
