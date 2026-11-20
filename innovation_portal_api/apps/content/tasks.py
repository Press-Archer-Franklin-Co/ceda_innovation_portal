from celery import shared_task


@shared_task
def publish_due_content():
    """Every 5 minutes: scheduled posts go live, expired posts and quotes come down, the home cache refreshes."""
    from apps.content.services import publish_due_content as run

    return run()


@shared_task
def send_post_blast(blast_id):
    """Send one post to every confirmed email subscriber (WhatsApp stays pending)."""
    from apps.content.part2_services import SubscriptionService

    return SubscriptionService.send_blast(blast_id)
