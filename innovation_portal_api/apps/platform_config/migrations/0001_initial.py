import uuid

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
            name="FeatureFlag",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("key", models.SlugField(max_length=60, unique=True)),
                ("label", models.CharField(max_length=120)),
                ("description", models.CharField(blank=True, max_length=300)),
                (
                    "group",
                    models.CharField(
                        choices=[
                            ("sign_in", "Sign-in"),
                            ("ideas", "Ideas"),
                            ("website", "Website"),
                            ("messaging", "Messaging"),
                            ("integrations", "Integrations"),
                        ],
                        max_length=20,
                    ),
                ),
                ("enabled", models.BooleanField(default=False)),
                ("is_public", models.BooleanField(default=False, help_text="Safe to show to the public site.")),
                ("coming_soon", models.BooleanField(default=False, help_text="Shown but locked in the console.")),
                ("ordering", models.PositiveIntegerField(default=0)),
                (
                    "updated_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="feature_flags_updated",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ("group", "ordering", "key")},
        ),
        migrations.CreateModel(
            name="IntegrationConnection",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "kind",
                    models.CharField(
                        choices=[
                            ("sso", "Single sign-on"),
                            ("sms", "SMS"),
                            ("email", "Email"),
                            ("whatsapp", "WhatsApp"),
                            ("translation", "Translation"),
                            ("storage", "Storage"),
                        ],
                        db_index=True,
                        max_length=20,
                    ),
                ),
                ("provider", models.CharField(max_length=60)),
                ("name", models.CharField(max_length=120)),
                ("config", models.JSONField(blank=True, default=dict)),
                ("secrets_encrypted", models.TextField(blank=True, default="")),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("draft", "Draft"),
                            ("tested", "Tested"),
                            ("failed", "Test failed"),
                            ("active", "Active"),
                            ("disabled", "Disabled"),
                        ],
                        default="draft",
                        max_length=20,
                    ),
                ),
                ("is_active", models.BooleanField(default=False)),
                ("last_tested_at", models.DateTimeField(blank=True, null=True)),
                ("last_test_result", models.JSONField(blank=True, default=dict)),
                ("activated_at", models.DateTimeField(blank=True, null=True)),
                (
                    "activated_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="integrations_activated", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "created_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="integrations_created", to=settings.AUTH_USER_MODEL),
                ),
                (
                    "updated_by",
                    models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="integrations_updated", to=settings.AUTH_USER_MODEL),
                ),
            ],
            options={
                "ordering": ("kind", "-is_active", "-updated_at"),
                "constraints": [
                    models.UniqueConstraint(
                        condition=models.Q(("is_active", True)),
                        fields=("kind",),
                        name="uq_one_active_integration_per_kind",
                    )
                ],
            },
        ),
        migrations.CreateModel(
            name="SSOTrialSession",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("state", models.CharField(max_length=120, unique=True)),
                ("nonce", models.CharField(max_length=120)),
                ("redirect_uri", models.URLField()),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("result", models.JSONField(blank=True, default=dict)),
                (
                    "connection",
                    models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="sso_trials", to="platform_config.integrationconnection"),
                ),
                (
                    "started_by",
                    models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="+", to=settings.AUTH_USER_MODEL),
                ),
            ],
        ),
    ]
