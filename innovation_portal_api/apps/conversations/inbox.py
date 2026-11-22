"""C1: the Inbox list (3.30). One list of idea threads waiting for a reply and conversations."""

from __future__ import annotations

from django.db.models import Count, OuterRef, Q, Subquery
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.conversations.models import Conversation, ConversationMessage
from apps.conversations.services import OPEN, visible_conversations
from apps.core.constants import AssignmentRoleType, AssignmentStatus
from apps.core.phone import mask_phone

TABS = ("mine", "unassigned", "all")
CHANNELS = ("idea", *Conversation.Channel.values)
OPEN_ASSIGNMENT = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED)
MAX_PAGE = 50


def _iso(value):
    return value.isoformat() if value else None


def _person(user) -> dict | None:
    if user is None:
        return None
    return {"id": str(user.id), "name": user.full_name or user.email}


def _preview(text: str) -> str:
    text = " ".join((text or "").split())
    return text if len(text) <= 80 else text[:77].rstrip() + "..."


def conversation_row(conversation, *, last=None, unread=0) -> dict:
    name = conversation.display_name
    return {
        "type": "conversation",
        "id": str(conversation.id),
        "channel": conversation.channel,
        "who": {"name": name, "phone": mask_phone(conversation.contact_phone) if conversation.contact_phone else "", "initials": "".join(part[:1] for part in name.split()[:2]).upper()},
        "subject": conversation.subject,
        "preview": _preview(last.body if last else conversation.subject),
        "last_at": _iso(conversation.last_message_at or conversation.created_at),
        "waiting_since": _iso(conversation.created_at) if conversation.first_response_at is None and conversation.status != Conversation.Status.CLOSED else None,
        "assignee": _person(conversation.assignee),
        "unread": unread,
        "status": conversation.status,
        "handed_over_by": conversation.handed_over_by,
        "submission": {"id": str(conversation.submission_id), "title": conversation.submission.title} if conversation.submission_id else None,
    }


def _idea_rows(user, *, tab: str, program: str):
    """Idea threads whose latest message is from the applicant, for ideas this person may open."""
    from apps.assignments.models import Assignment
    from apps.communications.models import Message, MessageThread
    from apps.submissions.selectors import SubmissionSelector

    last = Message.objects.filter(thread=OuterRef("pk")).exclude(author_role=Message.AuthorRole.SYSTEM).order_by("-created_at")
    owner = Assignment.objects.filter(submission=OuterRef("submission_id"), status__in=OPEN_ASSIGNMENT).exclude(role_type=AssignmentRoleType.JUDGE).order_by("created_at")
    threads = (
        MessageThread.objects.filter(submission__in=SubmissionSelector.for_user(user).values("id"))
        .annotate(
            last_role=Subquery(last.values("author_role")[:1]),
            last_at=Subquery(last.values("created_at")[:1]),
            last_body=Subquery(last.values("body")[:1]),
            owner_id=Subquery(owner.values("assignee_id")[:1]),
            unread=Count("messages", filter=Q(messages__author_role=Message.AuthorRole.APPLICANT, messages__read_by_staff_at__isnull=True)),
        )
        .filter(last_role=Message.AuthorRole.APPLICANT)
        .select_related("submission__innovator", "submission__program")
    )
    if program:
        threads = threads.filter(submission__program_id=program)
    if tab == "mine":
        threads = threads.filter(owner_id=user.id)
    elif tab == "unassigned":
        threads = threads.filter(owner_id__isnull=True)
    owners = {}
    rows = []
    for thread in threads:
        submission = thread.submission
        if thread.owner_id and thread.owner_id not in owners:
            from apps.accounts.models import User

            owners[thread.owner_id] = User.objects.filter(id=thread.owner_id).first()
        innovator = submission.innovator
        name = (innovator.full_name or "").strip() if innovator else ""
        rows.append(
            {
                "type": "idea",
                "id": str(submission.id),
                "channel": "idea",
                "who": {"name": name, "phone": mask_phone(innovator.phone_number) if innovator and innovator.phone_number else "", "initials": "".join(part[:1] for part in name.split()[:2]).upper()},
                "subject": submission.title,
                "preview": _preview(thread.last_body),
                "last_at": _iso(thread.last_at),
                "waiting_since": _iso(thread.last_at),
                "assignee": _person(owners.get(thread.owner_id)),
                "unread": thread.unread,
                "status": "assigned" if thread.owner_id else "waiting",
                "handed_over_by": "",
                "submission": {"id": str(submission.id), "title": submission.title, "reference": submission.reference_number, "program": submission.program.title},
            }
        )
    return rows


def _conversation_rows(user, *, tab: str, status: str, channel: str, program: str):
    rows = visible_conversations(user)
    rows = rows.filter(status=status) if status else rows.filter(status__in=OPEN)
    if channel:
        rows = rows.filter(channel=channel)
    if program:
        rows = rows.filter(submission__program_id=program)
    if tab == "mine":
        rows = rows.filter(assignee=user)
    elif tab == "unassigned":
        rows = rows.filter(assignee__isnull=True)
    last = ConversationMessage.objects.filter(conversation=OuterRef("pk"), is_internal=False).order_by("-created_at")
    rows = rows.annotate(
        last_body=Subquery(last.values("body")[:1]),
        unread=Count("messages", filter=Q(messages__author_role=ConversationMessage.Author.PERSON, messages__read_by_staff_at__isnull=True)),
    )
    out = []
    for conversation in rows:
        row = conversation_row(conversation, unread=conversation.unread)
        row["preview"] = _preview(conversation.last_body or conversation.subject)
        out.append(row)
    return out


def inbox(user, params) -> dict:
    tab = params.get("tab") or "all"
    if tab not in TABS:
        raise ValidationError({"tab": f"Use one of: {', '.join(TABS)}."})
    status = params.get("status") or ""
    if status and status not in Conversation.Status.values:
        raise ValidationError({"status": f"Use one of: {', '.join(Conversation.Status.values)}."})
    channel = params.get("channel") or ""
    if channel and channel not in CHANNELS:
        raise ValidationError({"channel": f"Use one of: {', '.join(CHANNELS)}."})
    program = params.get("program") or ""
    try:
        page = max(1, int(params.get("page") or 1))
        size = min(MAX_PAGE, max(1, int(params.get("page_size") or 25)))
    except ValueError:
        raise ValidationError({"page": "Use whole numbers for page and page_size."}) from None

    rows = []
    if channel in ("", "idea") and status in ("", "waiting", "assigned"):
        rows += [row for row in _idea_rows(user, tab=tab, program=program) if not status or row["status"] == status]
    if channel != "idea":
        rows += _conversation_rows(user, tab=tab, status=status, channel=channel, program=program)
    rows.sort(key=lambda row: row["last_at"] or "", reverse=True)
    start = (page - 1) * size
    return {"count": len(rows), "page": page, "page_size": size, "results": rows[start : start + size], "now": timezone.now().isoformat()}


def unread_count(user) -> dict:
    ideas = sum(row["unread"] for row in _idea_rows(user, tab="all", program=""))
    conversations = sum(row["unread"] for row in _conversation_rows(user, tab="all", status="", channel="", program=""))
    waiting = visible_conversations(user).filter(status=Conversation.Status.WAITING, assignee__isnull=True).count()
    return {"unread": ideas + conversations, "unassigned": waiting}
