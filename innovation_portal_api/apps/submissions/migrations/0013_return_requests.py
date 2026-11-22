import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("submissions", "0012_r54_entry_panel_feedback"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ReturnRequest",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("step_code", models.CharField(blank=True, max_length=100)),
                ("step_name", models.CharField(blank=True, max_length=255)),
                ("reason", models.TextField()),
                ("fix_by", models.DateField(blank=True, null=True)),
                ("items", models.JSONField(blank=True, default=list)),
                ("before", models.JSONField(blank=True, default=dict)),
                (
                    "status",
                    models.CharField(
                        choices=[("open", "Waiting for the innovator"), ("resent", "Resent"), ("cancelled", "Cancelled")],
                        db_index=True,
                        default="open",
                        max_length=20,
                    ),
                ),
                ("resent_at", models.DateTimeField(blank=True, null=True)),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("resent_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL)),
                ("submission", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="return_requests", to="submissions.submission")),
            ],
            options={"ordering": ("-created_at",)},
        ),
    ]
