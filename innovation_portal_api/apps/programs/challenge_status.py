"""R-53 (3.6 Challenge status): live numbers for a running call, and an update to everyone who started an entry."""

from __future__ import annotations

import math

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import AssignmentRoleType, SubmissionStatus

PANEL_STATUSES = (SubmissionStatus.SHORTLISTED, SubmissionStatus.FINALIST, SubmissionStatus.ASSIGNED_TO_JUDGES, SubmissionStatus.UNDER_JUDGING, SubmissionStatus.JUDGING_REVIEW)
CHANNELS = ("web", "email", "sms", "whatsapp")


def status_numbers(program) -> dict:
    from apps.submissions.models import ApplicationDraft, Submission
    from apps.workflow.models import TaskExecution, WorkflowInstance

    sent = Submission.objects.filter(program=program, submitted_at__isnull=False)
    drafts = ApplicationDraft.objects.filter(program=program)
    at_panel = Q(current_status__in=PANEL_STATUSES) | Q(workflow_instance__current_step__requires_evaluation=True) | Q(
        workflow_instance__current_step__assignment_role=AssignmentRoleType.JUDGE
    )
    # Reviewed: past the first step, finished, or with a finished review task.
    first_orders = {}
    for instance in WorkflowInstance.objects.filter(submission__in=sent).select_related("current_step__workflow_definition"):
        definition = instance.current_step.workflow_definition if instance.current_step_id else None
        if definition is not None and definition.id not in first_orders:
            first_orders[definition.id] = definition.steps.filter(is_active=True).order_by("order").values_list("order", flat=True).first()
    past_first = [
        instance.submission_id
        for instance in WorkflowInstance.objects.filter(submission__in=sent, current_step__isnull=False).select_related("current_step")
        if first_orders.get(instance.current_step.workflow_definition_id) is not None and instance.current_step.order > first_orders[instance.current_step.workflow_definition_id]
    ]
    finished = Q(workflow_instance__status__in=[WorkflowInstance.STATUS_COMPLETED, WorkflowInstance.STATUS_REJECTED]) | Q(
        workflow_instance__tasks__status=TaskExecution.STATUS_COMPLETED
    )
    reviewed = sent.filter(Q(id__in=past_first) | finished).distinct().count()
    closes = program.submission_closes_at
    now = timezone.now()
    days_left = None
    if closes:
        days_left = max(0, math.ceil((closes - now).total_seconds() / 86400))
    return {
        "started": drafts.count() + sent.count(),
        "submitted": sent.count(),
        "reviewed": reviewed,
        "to_panel": sent.filter(at_panel).distinct().count(),
        "closes_at": closes.isoformat() if closes else None,
        "days_left": days_left,
    }


def recipients(program):
    from apps.accounts.models import User

    return User.objects.filter(
        Q(application_drafts__program=program) | Q(submissions__program=program, submissions__submitted_at__isnull=False), is_active=True
    ).distinct()


def post_update(program, *, body: str, body_tn: str = "", channels=None, actor) -> dict:
    """Sends the update to everyone who started an entry. channels None: as each person prefers (web always)."""
    from apps.communications.messaging import _link
    from apps.communications.services import CommunicationService
    from apps.core.constants import CommunicationChannel, NotificationDeliveryChannel, NotificationType
    from apps.notifications.selectors import NotificationPreferenceSelector
    from apps.notifications.services import NotificationService

    body = (body or "").strip()
    if not body:
        raise ValidationError({"body": "Write the update."})
    if channels is not None and (not channels or any(channel not in CHANNELS for channel in channels)):
        raise ValidationError({"channels": f"Use some of: {', '.join(CHANNELS)}."})
    title = f"Update on {program.title}"
    sent = {"web": 0, "email": 0, "sms": 0, "whatsapp": 0}
    people = list(recipients(program))
    for user in people:
        text = body_tn.strip() if user.preferred_language == "tn" and (body_tn or "").strip() else body
        notification = NotificationService.notify(user=user, notification_type="challenge_update", title=title, message=text)
        _link(notification, "challenge", program.id)
        sent["web"] += 1
        for channel, delivery, address, preference in (
            ("email", CommunicationChannel.EMAIL, user.email, NotificationDeliveryChannel.EMAIL),
            ("sms", CommunicationChannel.SMS, user.phone_number, NotificationDeliveryChannel.SMS),
            ("whatsapp", CommunicationChannel.WHATSAPP, user.phone_number, NotificationDeliveryChannel.WHATSAPP),
        ):
            wanted = channel in channels if channels is not None else NotificationPreferenceSelector.is_enabled(user, NotificationType.OFFICER_MESSAGE, preference)
            if not address or not wanted:
                continue
            log = CommunicationService.log_communication(recipient=user, channel=delivery, body=text, subject=title, program=program, notification=notification, sent_by=actor)
            log.to_address = address
            log.save(update_fields=["to_address"])
            CommunicationService._dispatch_or_enqueue(log)
            sent[channel] += 1
    AuditService.log_action(
        actor=actor, action_type="challenge_update_posted", target=program, metadata={"recipients": len(people), "channels": channels or "preferred", "sent": sent, "body": body[:500]}
    )
    return {"recipients": len(people), "sent": sent}
