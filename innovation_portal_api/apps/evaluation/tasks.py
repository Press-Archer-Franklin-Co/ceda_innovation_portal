from celery import shared_task

from apps.evaluation.services import EvaluationService


@shared_task
def process_due_timed_review_cycles() -> int:
    return EvaluationService.process_due_timed_review_cycles()
