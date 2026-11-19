import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

CHANNEL_CHOICES = [
    ("email", "Email"),
    ("sms", "SMS"),
    ("internal", "Internal Notification"),
    ("whatsapp", "WhatsApp"),
    ("ussd", "USSD"),
]

STATUS_CHOICES = [
    ("pending", "Pending"),
    ("sent", "Sent"),
    ("failed", "Failed"),
    ("skipped", "Skipped (no provider configured)"),
]

NOTIFICATION_TYPE_CHOICES = [
    ("officer_message", "Message from an officer"),
    ("stage_change", "Application stage change"),
    ("deadline", "Deadline reminder"),
    ("new_challenge", "New challenge"),
    ("news", "News"),
    ("digest", "Digest"),
]


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0003_communicationlog_delivery_fields"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="messagetemplate",
            name="channel",
            field=models.CharField(choices=CHANNEL_CHOICES, max_length=20),
        ),
        migrations.AlterField(
            model_name="communicationlog",
            name="channel",
            field=models.CharField(choices=CHANNEL_CHOICES, max_length=20),
        ),
        migrations.AlterField(
            model_name="communicationlog",
            name="status",
            field=models.CharField(choices=STATUS_CHOICES, default="pending", max_length=20),
        ),
        migrations.CreateModel(
            name="NotificationTypePreference",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("notification_type", models.CharField(choices=NOTIFICATION_TYPE_CHOICES, max_length=40)),
                ("web_enabled", models.BooleanField(default=True)),
                ("whatsapp_enabled", models.BooleanField(default=False)),
                ("sms_enabled", models.BooleanField(default=False)),
                ("email_enabled", models.BooleanField(default=True)),
                (
                    "user",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="notification_type_preferences",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "ordering": ("notification_type",),
                "constraints": [
                    models.UniqueConstraint(fields=("user", "notification_type"), name="uq_user_notification_type_pref"),
                ],
            },
        ),
    ]
