from celery import shared_task


@shared_task
def escalate_unanswered_chats() -> dict:
    from apps.conversations.services import escalate_unanswered

    return escalate_unanswered()
