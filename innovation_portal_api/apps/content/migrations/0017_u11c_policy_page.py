import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0016_u7_hero_photo"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="PolicyPage",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "key",
                    models.CharField(
                        choices=[
                            ("about", "About"),
                            ("guidelines", "Guidelines"),
                            ("privacy", "Privacy policy"),
                            ("terms_of_use", "Terms of use"),
                            ("terms_of_agreement", "Terms of agreement"),
                        ],
                        max_length=40,
                        unique=True,
                    ),
                ),
                ("title", models.JSONField(blank=True, default=dict)),
                ("intro", models.JSONField(blank=True, default=dict)),
                ("sections", models.JSONField(blank=True, default=list)),
                ("published_at", models.DateTimeField(blank=True, null=True)),
                ("draft", models.JSONField(blank=True, help_text="Unpublished edits: {title, intro, sections}. Null when there are none.", null=True)),
                ("draft_updated_at", models.DateTimeField(blank=True, null=True)),
                ("draft_updated_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("published_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["key"]},
        ),
    ]
