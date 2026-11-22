import uuid
from pathlib import Path

from django.conf import settings
from django.db import models

from apps.core.constants import DocumentType
from apps.core.models import TimeStampedModel, UUIDModel


def document_upload_path(instance, filename):
    """Store files under a random name so a guessed or leaked path reveals nothing.

    The original filename is kept on the row (original_filename) and used for downloads.
    """
    ext = Path(filename).suffix.lower()[:10]
    return f"submission_documents/{uuid.uuid4().hex}{ext}"


class DocumentCategory(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=50, unique=True)

    def __str__(self) -> str:
        return self.name


class SubmissionDocument(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="documents", null=True, blank=True)
    application_draft = models.ForeignKey("submissions.ApplicationDraft", on_delete=models.CASCADE, related_name="documents", null=True, blank=True)
    category = models.ForeignKey(DocumentCategory, on_delete=models.PROTECT, related_name="documents")
    field_key = models.SlugField(max_length=100, blank=True)
    document_type = models.CharField(max_length=20, choices=DocumentType.choices, default=DocumentType.FILE)
    file = models.FileField(upload_to=document_upload_path, blank=True)
    external_url = models.URLField(blank=True)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=120, blank=True)
    size_bytes = models.PositiveBigIntegerField(default=0)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    version_number = models.PositiveIntegerField(default=1)
    is_latest = models.BooleanField(default=True)
    is_current = models.BooleanField(default=True, db_index=True)
    is_active = models.BooleanField(default=True)
    replaced_by = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="replaces")
    upload_group_id = models.UUIDField(default=uuid.uuid4, db_index=True)
    metadata = models.JSONField(default=dict, blank=True)


    sha256 = models.CharField(max_length=64, blank=True)

    @property
    def has_local_copy(self) -> bool:
        return bool(self.file)


class DocumentVersion(UUIDModel, TimeStampedModel):
    document = models.ForeignKey(SubmissionDocument, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    file = models.FileField(upload_to="submission_documents/versions/", blank=True)
    external_url = models.URLField(blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    # Copilot: the text read from the file (apps.documents.text), filled after upload and on demand.
    extracted_text = models.TextField(blank=True, default="")
    extracted_pages = models.JSONField(default=list, blank=True, help_text="The text of each page, so answers can say page 3.")
    text_status = models.CharField(
        max_length=20,
        blank=True,
        default="",
        choices=[("ok", "Read"), ("empty", "No text (a scan?)"), ("unsupported", "Not a readable type"), ("too_large", "Too large"), ("failed", "Could not read")],
    )
    text_detail = models.CharField(max_length=300, blank=True, default="")
    text_extracted_at = models.DateTimeField(null=True, blank=True)
