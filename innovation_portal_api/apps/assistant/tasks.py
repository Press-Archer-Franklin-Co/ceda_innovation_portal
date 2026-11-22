"""Background work for the AI Copilot. Each task is safe to run twice and never raises."""

from __future__ import annotations

import logging

from celery import shared_task

logger = logging.getLogger("apps.assistant")


@shared_task
def build_idea_profile(submission_id: str) -> bool:
    from apps.assistant import gateway
    from apps.assistant.models import Feature
    from apps.assistant.profiles import build_profile
    from apps.submissions.models import Submission

    # Off, no service or out of budget: skip quietly (no usage row for every saved idea).
    if gateway.unavailable_reason(Feature.IDEA_PROFILE):
        return False

    submission = Submission.objects.select_related("sector", "district").filter(pk=submission_id).exclude(current_status="draft").first()
    if submission is None:
        return False
    try:
        return build_profile(submission) is not None
    except Exception:
        logger.exception("assistant.profile_failed submission=%s", submission_id)
        return False


@shared_task
def read_knowledge_document(document_id: str) -> str:
    from apps.assistant.knowledge_services import read_document

    try:
        return read_document(document_id)
    except Exception:
        logger.exception("assistant.knowledge_read_failed document=%s", document_id)
        return "failed"
