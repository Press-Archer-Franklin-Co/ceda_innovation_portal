from celery import shared_task

from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.challenge_results import ChallengeResultsService


@shared_task
def announce_due_challenge_results() -> int:
    return ChallengeResultsService.process_due()


@shared_task
def process_challenge_judging() -> int:
    """Invite judges on marking day, keep their assignments complete and remind them until they finish."""
    return ChallengeJudgingService.process_due()
