import logging

from django.conf import settings
from django.template import Context, Template
from django.utils import timezone

from apps.audit.services import AuditService
from apps.communications.email_notifications import EmailNotificationService
from apps.communications.models import CommunicationLog, MessageTemplate, Notification
from apps.communications.senders import MessageSenderRegistry
from apps.core.constants import CommunicationChannel, CommunicationStatus, TemplateCode
from apps.core.phone import try_normalize_phone

logger = logging.getLogger(__name__)


class CommunicationService:
    TEXT_CHANNELS = frozenset({CommunicationChannel.SMS, CommunicationChannel.WHATSAPP, CommunicationChannel.USSD})

    @staticmethod
    def _dispatch_or_enqueue(log):
        from apps.notifications.tasks import send_communication_task

        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            CommunicationService.dispatch_log(str(log.id))
            return log
        try:
            send_communication_task.delay(str(log.id))
        except Exception:
            CommunicationService.dispatch_log(str(log.id))
        return log

    @staticmethod
    def _context_for_submission(submission):
        return {
            "innovator_name": submission.innovator.full_name,
            "submission_reference": submission.reference_number,
            "program_name": submission.program.title,
            "submission_title": submission.title,
            "status": submission.current_status,
            "event_date": submission.program.event_date,
        }

    @staticmethod
    def render_template(template: MessageTemplate, context: dict):
        subject = Template(template.subject_template).render(Context(context))
        body = Template(template.body_template).render(Context(context))
        return subject, body

    @staticmethod
    def log_communication(*, recipient, channel, body, subject="", sent_by=None, template=None, submission=None, program=None, notification=None):
        log = CommunicationLog.objects.create(
            recipient=recipient,
            notification=notification,
            channel=channel,
            template=template,
            subject=subject,
            rendered_body=body,
            sent_by=sent_by,
            related_submission=submission,
            related_program=program,
        )
        return log

    @staticmethod
    def queue_submission_acknowledgement(submission):
        template = MessageTemplate.objects.filter(code=TemplateCode.ACKNOWLEDGEMENT, active=True).first()
        if template:
            subject, body = CommunicationService.render_template(template, CommunicationService._context_for_submission(submission))
        else:
            subject, body = "Submission received", f"Your submission {submission.reference_number} has been received."
        EmailNotificationService.send_submission_received_email(submission=submission)
        log = CommunicationService.log_communication(
            recipient=submission.innovator,
            channel=CommunicationChannel.EMAIL,
            body=body,
            subject=subject,
            submission=submission,
            program=submission.program,
        )
        log.status = CommunicationStatus.SENT
        log.failure_reason = ""
        log.sent_at = timezone.now()
        log.retry_count += 1
        log.last_attempt_at = timezone.now()
        log.save(update_fields=["status", "failure_reason", "sent_at", "retry_count", "last_attempt_at", "updated_at"])
        return log

    @staticmethod
    def send_correction_request(submission, reason, actor):
        body = f"Your submission requires more information. Reason: {reason}"
        log = CommunicationService.log_communication(
            recipient=submission.innovator,
            channel=CommunicationChannel.EMAIL,
            body=body,
            subject="Correction requested",
            sent_by=actor,
            submission=submission,
            program=submission.program,
        )
        Notification.objects.create(recipient=submission.innovator, title="Correction requested", body=body)
        AuditService.log_action(actor=actor, action_type="communication_sent", target=submission, metadata={"communication_id": str(log.id)})
        return log

    @staticmethod
    def queue_assignment_notification(assignment):
        body = f"You have been assigned as {assignment.role_type} for submission {assignment.submission.title}."
        log = CommunicationService.log_communication(
            recipient=assignment.assignee,
            channel=CommunicationChannel.EMAIL,
            body=body,
            subject="New assignment",
            sent_by=assignment.assigned_by,
            submission=assignment.submission,
            program=assignment.submission.program,
        )
        return CommunicationService._dispatch_or_enqueue(log)

    @staticmethod
    def queue_conflict_notification(assignment, details):
        return CommunicationService.log_communication(
            recipient=assignment.assigned_by,
            channel=CommunicationChannel.INTERNAL,
            body=f"Conflict declared by {assignment.assignee.full_name}: {details}",
            subject="Conflict declared",
            submission=assignment.submission,
            program=assignment.submission.program,
        )

    @staticmethod
    def send_decision_notification(submission, decision, actor):
        body = f"Decision for {submission.reference_number}: {decision}."
        log = CommunicationService.log_communication(
            recipient=submission.innovator,
            channel=CommunicationChannel.EMAIL,
            body=body,
            subject="Submission decision",
            sent_by=actor,
            submission=submission,
            program=submission.program,
        )
        return CommunicationService._dispatch_or_enqueue(log)

    @staticmethod
    def dispatch_log(log_id: str):
        log = CommunicationLog.objects.select_related("recipient", "related_submission", "related_program").get(id=log_id)
        log.last_attempt_at = timezone.now()
        log.retry_count += 1
        if log.channel == CommunicationChannel.EMAIL:
            try:
                summary_items = []
                if log.related_submission:
                    summary_items.extend([
                        {"label": "Submission", "value": log.related_submission.title},
                        {"label": "Reference", "value": log.related_submission.reference_number},
                    ])
                if log.related_program:
                    summary_items.append({"label": "Programme", "value": log.related_program.title})
                EmailNotificationService.send_generic_notification_email(
                    user=log.recipient,
                    subject=log.subject or "CEDA Innovation Portal notification",
                    headline=log.subject or "Notification",
                    intro=log.rendered_body,
                    summary_items=summary_items,
                )
                log.status = CommunicationStatus.SENT
                log.failure_reason = ""
                log.sent_at = timezone.now()
                AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_sent", target=log, metadata={"recipient_id": str(log.recipient_id)})
            except Exception as exc:
                logger.exception("Failed to dispatch communication log", extra={"communication_log_id": str(log.id)})
                log.status = CommunicationStatus.FAILED
                log.failure_reason = str(exc)
                AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_failed", target=log, metadata={"recipient_id": str(log.recipient_id), "error": str(exc)})
        elif log.channel in CommunicationService.TEXT_CHANNELS:
            CommunicationService._dispatch_text_message(log)
        else:
            log.status = CommunicationStatus.SENT
            log.failure_reason = ""
            log.sent_at = timezone.now()
            AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_sent", target=log, metadata={"recipient_id": str(log.recipient_id)})
        log.save(update_fields=["status", "failure_reason", "retry_count", "last_attempt_at", "sent_at", "updated_at"])
        return log

    @staticmethod
    def _dispatch_text_message(log):
        """Send an SMS / WhatsApp / USSD log through the configured sender.

        A channel without a provider is marked skipped, not sent.
        """
        metadata = {"recipient_id": str(log.recipient_id), "channel": log.channel}
        phone = try_normalize_phone(getattr(log.recipient, "phone_number", ""))
        if not phone:
            log.status = CommunicationStatus.SKIPPED
            log.failure_reason = "Recipient has no valid phone number."
            AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_skipped", target=log, metadata={**metadata, "reason": "no_phone"})
            return
        try:
            delivered = MessageSenderRegistry.send(
                channel=log.channel,
                to=phone,
                body=log.rendered_body,
                metadata={"communication_log_id": str(log.id)},
            )
        except Exception as exc:
            logger.exception("Failed to dispatch %s communication log", log.channel, extra={"communication_log_id": str(log.id)})
            log.status = CommunicationStatus.FAILED
            log.failure_reason = str(exc)
            AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_failed", target=log, metadata={**metadata, "error": str(exc)})
            return
        if not delivered:
            log.status = CommunicationStatus.SKIPPED
            log.failure_reason = f"No {log.channel} provider is configured."
            AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_skipped", target=log, metadata={**metadata, "reason": "no_provider"})
            return
        log.status = CommunicationStatus.SENT
        log.failure_reason = ""
        log.sent_at = timezone.now()
        AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_sent", target=log, metadata=metadata)

    @staticmethod
    def retry_log(log_id: str):
        log = CommunicationLog.objects.get(id=log_id)
        log.status = CommunicationStatus.PENDING
        log.save(update_fields=["status", "updated_at"])
        AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_retried", target=log, metadata={"recipient_id": str(log.recipient_id)})
        return CommunicationService._dispatch_or_enqueue(log)

    @staticmethod
    def send_pending_judge_reminders():
        pending_logs = CommunicationLog.objects.filter(status=CommunicationStatus.PENDING, channel=CommunicationChannel.EMAIL)
        for log in pending_logs:
            CommunicationService.dispatch_log(str(log.id))
