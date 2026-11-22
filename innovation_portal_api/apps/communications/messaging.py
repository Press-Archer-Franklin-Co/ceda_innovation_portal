"""B3: two-way messages between officers and the applicant, with reply-by questions.

Officer messages are delivered on the applicant's chosen channels (B1 preferences).
A question (an officer message with reply_by) moves the submission to "more information
needed" when its workflow allows it; the applicant's reply sends it back to where it was.
Internal notes are a different model and never appear here.
"""

from __future__ import annotations

import logging
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.communications.models import Message, MessageThread, Notification
from apps.core.constants import CommunicationChannel, NotificationDeliveryChannel, NotificationType

logger = logging.getLogger(__name__)

SYSTEM_NAME = "CEDA Innovation"
REMIND_DAYS_BEFORE = 2
MAX_BODY = 4000


def _iso(value):
    return value.isoformat() if value else None


def role_title(user) -> str:
    from apps.core.constants import RoleType

    labels = dict(RoleType.choices)
    codes = list(user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)) if user else []
    for preferred in (RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR):
        if preferred in codes:
            return str(labels[preferred]).capitalize()
    return str(labels[codes[0]]).capitalize() if codes else "CEDA staff"


def author_display(message: Message, *, viewer_is_applicant: bool) -> dict:
    """R-7: "Kago T., Innovation officer"; system messages as "CEDA Innovation"."""
    if message.author_role == Message.AuthorRole.SYSTEM or message.author is None:
        return {"name": SYSTEM_NAME, "role": "", "label": SYSTEM_NAME}
    user = message.author
    if message.author_role == Message.AuthorRole.APPLICANT:
        name = "You" if viewer_is_applicant else (user.full_name or user.email)
        return {"name": name, "role": "Applicant", "label": name}
    first = (user.first_name or "").strip()
    last = (user.last_name or "").strip()
    name = f"{first} {last[:1]}." if first and last else (first or "CEDA officer")
    role = role_title(user)
    return {"name": name, "role": role, "label": f"{name}, {role}"}


def short_name(user) -> str:
    if user is None:
        return ""
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{first} {last[:1]}." if first and last else (first or "CEDA officer")


def seen_by(message: Message, *, viewer_is_applicant: bool) -> dict | None:
    """C1: on the viewer's own messages, who on the other side read it and when."""
    if viewer_is_applicant and message.author_role == Message.AuthorRole.APPLICANT and message.read_by_staff_at:
        return {"name": short_name(message.read_by_staff) if message.read_by_staff_id else "CEDA", "at": _iso(message.read_by_staff_at)}
    if not viewer_is_applicant and message.author_role == Message.AuthorRole.OFFICER and message.read_by_applicant_at:
        return {"name": "Applicant", "at": _iso(message.read_by_applicant_at)}
    return None


def message_payload(message: Message, *, viewer_is_applicant: bool, request=None) -> dict:
    return {
        "seen_by": seen_by(message, viewer_is_applicant=viewer_is_applicant),
        "id": str(message.id),
        "author_role": message.author_role,
        "author": author_display(message, viewer_is_applicant=viewer_is_applicant),
        "body": message.body,
        "attachments": [_attachment(asset, request) for asset in message.attachments.all()],
        "reply_by": _iso(message.reply_by),
        "is_question": bool(message.reply_by),
        "answered_at": _iso(message.answered_at),
        "read": bool(message.read_by_applicant_at if viewer_is_applicant else message.read_by_staff_at),
        "created_at": _iso(message.created_at),
    }


def _attachment(asset, request=None) -> dict:
    url = None
    if asset.file:
        url = request.build_absolute_uri(asset.file.url) if request else asset.file.url
    return {"id": str(asset.id), "kind": asset.kind, "url": url, "mime_type": asset.mime_type, "duration_seconds": asset.duration_seconds, "original_filename": asset.original_filename}


class MessagingService:
    @staticmethod
    def thread_for(target) -> MessageThread:
        from apps.submissions.models import ApplicationDraft

        if isinstance(target, ApplicationDraft):
            thread, _ = MessageThread.objects.get_or_create(draft=target)
        else:
            thread, _ = MessageThread.objects.get_or_create(submission=target)
        return thread

    @staticmethod
    def _check_attachments(attachments, author):
        from apps.media_library.models import MediaAsset

        ids = [str(item) for item in attachments or []]
        if not ids:
            return []
        assets = list(MediaAsset.objects.filter(id__in=ids))
        if len(assets) != len(set(ids)):
            raise ValidationError({"attachments": "Some attachments were not found."})
        if any(asset.uploaded_by_id != author.id for asset in assets):
            raise ValidationError({"attachments": "You can only attach files you uploaded."})
        if any(asset.kind not in ("image", "audio", "video", "document") for asset in assets):
            raise ValidationError({"attachments": "Attach a photo, voice note, video or document."})
        return assets

    @classmethod
    @transaction.atomic
    def officer_message(cls, submission, *, author, body: str, reply_by=None, attachments=None) -> Message:
        body = (body or "").strip()
        if not body:
            raise ValidationError({"body": "Write the message."})
        if len(body) > MAX_BODY:
            raise ValidationError({"body": f"At most {MAX_BODY} characters."})
        if reply_by and reply_by <= timezone.localdate():
            raise ValidationError({"reply_by": "Choose a date after today."})
        assets = cls._check_attachments(attachments, author)
        thread = cls.thread_for(submission)
        message = Message.objects.create(thread=thread, author=author, author_role=Message.AuthorRole.OFFICER, body=body, reply_by=reply_by, read_by_staff_at=timezone.now())
        message.attachments.set(assets)
        if reply_by:
            if thread.open_question_id:
                # A new question replaces the old one.
                Message.objects.filter(pk=thread.open_question_id).update(answered_at=timezone.now())
            thread.open_question = message
            thread.moved_for_question = thread.moved_for_question or cls._move_to_more_information(submission, author, body)
            thread.save(update_fields=["open_question", "moved_for_question", "updated_at"])
        cls._deliver_to_applicant(submission, message)
        AuditService.log_action(actor=author, action_type="message_sent_to_applicant", target=submission, metadata={"message_id": str(message.id), "reply_by": _iso(reply_by)})
        return message

    @staticmethod
    def _move_to_more_information(submission, actor, comment) -> bool:
        """Use the workflow's own return action when this step allows it. Returns True if moved."""
        from apps.workflow.models import WorkflowInstance
        from apps.workflow.services import WorkflowRuntimeService

        instance = getattr(submission, "workflow_instance", None)
        if instance is None or instance.status != WorkflowInstance.STATUS_IN_PROGRESS:
            return False
        try:
            with transaction.atomic():
                WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="return", comment=comment)
            return True
        except Exception as exc:  # the step does not allow it, or this officer may not act on it
            logger.info("Question sent without moving the submission: %s", exc)
            return False

    @classmethod
    @transaction.atomic
    def applicant_message(cls, target, *, author, body: str, attachments=None) -> Message:
        body = (body or "").strip()
        assets = cls._check_attachments(attachments, author)
        if not body and not assets:
            raise ValidationError({"body": "Write a reply or attach a photo or voice note."})
        if len(body) > MAX_BODY:
            raise ValidationError({"body": f"At most {MAX_BODY} characters."})
        thread = cls.thread_for(target)
        message = Message.objects.create(thread=thread, author=author, author_role=Message.AuthorRole.APPLICANT, body=body, read_by_applicant_at=timezone.now())
        message.attachments.set(assets)
        question = thread.open_question
        if question is not None:
            question.answered_at = timezone.now()
            question.save(update_fields=["answered_at", "updated_at"])
            thread.open_question = None
            if thread.moved_for_question and thread.submission_id:
                cls._send_back(thread.submission, author)
            thread.moved_for_question = False
            thread.save(update_fields=["open_question", "moved_for_question", "updated_at"])
        cls._notify_staff(thread, message, question)
        AuditService.log_action(actor=author, action_type="message_from_applicant", target=thread.submission or thread.draft, metadata={"message_id": str(message.id), "answered_question": bool(question)})
        return message

    @staticmethod
    def _send_back(submission, actor):
        from apps.workflow.models import WorkflowInstance
        from apps.workflow.services import WorkflowRuntimeService

        instance = getattr(submission, "workflow_instance", None)
        if instance is not None and instance.status == WorkflowInstance.STATUS_RETURNED:
            WorkflowRuntimeService.resubmit(instance, actor, comment="The applicant answered the question.")

    @staticmethod
    def _notify_staff(thread, message, question):
        from apps.notifications.services import NotificationService

        target = thread.submission or thread.draft
        reference = getattr(target, "reference_number", "") or ""
        people = set()
        if question is not None and question.author_id:
            people.add(question.author)
        if thread.submission_id:
            for assignment in thread.submission.assignments.filter(status__in=["assigned", "accepted"]).select_related("assignee"):
                if assignment.assignee_id:
                    people.add(assignment.assignee)
        for person in people:
            note = NotificationService.notify(
                user=person,
                notification_type="applicant_reply",
                title="The applicant replied" if question else "New message from an applicant",
                message=f"{reference}: {message.body[:200] or 'Sent an attachment.'}",
            )
            _link(note, "idea", target.id)

    @staticmethod
    def _deliver_to_applicant(submission, message):
        from apps.communications.services import CommunicationService
        from apps.notifications.selectors import NotificationPreferenceSelector
        from apps.notifications.services import NotificationService

        user = submission.innovator
        if user is None:
            return
        author = author_display(message, viewer_is_applicant=True)["label"]
        title = "CEDA asked you a question" if message.reply_by else "New message from CEDA"
        text = f"{author}: {message.body[:300]}"
        if message.reply_by:
            text += f" Please reply by {message.reply_by:%d %b %Y}."
        notification = NotificationService.notify(user=user, notification_type=NotificationType.OFFICER_MESSAGE, title=title, message=text)
        _link(notification, "idea", submission.id, due=message.reply_by)
        for channel, delivery, address in (
            (NotificationDeliveryChannel.EMAIL, CommunicationChannel.EMAIL, user.email),
            (NotificationDeliveryChannel.SMS, CommunicationChannel.SMS, user.phone_number),
        ):
            if not address or not NotificationPreferenceSelector.is_enabled(user, NotificationType.OFFICER_MESSAGE, channel):
                continue
            log = CommunicationService.log_communication(recipient=user, channel=delivery, body=text, subject=title, submission=submission, notification=notification)
            if hasattr(log, "to_address"):
                log.to_address = address
                log.save(update_fields=["to_address"])
            CommunicationService._dispatch_or_enqueue(log)

    @staticmethod
    def mark_read(thread, *, applicant: bool, user=None) -> int:
        field = "read_by_applicant_at" if applicant else "read_by_staff_at"
        others = Message.AuthorRole.APPLICANT if applicant else None
        queryset = thread.messages.filter(**{f"{field}__isnull": True})
        if applicant:
            queryset = queryset.exclude(author_role=others)
            return queryset.update(**{field: timezone.now()})
        queryset = queryset.filter(author_role=Message.AuthorRole.APPLICANT)
        return queryset.update(read_by_staff_at=timezone.now(), read_by_staff=user)


def _link(notification, link_type, target_id, *, due=None):
    if notification is None:
        return
    notification.link_type = link_type
    notification.link_id = str(target_id)
    if due:
        notification.due_at = timezone.make_aware(timezone.datetime.combine(due, timezone.datetime.max.time().replace(microsecond=0)))
    notification.save(update_fields=["link_type", "link_id", "due_at", "updated_at"])


# --- Reads for the innovator dashboard (R-5 c, d) ------------------------------------------


def open_question(submission) -> dict | None:
    thread = getattr(submission, "message_thread", None) if submission else None
    if thread is None or not thread.open_question_id:
        return None
    question = thread.open_question
    first_name = (question.author.first_name if question.author else "") or "CEDA"
    return {"officer_first_name": first_name, "excerpt": question.body[:140], "reply_by": _iso(question.reply_by), "message_id": str(question.id)}


def unread_messages(target) -> int:
    thread = getattr(target, "message_thread", None)
    if thread is None:
        return 0
    return thread.messages.filter(read_by_applicant_at__isnull=True).exclude(author_role=Message.AuthorRole.APPLICANT).count()


def unread_updates(user, target_id) -> int:
    return Notification.objects.filter(recipient=user, is_read=False, link_type="idea", link_id=str(target_id)).count()


# --- Daily reminders --------------------------------------------------------------------------


def send_question_reminders(today=None) -> dict:
    """Remind applicants 2 days before reply_by; flag overdue questions to the officer who asked."""
    from apps.notifications.services import NotificationService

    today = today or timezone.localdate()
    reminded = flagged = 0
    due_soon = Message.objects.filter(
        reply_by=today + timedelta(days=REMIND_DAYS_BEFORE), answered_at__isnull=True, reminder_sent_at__isnull=True, thread__open_question=F("id")
    ).select_related("thread__submission__innovator")
    for question in due_soon:
        submission = question.thread.submission
        user = submission.innovator if submission else None
        if user is not None:
            note = NotificationService.notify(
                user=user,
                notification_type=NotificationType.DEADLINE,
                title="Reminder: please answer CEDA's question",
                message=f"{submission.reference_number}: please reply by {question.reply_by:%d %b %Y}.",
            )
            _link(note, "idea", submission.id, due=question.reply_by)
        question.reminder_sent_at = timezone.now()
        question.save(update_fields=["reminder_sent_at", "updated_at"])
        reminded += 1
    overdue = Message.objects.filter(
        reply_by__lt=today, answered_at__isnull=True, overdue_flagged_at__isnull=True, thread__open_question=F("id")
    ).select_related("thread__submission", "author")
    for question in overdue:
        submission = question.thread.submission
        if question.author_id and submission is not None:
            note = NotificationService.notify(
                user=question.author,
                notification_type="question_overdue",
                title="An applicant has not answered",
                message=f"{submission.reference_number}: the reply was due {question.reply_by:%d %b %Y}.",
            )
            _link(note, "idea", submission.id)
        question.overdue_flagged_at = timezone.now()
        question.save(update_fields=["overdue_flagged_at", "updated_at"])
        flagged += 1
    return {"reminded": reminded, "flagged": flagged}

