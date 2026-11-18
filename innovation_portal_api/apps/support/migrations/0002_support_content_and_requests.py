from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("submissions", "0001_initial"),
        ("support", "0001_initial"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="FAQ",
            fields=[
                ("id", models.UUIDField(default=__import__("uuid").uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("question", models.CharField(max_length=255)),
                ("answer", models.TextField()),
                ("ordering", models.PositiveIntegerField(default=1)),
                ("is_public", models.BooleanField(default=True)),
            ],
            options={"ordering": ("ordering", "question")},
        ),
        migrations.CreateModel(
            name="Guideline",
            fields=[
                ("id", models.UUIDField(default=__import__("uuid").uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("title", models.CharField(max_length=255)),
                ("content", models.TextField()),
                ("document_url", models.URLField(blank=True)),
                ("audience", models.CharField(blank=True, max_length=120)),
                ("is_public", models.BooleanField(default=True)),
            ],
        ),
        migrations.CreateModel(
            name="SupportRequest",
            fields=[
                ("id", models.UUIDField(default=__import__("uuid").uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("request_type", models.CharField(default="technical_support", max_length=50)),
                ("subject", models.CharField(max_length=255)),
                ("description", models.TextField()),
                ("email", models.EmailField(max_length=254)),
                ("phone_number", models.CharField(blank=True, max_length=30)),
                ("status", models.CharField(default="open", max_length=50)),
                ("resolution_notes", models.TextField(blank=True)),
                (
                    "created_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_requests", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "submission",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="support_requests", to="submissions.submission"),
                ),
            ],
        ),
    ]
