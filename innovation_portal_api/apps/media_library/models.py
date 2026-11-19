import uuid
from pathlib import Path

from django.conf import settings
from django.db import models

from apps.core.i18n import translated_default, validate_translated_text
from apps.core.models import TimeStampedModel, UUIDModel


def _random_name(prefix: str, filename: str) -> str:
    ext = Path(filename).suffix.lower()[:10]
    return f"{prefix}/{uuid.uuid4().hex}{ext}"


def media_upload_path(instance, filename):
    return _random_name(f"media_assets/{instance.kind or 'other'}", filename)


def media_monochrome_path(instance, filename):
    return _random_name("media_assets/monochrome", filename)


def media_captions_path(instance, filename):
    return _random_name("media_assets/captions", filename)


class MediaAsset(UUIDModel, TimeStampedModel):
    """One uploaded image, video, document or audio file for site content and forms.

    Files are stored under random names and served from MEDIA_URL. Private
    application attachments keep using apps.documents, which checks access.
    """

    class Kind(models.TextChoices):
        IMAGE = "image", "Image"
        VIDEO = "video", "Video"
        DOCUMENT = "document", "Document"
        AUDIO = "audio", "Audio"

    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    file = models.FileField(upload_to=media_upload_path, max_length=255)
    original_filename = models.CharField(max_length=255, blank=True)
    mime_type = models.CharField(max_length=120)
    size_bytes = models.PositiveBigIntegerField(default=0)
    sha256 = models.CharField(max_length=64, blank=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    captions_file = models.FileField(upload_to=media_captions_path, max_length=255, blank=True)
    monochrome_file = models.FileField(upload_to=media_monochrome_path, max_length=255, blank=True)
    alt_text = models.JSONField(default=translated_default, blank=True, validators=[validate_translated_text])
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="media_assets",
    )

    class Meta:
        ordering = ("-created_at",)
        indexes = [models.Index(fields=["uploaded_by", "kind"], name="media_owner_kind_idx")]

    def __str__(self) -> str:
        return self.original_filename or str(self.id)
