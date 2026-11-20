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
            "innovator_name": submission.innovator.full_name if submission.innovator_id else submission.guest_name,
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
    def text_contact_for_submission(submission) -> str:
        """Phone number for text updates: the guest's verified phone, or the innovator's."""
        if submission.innovator_id:
            return try_normalize_phone(submission.innovator.phone_number or "") or ""
        return submission.guest_phone or ""

    @staticmethod
    def send_submission_text(submission, *, body: str, subject: str):
        """Text message about a submission (SMS), logged against the submission. None if no phone."""
        to = CommunicationService.text_contact_for_submission(submission)
        if not to:
            return None
        log, _ = CommunicationService.record_text_message(
            channel=CommunicationChannel.SMS,
            to=to,
            body_for_log=body,
            subject=subject,
            recipient=submission.innovator if submission.innovator_id else None,
        )
        log.related_submission = submission
        log.related_program = submission.program
        log.save(update_fields=["related_submission", "related_program", "updated_at"])
        return log

    @staticmethod
    def send_guest_email(submission, *, subject: str, body: str):
        """Email a guest (no account) at the address they gave, logged against the submission."""
        from django.core.mail import send_mail

        log = CommunicationLog.objects.create(
            recipient=None,
            channel=CommunicationChannel.EMAIL,
            subject=subject,
            rendered_body=body,
            to_address=submission.guest_email,
            related_submission=submission,
            related_program=submission.program,
        )
        try:
            send_mail(subject, body, getattr(settings, "DEFAULT_FROM_EMAIL", None), [submission.guest_email], fail_silently=False)
            log.status = CommunicationStatus.SENT
            log.sent_at = timezone.now()
            log.failure_reason = ""
        except Exception as exc:  # the SMS still went; record the failure
            log.status = CommunicationStatus.FAILED
            log.failure_reason = str(exc)[:500]
        log.save(update_fields=["status", "sent_at", "failure_reason", "updated_at"])
        return log

    @staticmethod
    def queue_submission_acknowledgement(submission):
        if not submission.innovator_id or not submission.innovator.email:
            # No email address (guest or phone-only account): send the reference by SMS.
            track_url = f"{getattr(settings, 'PUBLIC_BASE_URL', '').rstrip('/')}/track/{submission.reference_number}"
            body = f"CEDA: we received your idea \"{submission.title}\". Your reference is {submission.reference_number}. Track it at {track_url}"
            log = CommunicationService.send_submission_text(submission, body=body, subject="Submission received")
            if not submission.innovator_id and submission.guest_email:
                # R-22: a guest who gave an email also gets the confirmation there.
                email_log = CommunicationService.send_guest_email(submission, subject="We received your idea", body=body)
                log = log or email_log
            return log
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
        if not submission.innovator_id:
            log = CommunicationService.send_submission_text(
                submission, body=f"CEDA, {submission.reference_number}: {body}", subject="Correction requested"
            )
            AuditService.log_action(actor=actor, action_type="communication_sent", target=submission, metadata={"communication_id": str(log.id) if log else None, "guest": True})
            return log
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
        if not submission.innovator_id:
            return CommunicationService.send_submission_text(submission, body=f"CEDA: {body}", subject="Submission decision")
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
        log.save(
            update_fields=[
                "status",
                "failure_reason",
                "retry_count",
                "last_attempt_at",
                "sent_at",
                "to_address",
                "provider",
                "provider_message_id",
                "provider_status",
                "updated_at",
            ]
        )
        return log

    @staticmethod
    def _dispatch_text_message(log):
        """Send an SMS / WhatsApp / USSD log through the configured provider.

        A switched-off channel or a channel without a provider is marked skipped, not sent.
        """
        metadata = {"recipient_id": str(log.recipient_id or ""), "channel": log.channel}
        phone = try_normalize_phone(log.to_address or getattr(log.recipient, "phone_number", ""))
        if not phone:
            log.status = CommunicationStatus.SKIPPED
            log.failure_reason = "Recipient has no valid phone number."
            AuditService.log_action(actor=log.sent_by, action_type="notification_delivery_skipped", target=log, metadata={**metadata, "reason": "no_phone"})
            return
        log.to_address = phone
        result = MessageSenderRegistry.deliver(
            channel=log.channel,
            to=phone,
            body=log.rendered_body,
            metadata={"communication_log_id": str(log.id)},
        )
        CommunicationService.apply_delivery_result(log, result)
        action = {
            "sent": "notification_delivery_sent",
            "skipped": "notification_delivery_skipped",
        }.get(result.status, "notification_delivery_failed")
        AuditService.log_action(actor=log.sent_by, action_type=action, target=log, metadata={**metadata, "provider": result.provider, "reason": result.reason})

    @staticmethod
    def apply_delivery_result(log, result) -> None:
        log.provider = result.provider or ""
        log.provider_message_id = result.message_id or ""
        log.provider_status = (result.provider_status or "")[:60]
        if result.status == "sent":
            log.status = CommunicationStatus.SENT
            log.failure_reason = ""
            log.sent_at = timezone.now()
        elif result.status == "skipped":
            log.status = CommunicationStatus.SKIPPED
            log.failure_reason = result.reason
        else:
            log.status = CommunicationStatus.FAILED
            log.failure_reason = result.reason

    @staticmethod
    def record_text_message(*, channel: str, to: str, body_for_log: str, subject: str, recipient=None, real_body: str | None = None):
        """Send a one-off text message and record it in CommunicationLog.

        ``body_for_log`` is what is stored; ``real_body`` is what is sent (kept out of the
        log for sign-in codes).
        """
        log = CommunicationLog.objects.create(
            recipient=recipient,
            channel=channel,
            to_address=to,
            subject=subject,
            rendered_body=body_for_log,
            last_attempt_at=timezone.now(),
            retry_count=1,
        )
        result = MessageSenderRegistry.deliver(
            channel=channel,
            to=to,
            body=real_body if real_body is not None else body_for_log,
            metadata={"communication_log_id": str(log.id)},
            purpose=subject,
        )
        CommunicationService.apply_delivery_result(log, result)
        log.save()
        return log, result

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
