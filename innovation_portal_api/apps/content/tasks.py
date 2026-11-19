from celery import shared_task


@shared_task
def publish_due_content():
    """Every 5 minutes: scheduled posts go live, expired posts and quotes come down, the home cache refreshes."""
    from apps.content.services import publish_due_content as run

    return run()
