"""Phone-only accounts and one-time sign-in codes.

- User.email becomes nullable (still unique when set) so phone-only users can exist.
- User.phone_verified records that a phone number was proven with a code.
- New auth methods (phone code, email code, CEDA staff SSO) and the CEDA staff provider.
- LoginCode stores hashed one-time codes.

Reversing: the reverse of the email AlterField makes the column NOT NULL again, which
fails while phone-only users exist. Delete or give those users an email first.
"""

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models

PROVIDER_CHOICES = [
    ("google", "Google"),
    ("github", "GitHub"),
    ("microsoft", "Microsoft"),
    ("linkedin", "LinkedIn"),
    ("ceda_staff", "CEDA staff sign-in"),
]

PRIMARY_AUTH_CHOICES = [
    ("password", "Password"),
    ("google", "Google"),
    ("github", "GitHub"),
    ("microsoft", "Microsoft"),
    ("ceda_staff", "CEDA staff sign-in"),
    ("phone_code", "Phone code"),
    ("email_code", "Email code"),
]


def blank_emails_to_null(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(email="").update(email=None)


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0008_user_sort_idx"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="email",
            field=models.EmailField(blank=True, max_length=254, null=True, unique=True),
        ),
        migrations.RunPython(blank_emails_to_null, migrations.RunPython.noop),
        migrations.AddField(
            model_name="user",
            name="phone_verified",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="user",
            name="primary_auth_method",
            field=models.CharField(blank=True, choices=PRIMARY_AUTH_CHOICES, default="", max_length=30),
        ),
        migrations.AlterField(
            model_name="socialaccount",
            name="provider",
            field=models.CharField(choices=PROVIDER_CHOICES, max_length=30),
        ),
        migrations.AlterField(
            model_name="socialauthstate",
            name="provider",
            field=models.CharField(choices=PROVIDER_CHOICES, max_length=30),
        ),
        migrations.CreateModel(
            name="LoginCode",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("target_type", models.CharField(choices=[("phone", "Phone"), ("email", "Email")], max_length=10)),
                ("target", models.CharField(db_index=True, max_length=255)),
                ("channel", models.CharField(choices=[("sms", "SMS"), ("email", "Email"), ("whatsapp", "WhatsApp")], max_length=20)),
                ("code_hash", models.CharField(max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("attempts", models.PositiveSmallIntegerField(default=0)),
                ("max_attempts", models.PositiveSmallIntegerField(default=5)),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("requested_ip", models.GenericIPAddressField(blank=True, null=True)),
                (
                    "user",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="login_codes",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "indexes": [
                    models.Index(fields=["target_type", "target", "used_at"], name="login_code_lookup_idx"),
                    models.Index(fields=["expires_at"], name="login_code_expiry_idx"),
                ],
            },
        ),
    ]
