"""C1: the staff Inbox. Hand-over contract (C0): open_handoff and post_to_contact.

WhatsApp, USSD, the AI helper and the website help chat all land here as a Conversation.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.conversations.models import Conversation, ConversationMessage, LiveChatSettings
from apps.core.constants import RoleType

logger = logging.getLogger(__name__)

DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
MANAGER_ROLES = (RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR)
SEE_ALL_ROLES = (RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR)
OPEN = (Conversation.Status.WAITING, Conversation.Status.ASSIGNED)


# Who takes chats ---------------------------------------------------------------------------------------------------


def _team_members(team_id):
    from apps.assignments.models import ReviewPanel

    team = ReviewPanel.objects.filter(id=team_id).first() if hasattr(ReviewPanel, "members") else None
    return list(team.members.values_list("id", flat=True)) if team else []


def answerer_limits(config: LiveChatSettings) -> dict[str, dict]:
    """{user id: {max_open, backup}} for the people named in the settings (teams opened up)."""
    people = {}
    for item in config.answerers or []:
        ids = [item.get("id")] if item.get("kind", "person") == "person" else _team_members(item.get("id"))
        for user_id in ids:
            if user_id:
                people[str(user_id)] = {"max_open": int(item.get("max_open") or 5), "backup": bool(item.get("backup"))}
    return people


def chat_takers(config: LiveChatSettings | None = None):
    """Active staff who take chats: the named answerers and the holders of the chosen roles."""
    from apps.accounts.models import User

    config = config or LiveChatSettings.load()
    named = list(answerer_limits(config))
    query = Q(id__in=named)
    if config.roles:
        query |= Q(user_roles__role__code__in=config.roles, user_roles__is_active=True)
    return User.objects.filter(query, is_active=True).distinct()


def has_role(user, codes) -> bool:
    return bool(user.is_superuser or user.roles.filter(code__in=codes, user_roles__is_active=True).exists())


def sees_all(user) -> bool:
    return has_role(user, SEE_ALL_ROLES)


def visible_conversations(user):
    """Managers and administrators see every conversation; others see theirs and the unassigned ones."""
    rows = Conversation.objects.select_related("contact_user", "assignee", "submission")
    if sees_all(user):
        return rows
    return rows.filter(Q(assignee=user) | Q(assignee__isnull=True))


# Opening hours -----------------------------------------------------------------------------------------------------


def _minutes(text: str) -> int:
    hours, minutes = text.split(":")
    return int(hours) * 60 + int(minutes)


def is_open(config: LiveChatSettings, at: datetime | None = None) -> bool:
    local = timezone.localtime(at or timezone.now())
    if local.date().isoformat() in (config.holidays or []):
        return False
    now = local.hour * 60 + local.minute
    for window in (config.hours or {}).get(DAYS[local.weekday()], []):
        try:
            if _minutes(window["opens"]) <= now < _minutes(window["closes"]):
                return True
        except (KeyError, ValueError, AttributeError):
            continue
    return False


def text_for(value: dict, language: str) -> str:
    value = value or {}
    return (value.get(language) or "").strip() or value.get("en", "")


def public_status(language: str = "en") -> dict:
    """What the help bubble needs: GET /api/help-chat/status/."""
    from apps.platform_config.flags import is_enabled

    config = LiveChatSettings.load()
    enabled = is_enabled("live_chat")
    open_now = enabled and is_open(config)
    from apps.conversations import live

    return {
        "enabled": enabled,
        "open_now": open_now,
        "staff_online": open_now and live.staff_online(),
        "allow_guests": config.allow_guests,
        "welcome": text_for(config.welcome, language),
        "away": text_for(config.away, language),
        "ask_rating": config.ask_rating,
    }


# Writing messages --------------------------------------------------------------------------------------------------


def _add(conversation, *, role, body, author=None, internal=False, attachments=None, at=None) -> ConversationMessage:
    message = ConversationMessage.objects.create(conversation=conversation, author_role=role, author=author, body=body, is_internal=internal)
    if at is not None:
        ConversationMessage.objects.filter(pk=message.pk).update(created_at=at)
        message.created_at = at
    if attachments:
        message.attachments.set(attachments)
    if not internal and (conversation.last_message_at is None or message.created_at > conversation.last_message_at):
        conversation.last_message_at = message.created_at
        conversation.save(update_fields=["last_message_at", "updated_at"])
    return message


def _notify_takers(conversation, *, title: str, body: str) -> None:
    """Tells the people who take chats. Never raises."""
    from apps.notifications.services import NotificationService

    try:
        people = [conversation.assignee] if conversation.assignee_id else list(chat_takers())
        for user in people:
            NotificationService.notify(user=user, notification_type="conversation_waiting", title=title, message=body)
    except Exception:  # the hand-over must not fail because a notification did
        logger.exception("Could not notify chat takers about %s", conversation.id)


def _auto_assign(conversation, config: LiveChatSettings) -> None:
    """share_out take_turns: the online taker with the fewest open chats, under their limit. Back-ups last."""
    from apps.conversations import live

    if config.share_out != "take_turns" or conversation.assignee_id:
        return
    online = live.online_user_ids()
    limits = answerer_limits(config)
    takers = chat_takers(config).filter(id__in=online).annotate(
        open_count=Count("assigned_conversations", filter=Q(assigned_conversations__status__in=OPEN))
    )
    candidates = []
    for user in takers:
        limit = limits.get(str(user.id), {"max_open": 5, "backup": False})
        if user.open_count < limit["max_open"]:
            candidates.append((limit["backup"], user.open_count, str(user.id), user))
    if candidates:
        user = sorted(candidates, key=lambda item: item[:3])[0][3]
        conversation.assignee = user
        conversation.status = Conversation.Status.ASSIGNED
        conversation.save(update_fields=["assignee", "status", "updated_at"])


def _away_reply(conversation, config: LiveChatSettings) -> None:
    """Outside opening hours the person is told when we reply."""
    if not is_open(config):
        _add(conversation, role=ConversationMessage.Author.SYSTEM, body=text_for(config.away, conversation.language))


def open_handoff(*, channel: str, contact: dict, subject: str, transcript: list[dict], submission=None, language: str = "en", reason: str = "") -> Conversation:
    """channel: web | whatsapp | ussd | ai. contact: {"user_id"?, "phone"?, "email"?, "name"?}.
    transcript: [{"from": "person" | "bot", "text": str, "at": iso8601}].
    Creates (or reopens) a conversation in the staff inbox, notifies the people who take chats,
    and returns it. Never raises because of notification failures."""
    from apps.accounts.models import User

    if channel not in Conversation.Channel.values:
        raise ValueError(f"Unknown channel {channel!r}.")
    contact = contact or {}
    user = User.objects.filter(id=contact["user_id"]).first() if contact.get("user_id") else None
    phone = (contact.get("phone") or "")[:30]
    config = LiveChatSettings.load()
    with transaction.atomic():
        # The same person on the same channel continues their open conversation (or the last one, reopened).
        existing = Conversation.objects.filter(channel=channel)
        if user is not None:
            existing = existing.filter(contact_user=user)
        elif phone:
            existing = existing.filter(contact_phone=phone)
        else:
            existing = Conversation.objects.none()
        conversation = existing.filter(status__in=OPEN).order_by("-created_at").first()
        reopened = False
        if conversation is None:
            recent = existing.filter(status=Conversation.Status.CLOSED, closed_at__gte=timezone.now() - timedelta(days=1)).order_by("-closed_at").first()
            if recent is not None:
                conversation, reopened = recent, True
                conversation.status = Conversation.Status.ASSIGNED if conversation.assignee_id else Conversation.Status.WAITING
                conversation.closed_at, conversation.closed_reason = None, ""
                conversation.save(update_fields=["status", "closed_at", "closed_reason", "updated_at"])
        if conversation is None:
            conversation = Conversation.objects.create(
                channel=channel,
                contact_user=user,
                contact_phone=phone or (user.phone_number if user else ""),
                contact_email=(contact.get("email") or (user.email if user else "") or "")[:254],
                contact_name=(contact.get("name") or "")[:200],
                subject=(subject or "")[:200],
                language=language if language in ("en", "tn") else "en",
                submission=submission,
                handed_over_by=channel if channel in ("ai", "whatsapp", "ussd") else "",
                reason=(reason or "")[:500],
            )
        for item in transcript or []:
            role = ConversationMessage.Author.PERSON if item.get("from") == "person" else ConversationMessage.Author.BOT
            at = parse_datetime(item.get("at") or "") if item.get("at") else None
            _add(conversation, role=role, body=str(item.get("text") or "")[:4000], at=at)
        if reason:
            _add(conversation, role=ConversationMessage.Author.SYSTEM, body=f"Handed over: {reason[:500]}", internal=True)
        if channel == Conversation.Channel.USSD:
            _add(conversation, role=ConversationMessage.Author.SYSTEM, body="USSD cannot carry replies. Call the person back, then close this.", internal=True)
        _auto_assign(conversation, config)
        if channel in (Conversation.Channel.WEB, Conversation.Channel.AI):
            _away_reply(conversation, config)
    AuditService.log_action(actor=user, action_type="conversation_reopened" if reopened else "conversation_opened", target=conversation, metadata={"channel": channel})
    _notify_takers(conversation, title="A chat is waiting", body=f"{conversation.display_name or 'Someone'}: {conversation.subject or channel}")
    return conversation


def post_to_contact(conversation, text: str, *, author) -> None:
    """A staff reply. Goes back on the channel the person used (web chat, WhatsApp).
    For USSD (no way to reply), the conversation is a call-back request instead."""
    reply(conversation, text, actor=author)


def _deliver(conversation, message) -> None:
    from apps.communications.senders import MessageSenderRegistry

    if conversation.channel == Conversation.Channel.WHATSAPP and conversation.contact_phone:
        result = MessageSenderRegistry.deliver(channel="whatsapp", to=conversation.contact_phone, body=message.body, metadata={"message_type": "staff_reply"}, purpose="live_chat")
        note = "Sent on WhatsApp." if result.sent else f"Not sent on WhatsApp: {result.reason or result.status}"
    elif conversation.channel == Conversation.Channel.USSD:
        note = "Not sent: USSD has no replies. Call the person back."
    else:
        note = ""
    if note:
        message.delivery = note[:200]
        message.save(update_fields=["delivery", "updated_at"])


def reply(conversation, text: str, *, actor, attachments=None) -> ConversationMessage:
    text = (text or "").strip()
    if not text and not attachments:
        raise ValidationError({"body": "Write a reply."})
    if conversation.status == Conversation.Status.CLOSED:
        raise ValidationError({"detail": "This chat is closed. Reopen it to reply."})
    message = _add(conversation, role=ConversationMessage.Author.STAFF, author=actor, body=text, attachments=attachments)
    fields = ["updated_at"]
    if conversation.first_response_at is None:
        conversation.first_response_at = message.created_at
        fields.append("first_response_at")
    if conversation.assignee_id is None:
        conversation.assignee = actor
        conversation.status = Conversation.Status.ASSIGNED
        fields += ["assignee", "status"]
    conversation.save(update_fields=fields)
    _deliver(conversation, message)
    return message


def note(conversation, text: str, *, actor) -> ConversationMessage:
    if not (text or "").strip():
        raise ValidationError({"body": "Write the note."})
    return _add(conversation, role=ConversationMessage.Author.STAFF, author=actor, body=text.strip(), internal=True)


def person_message(conversation, text: str, *, user=None, attachments=None) -> ConversationMessage:
    text = (text or "").strip()
    if not text and not attachments:
        raise ValidationError({"body": "Write a message."})
    if conversation.status == Conversation.Status.CLOSED:
        conversation.status = Conversation.Status.ASSIGNED if conversation.assignee_id else Conversation.Status.WAITING
        conversation.closed_at, conversation.closed_reason = None, ""
        conversation.save(update_fields=["status", "closed_at", "closed_reason", "updated_at"])
    return _add(conversation, role=ConversationMessage.Author.PERSON, author=user, body=text[:4000], attachments=attachments)


def take(conversation, *, actor) -> Conversation:
    if conversation.status == Conversation.Status.CLOSED:
        raise ValidationError({"detail": "This chat is closed."})
    return assign(conversation, user=actor, actor=actor)


def assign(conversation, *, user, actor) -> Conversation:
    if not chat_takers().filter(id=user.id).exists() and not sees_all(user):
        raise ValidationError({"assignee": "This person does not take chats."})
    before = str(conversation.assignee_id or "")
    conversation.assignee = user
    if conversation.status != Conversation.Status.CLOSED:
        conversation.status = Conversation.Status.ASSIGNED
    conversation.save(update_fields=["assignee", "status", "updated_at"])
    if user != actor:
        _add(conversation, role=ConversationMessage.Author.SYSTEM, body=f"Assigned to {user.full_name or user.email} by {actor.full_name or actor.email}.", internal=True)
        _notify_takers(conversation, title="A chat was given to you", body=conversation.display_name or conversation.subject)
    AuditService.log_action(actor=actor, action_type="conversation_assigned", target=conversation, before_state={"assignee": before}, after_state={"assignee": str(user.id)})
    return conversation


def close(conversation, *, reason: str, actor) -> Conversation:
    if not (reason or "").strip():
        raise ValidationError({"reason": "Say why the chat is closed."})
    conversation.status = Conversation.Status.CLOSED
    conversation.closed_at = timezone.now()
    conversation.closed_reason = reason.strip()[:300]
    conversation.save(update_fields=["status", "closed_at", "closed_reason", "updated_at"])
    AuditService.log_action(actor=actor, action_type="conversation_closed", target=conversation, metadata={"reason": conversation.closed_reason})
    return conversation


def reopen(conversation, *, actor) -> Conversation:
    conversation.status = Conversation.Status.ASSIGNED if conversation.assignee_id else Conversation.Status.WAITING
    conversation.closed_at, conversation.closed_reason = None, ""
    conversation.save(update_fields=["status", "closed_at", "closed_reason", "updated_at"])
    AuditService.log_action(actor=actor, action_type="conversation_reopened", target=conversation)
    return conversation


def convert(conversation, *, into: str, actor, title: str = "", due_date=None):
    """Turn a chat into a support request or an internal task. The chat stays as it is."""
    from apps.support.models import InternalTask, SupportRequest

    lines = [f"{message.get_author_role_display()}: {message.body}" for message in conversation.messages.filter(is_internal=False).order_by("created_at")[:50]]
    text = "\n".join(lines)
    name = title.strip() or conversation.subject or f"Chat with {conversation.display_name or 'a person'}"
    if into == "support_request":
        created = SupportRequest.objects.create(
            request_type=f"{conversation.channel}_chat",
            subject=name[:255],
            description=text or name,
            email=conversation.contact_email or "",
            phone_number=conversation.contact_phone,
            created_by=conversation.contact_user,
            submission=conversation.submission,
        )
        conversation.support_request = created
        conversation.save(update_fields=["support_request", "updated_at"])
    elif into == "task":
        created = InternalTask.objects.create(title=name[:255], description=text, assignee=conversation.assignee or actor, due_date=due_date)
        conversation.internal_task = created
        conversation.save(update_fields=["internal_task", "updated_at"])
    else:
        raise ValidationError({"into": "Use support_request or task."})
    _add(conversation, role=ConversationMessage.Author.SYSTEM, body=f"Made into a {'support request' if into == 'support_request' else 'task'}: {name}", internal=True)
    AuditService.log_action(actor=actor, action_type="conversation_converted", target=conversation, metadata={"into": into, "id": str(created.id)})
    return created


def rate(conversation, score: int) -> None:
    if not 1 <= int(score) <= 5:
        raise ValidationError({"satisfaction": "Give 1 to 5."})
    conversation.satisfaction = int(score)
    conversation.save(update_fields=["satisfaction", "updated_at"])


def mark_read(conversation, *, by_staff, user=None) -> None:
    now = timezone.now()
    messages = conversation.messages.filter(is_internal=False)
    if by_staff:
        messages.filter(read_by_staff_at__isnull=True).exclude(author_role=ConversationMessage.Author.STAFF).update(read_by_staff_at=now, read_by_staff=user)
    else:
        messages.filter(read_by_person_at__isnull=True).exclude(author_role=ConversationMessage.Author.PERSON).update(read_by_person_at=now)


# Escalation and follow-up (Celery, every minute) -------------------------------------------------------------------


def escalate_unanswered(now=None) -> dict:
    """Chats nobody answered within escalate_after_minutes become a task for a manager (reusing EscalationRecord).
    WhatsApp chats nobody picked up within whatsapp_follow_up_minutes get a message on WhatsApp."""
    from apps.accounts.models import User
    from apps.support.models import EscalationRecord, InternalTask

    now = now or timezone.now()
    config = LiveChatSettings.load()
    escalated = followed_up = 0
    if config.escalate_after_minutes:
        due = Conversation.objects.filter(status__in=OPEN, first_response_at__isnull=True, escalated_at__isnull=True, created_at__lte=now - timedelta(minutes=config.escalate_after_minutes))
        manager = User.objects.filter(is_active=True, user_roles__role__code=RoleType.INNOVATION_MANAGER, user_roles__is_active=True).order_by("created_at").first()
        manager = manager or User.objects.filter(is_active=True, user_roles__role__code__in=MANAGER_ROLES, user_roles__is_active=True).order_by("created_at").first()
        for conversation in due:
            minutes = int((now - conversation.created_at).total_seconds() // 60)
            task = InternalTask.objects.create(title=f"Unanswered chat: {conversation.display_name or conversation.contact_phone or conversation.subject}"[:255], description=f"Waiting {minutes} minutes with no reply. Open it in the Inbox.", assignee=manager)
            EscalationRecord.objects.create(task=task, reason=f"No reply to a {conversation.get_channel_display()} chat after {config.escalate_after_minutes} minutes.")
            conversation.escalated_at = now
            conversation.internal_task = conversation.internal_task or task
            conversation.save(update_fields=["escalated_at", "internal_task", "updated_at"])
            _add(conversation, role=ConversationMessage.Author.SYSTEM, body=f"No reply after {config.escalate_after_minutes} minutes. A manager was told.", internal=True)
            if manager is not None:
                from apps.notifications.services import NotificationService

                try:
                    NotificationService.notify(user=manager, notification_type="conversation_escalated", title="A chat has had no reply", message=conversation.display_name or conversation.subject)
                except Exception:
                    logger.exception("Could not tell the manager about %s", conversation.id)
            escalated += 1
    if config.whatsapp_follow_up_minutes:
        from apps.communications.senders import MessageSenderRegistry

        due = Conversation.objects.filter(
            channel=Conversation.Channel.WHATSAPP, status=Conversation.Status.WAITING, first_response_at__isnull=True,
            created_at__lte=now - timedelta(minutes=config.whatsapp_follow_up_minutes),
        ).exclude(messages__author_role=ConversationMessage.Author.SYSTEM, messages__body__startswith="Followed up on WhatsApp")  # fmt: skip
        for conversation in due:
            body = text_for({"en": "Thank you for waiting. An officer will reply to you here as soon as they can.", "tn": "Re a leboga go leta. Motlhankedi o tla go araba fano ka bonako jo a ka kgonang."}, conversation.language)
            result = MessageSenderRegistry.deliver(channel="whatsapp", to=conversation.contact_phone, body=body, metadata={"message_type": "staff_reply"}, purpose="live_chat")
            _add(conversation, role=ConversationMessage.Author.SYSTEM, body=f"Followed up on WhatsApp ({'sent' if result.sent else 'not sent'}).", internal=True)
            followed_up += 1
    return {"escalated": escalated, "followed_up": followed_up}
