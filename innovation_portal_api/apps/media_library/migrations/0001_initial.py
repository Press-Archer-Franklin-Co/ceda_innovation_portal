import uuid

import apps.core.i18n
import apps.media_library.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="MediaAsset",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "kind",
                    models.CharField(
                        choices=[("image", "Image"), ("video", "Video"), ("document", "Document"), ("audio", "Audio")],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                ("file", models.FileField(max_length=255, upload_to=apps.media_library.models.media_upload_path)),
                ("original_filename", models.CharField(blank=True, max_length=255)),
                ("mime_type", models.CharField(max_length=120)),
                ("size_bytes", models.PositiveBigIntegerField(default=0)),
                ("sha256", models.CharField(blank=True, max_length=64)),
                ("width", models.PositiveIntegerField(blank=True, null=True)),
                ("height", models.PositiveIntegerField(blank=True, null=True)),
                ("duration_seconds", models.FloatField(blank=True, null=True)),
                ("captions_file", models.FileField(blank=True, max_length=255, upload_to=apps.media_library.models.media_captions_path)),
                ("monochrome_file", models.FileField(blank=True, max_length=255, upload_to=apps.media_library.models.media_monochrome_path)),
                (
                    "alt_text",
                    models.JSONField(blank=True, default=apps.core.i18n.translated_default, validators=[apps.core.i18n.validate_translated_text]),
                ),
                (
                    "uploaded_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="media_assets",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("-created_at",),
                "indexes": [models.Index(fields=["uploaded_by", "kind"], name="media_owner_kind_idx")],
            },
        ),
    ]
