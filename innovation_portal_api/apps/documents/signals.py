import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.documents.models import SubmissionDocument

logger = logging.getLogger(__name__)


@receiver(post_save, sender=SubmissionDocument, dispatch_uid="documents_extract_text_after_upload")
def queue_text_extraction(sender, instance, created, **kwargs):
    """Copilot: read the text of each new uploaded file in the background."""
    if not created or not instance.file or kwargs.get("raw"):
        return

    def _queue():
        from apps.documents.tasks import extract_document_text

        try:
            extract_document_text.delay(str(instance.id))
        except Exception:  # noqa: BLE001 - the upload stands; the text can be read on demand later
            logger.warning("could not queue text extraction for document %s", instance.id)

    transaction.on_commit(_queue)
