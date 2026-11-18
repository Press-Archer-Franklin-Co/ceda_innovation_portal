from django.db import transaction
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.communications.services import CommunicationService
from apps.core.constants import ScreeningOutcome
from apps.notifications.services import NotificationService
from apps.screening.models import DuplicateFlag, ScreeningReview
from apps.workflow.services import WorkflowRuntimeService


class ScreeningService:
    @staticmethod
    @transaction.atomic
    def perform_screening(*, submission, actor, data):
        review = ScreeningReview.objects.create(submission=submission, reviewed_by=actor, **data)
        if review.has_duplicate_concern:
            DuplicateFlag.objects.create(submission=submission, flagged_by=actor, reason=review.justification)
        if not hasattr(submission, "workflow_instance"):
            raise ValidationError("Screening requires an active workflow instance.")
        if review.decision == ScreeningOutcome.REQUIRES_MORE_INFORMATION:
            WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="return", comment=review.justification or review.notes)
        elif review.decision == ScreeningOutcome.SCREENED_OUT:
            WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="reject", comment=review.justification or review.notes)
        else:
            WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="approve", comment=review.notes)
        submission.screening_outcome = review.decision
        submission.save(update_fields=["screening_outcome", "updated_at"])
        if review.decision == ScreeningOutcome.REQUIRES_MORE_INFORMATION:
            CommunicationService.send_correction_request(submission, review.justification, actor)
            NotificationService.notify(
                user=submission.innovator,
                notification_type="submission_returned",
                title="Submission returned for correction",
                message=f"Submission {submission.reference_number} has been returned for correction. {review.justification}",
                send_email=True,
            )
        AuditService.log_action(actor=actor, action_type="screening_completed", target=submission, after_state={"screening_outcome": review.decision})
        return review
