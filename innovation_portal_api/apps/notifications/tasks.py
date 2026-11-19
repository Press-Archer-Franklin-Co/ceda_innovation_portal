import datetime
import logging

from celery import shared_task
from django.utils import timezone

from apps.communications.services import CommunicationService
from apps.operations.services import OperationsService

logger = logging.getLogger(__name__)


@shared_task
def send_communication_task(log_id: str) -> None:
    CommunicationService.dispatch_log(log_id)


@shared_task
def send_pending_judge_reminders() -> None:
    CommunicationService.send_pending_judge_reminders()


@shared_task
def send_operational_reminders() -> None:
    OperationsService.dispatch_reminders_and_escalations()


@shared_task
def purge_expired_tokens() -> dict:
    """Delete security tokens, MFA challenges, and OAuth states that expired more than 7 days ago."""
    from apps.accounts.models import MFAChallenge, SocialAuthState, UserSecurityToken

    cutoff = timezone.now() - datetime.timedelta(days=7)
    deleted_tokens, _ = UserSecurityToken.objects.filter(expires_at__lt=cutoff).delete()
    deleted_challenges, _ = MFAChallenge.objects.filter(expires_at__lt=cutoff).delete()
    deleted_states, _ = SocialAuthState.objects.filter(expires_at__lt=cutoff).delete()
    result = {
        "deleted_tokens": deleted_tokens,
        "deleted_challenges": deleted_challenges,
        "deleted_oauth_states": deleted_states,
    }
    logger.info("purge_expired_tokens: %s", result)
    return result


@shared_task
def send_question_reminders():
    """B3, daily: remind applicants 2 days before a reply-by date; flag overdue questions to officers."""
    from apps.communications.messaging import send_question_reminders as run

    return run()

