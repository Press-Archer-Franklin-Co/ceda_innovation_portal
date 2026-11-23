"""One person, one account, whether they start on WhatsApp, USSD or the website.

- find_by_phone(): the account for a phone in any written form (73000280, 26773000280, +267 7300 0280).
- claim_guest_records(): when someone proves a phone, their guest drafts and ideas with that phone join their account.
- join_accounts(): moves a phone-only account made by WhatsApp or USSD into the account the person signed in to,
  only when that is clearly safe; otherwise nothing happens and staff can join them by hand.

Phones in audit entries are always masked.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone

from apps.audit.services import AuditService
from apps.core.phone import mask_phone, try_normalize_phone

OTHER_ACCOUNT = "This number belongs to another account. Contact CEDA to join them."
SIGNUP_WINDOW = timedelta(hours=1)  # a new account may finish its first code within this time


def variants(phone: str) -> list[str]:
    """The written forms one number may have been saved in before everything was E.164."""
    e164 = try_normalize_phone(phone)
    if not e164:
        return [phone] if phone else []
    digits = e164[1:]
    forms = {e164, digits, f"00{digits}"}
    if e164.startswith("+267"):
        local = digits[3:]
        forms |= {local, f"+267 {local}", f"267 {local}", f"+267 {local[:2]} {local[2:5]} {local[5:]}", f"+267 {local[:4]} {local[4:]}"}
    return sorted(forms)


def pick_account(rows: list):
    """The right account among those holding one number. A verified number always beats a typed one, because
    anyone can type someone else's number into a profile. Among equals, the main account beats a phone-only one."""
    active = [user for user in rows if user.is_active]
    pool = [user for user in active if user.phone_verified] or active
    return [user for user in pool if phone_only_refusal(user)] or pool


def may_take_phone(user) -> bool:
    """May someone who just proved this number be signed in to ``user``, which holds it?

    Not when the number was only typed onto an established account: that account could belong to someone else.
    """
    if user.phone_verified or not phone_only_refusal(user):
        return True
    finishing_signup = not _web_signed_in(user) and user.created_at >= timezone.now() - SIGNUP_WINDOW
    return finishing_signup and user.is_active


def find_by_phone(phone: str, *, active_only: bool = True, proved_only: bool = False):
    """The account for this phone in any written form, or None.

    proved_only (WhatsApp and USSD, where the operator vouches for the number): skip an account that only has the
    number typed in, so that account never receives this person's ideas.
    """
    from apps.accounts.models import User

    forms = variants(phone)
    if not forms:
        return None
    query = User.objects.filter(phone_number__in=forms)
    if active_only:
        query = query.filter(is_active=True)
    rows = list(query.order_by(*best_order())[:5])
    picked = pick_account(rows)
    found = picked[0] if picked else (rows[0] if rows else None)
    if proved_only and found is not None and not may_take_phone(found):
        return None
    return found


def accounts_with_phone(phone: str, *, exclude=None):
    from apps.accounts.models import User

    query = User.objects.filter(phone_number__in=variants(phone), is_active=True)
    if exclude is not None:
        query = query.exclude(pk=exclude.pk)
    return query


# Guest records ---------------------------------------------------------------------------------------------------


@transaction.atomic
def claim_guest_records(user, phone: str, *, source: str, actor=None) -> dict:
    """Attaches every guest draft and idea with this phone (and no innovator) to ``user``. Returns the counts."""
    from apps.submissions.models import ApplicationDraft, Submission

    forms = variants(phone)
    counts = {"drafts": 0, "submissions": 0, "skipped_drafts": 0}
    if not forms or user is None:
        return counts
    masked = mask_phone(try_normalize_phone(phone) or phone)
    claimed = []
    # Only numbers proved with a code: anyone can type someone else's number into a guest form.
    for draft in ApplicationDraft.objects.select_for_update().filter(innovator__isnull=True, guest_phone__in=forms, guest_phone_verified_at__isnull=False):
        busy = (
            not draft.is_general_idea
            and draft.status == ApplicationDraft.STATUS_DRAFT
            and ApplicationDraft.objects.filter(innovator=user, program=draft.program, status=ApplicationDraft.STATUS_DRAFT).exists()
        )
        if busy:
            # One open draft per challenge: the person keeps theirs.
            counts["skipped_drafts"] += 1
            continue
        draft.innovator = user
        draft.save(update_fields=["innovator", "updated_at"])
        counts["drafts"] += 1
        claimed.append(draft)
    for submission in Submission.objects.select_for_update().filter(innovator__isnull=True, guest_phone__in=forms):
        submission.innovator = user
        submission.save(update_fields=["innovator", "updated_at"])
        counts["submissions"] += 1
        claimed.append(submission)
    for record in claimed:
        AuditService.log_action(actor=actor or user, action_type="guest_records_claimed", target=record, after_state={"innovator": str(user.id)}, metadata={"phone": masked, "source": source, "counts": counts})
    return counts


# Joining two accounts of the same person -------------------------------------------------------------------------


@dataclass
class JoinPlan:
    allowed: bool
    reason: str = ""
    moves: dict = field(default_factory=dict)


def _web_signed_in(user) -> bool:
    return bool(user.last_login) or user.account_sessions.exists()


def phone_only_refusal(user) -> str:
    """Why this is not a phone-only account made by WhatsApp or USSD ("" when it is one)."""
    roles = set(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
    if not user.is_active:
        return "That account is already switched off."
    if user.email:
        return "That account has an email address."
    if user.has_usable_password():
        return "That account has a password."
    if roles - {"innovator"}:
        return "That account has a staff role."
    if _web_signed_in(user):
        return "That account has signed in on the website."
    return ""


def join_refusal(phone_user, into) -> str:
    """Why phone_user cannot be joined into ``into`` automatically ("" when it can)."""
    if phone_user.pk == into.pk:
        return "It is the same account."
    return phone_only_refusal(phone_user)


def best_order():
    return (F("phone_verified").desc(), F("last_login").desc(nulls_last=True), F("created_at").asc())


def _querysets(phone_user):
    from apps.channels.models import JourneySession
    from apps.communications.models import CommunicationLog, Message, Notification, NotificationTypePreference
    from apps.conversations.models import Conversation
    from apps.documents.models import SubmissionDocument
    from apps.submissions.models import ApplicationDraft, ConsentRecord, Submission

    return {
        "drafts": (ApplicationDraft.objects.filter(innovator=phone_user), "innovator"),
        "submissions": (Submission.objects.filter(innovator=phone_user), "innovator"),
        "documents": (SubmissionDocument.objects.filter(uploaded_by=phone_user), "uploaded_by"),
        "messages": (Message.objects.filter(author=phone_user), "author"),
        "notifications": (Notification.objects.filter(recipient=phone_user), "recipient"),
        "message_log": (CommunicationLog.objects.filter(recipient=phone_user), "recipient"),
        "channel_sessions": (JourneySession.objects.filter(user=phone_user), "user"),
        "chats": (Conversation.objects.filter(contact_user=phone_user), "contact_user"),
        "consents": (ConsentRecord.objects.filter(user=phone_user), "user"),
        "notification_type_settings": (NotificationTypePreference.objects.filter(user=phone_user), "user"),
    }


def plan_join(phone_user, into) -> JoinPlan:
    reason = join_refusal(phone_user, into)
    moves = {name: queryset.count() for name, (queryset, _) in _querysets(phone_user).items()}
    from apps.communications.models import NotificationPreference

    moves["notification_settings"] = int(
        NotificationPreference.objects.filter(user=phone_user).exists() and not NotificationPreference.objects.filter(user=into).exists()
    )
    return JoinPlan(allowed=not reason, reason=reason, moves=moves)


@transaction.atomic
def join_accounts(phone_user, into, *, actor, dry_run: bool = False, source: str = "verified_phone") -> JoinPlan:
    """Moves phone_user's ideas and history into ``into`` and switches phone_user off. Refuses unless safe."""
    from apps.accounts import sessions
    from apps.communications.models import NotificationPreference, NotificationTypePreference

    plan = plan_join(phone_user, into)
    if not plan.allowed or dry_run:
        return plan
    phone = phone_user.phone_number
    for name, (queryset, column) in _querysets(phone_user).items():
        if name == "notification_type_settings":
            taken = set(NotificationTypePreference.objects.filter(user=into).values_list("notification_type", flat=True))
            queryset.exclude(notification_type__in=taken).update(user=into)
            continue
        queryset.update(**{column: into})
    if plan.moves["notification_settings"]:
        NotificationPreference.objects.filter(user=phone_user).update(user=into)
    phone_user.is_active = False
    phone_user.phone_number = ""
    phone_user.save(update_fields=["is_active", "phone_number", "updated_at"])
    sessions.end_all(phone_user)
    e164 = try_normalize_phone(phone) or phone
    if e164 and not into.phone_number:
        into.phone_number = e164
    # Only the number that was joined is proved; a different number on the main account stays as it was.
    if e164 and (try_normalize_phone(into.phone_number) or into.phone_number) == e164:
        into.phone_verified = True
    into.save(update_fields=["phone_number", "phone_verified", "updated_at"])
    metadata = {"phone": mask_phone(try_normalize_phone(phone) or phone), "source": source, "joined_into": str(into.id), "joined_from": str(phone_user.id)}
    AuditService.log_action(actor=actor, action_type="accounts_joined", target=into, after_state=plan.moves, metadata=metadata)
    AuditService.log_action(actor=actor, action_type="accounts_joined", target=phone_user, before_state={"active": True}, after_state={"active": False}, metadata=metadata)
    return plan


def phone_proved(user, phone: str, *, source: str, actor=None) -> dict:
    """Everything that follows from ``user`` proving ``phone``: claim guest records, and join a safe phone-only
    account that has the same number. Answers {claimed, joined, conflict}; conflict is a plain sentence or ""."""
    result = {"claimed": claim_guest_records(user, phone, source=source, actor=actor), "joined": None, "conflict": ""}
    for other in accounts_with_phone(phone, exclude=user):
        if not other.phone_verified and phone_only_refusal(other):
            continue  # the number was only typed on that account; it proves nothing
        plan = join_accounts(other, user, actor=actor or user, source=source)
        if plan.allowed:
            result["joined"] = plan.moves
        else:
            result["conflict"] = OTHER_ACCOUNT
            AuditService.log_action(
                actor=actor or user,
                action_type="accounts_join_needed",
                target=user,
                metadata={"phone": mask_phone(try_normalize_phone(phone) or phone), "other_account": str(other.id), "reason": plan.reason, "source": source},
            )
    return result


@transaction.atomic
def verify_my_phone(user, phone: str, code: str) -> dict:
    """Profile: a signed-in person proves a number with a code. Claims guest records and joins a safe phone-only account."""
    from rest_framework.exceptions import ValidationError

    from apps.accounts.models import LoginCode
    from apps.accounts.otp_services import OTPService

    e164 = try_normalize_phone(phone)
    if not e164:
        raise ValidationError({"phone": "Enter a Botswana phone number."})
    for other in accounts_with_phone(e164, exclude=user):
        if other.phone_verified and phone_only_refusal(other):
            raise ValidationError({"code": "phone_other_account", "detail": OTHER_ACCOUNT})
    OTPService.check_code_or_raise(target_type=LoginCode.TargetType.PHONE, target=e164, code=code)
    before = {"phone": mask_phone(user.phone_number) if user.phone_number else "", "phone_verified": user.phone_verified}
    user.phone_number, user.phone_verified = e164, True
    user.save(update_fields=["phone_number", "phone_verified", "updated_at"])
    AuditService.log_action(actor=user, action_type="account_phone_verified", target=user, before_state=before, after_state={"phone": mask_phone(e164), "phone_verified": True})
    return phone_proved(user, e164, source="profile_phone", actor=user)
