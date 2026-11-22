from celery import shared_task


@shared_task(ignore_result=True, soft_time_limit=60)
def extract_document_text(document_id, force=False):
    """After an upload (and on demand): read the file's text into its DocumentVersion."""
    from apps.documents.models import SubmissionDocument
    from apps.documents.text import extract_for_document

    document = SubmissionDocument.objects.filter(id=document_id).first()
    if document is not None:
        extract_for_document(document, force=force)
