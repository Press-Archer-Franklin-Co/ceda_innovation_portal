import uuid
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0006_seed_new_staff_roles"),
    ]

    operations = [
        migrations.CreateModel(
            name="UserMFAProfile",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("is_enabled", models.BooleanField(default=False)),
                ("method", models.CharField(blank=True, choices=[("email", "Email OTP"), ("totp", "Authenticator App")], default="", max_length=20)),
                ("totp_secret", models.CharField(blank=True, default="", max_length=128)),
                ("pending_totp_secret", models.CharField(blank=True, default="", max_length=128)),
                ("user", models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name="mfa_profile", to="accounts.user")),
            ],
        ),
        migrations.CreateModel(
            name="MFAChallenge",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("method", models.CharField(choices=[("email", "Email OTP"), ("totp", "Authenticator App")], max_length=20)),
                ("purpose", models.CharField(choices=[("login", "Login"), ("setup", "Setup"), ("disable", "Disable")], default="login", max_length=20)),
                ("auth_method", models.CharField(blank=True, default="", max_length=30)),
                ("code_hash", models.CharField(blank=True, default="", max_length=128)),
                ("expires_at", models.DateTimeField()),
                ("used_at", models.DateTimeField(blank=True, null=True)),
                ("user", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="mfa_challenges", to="accounts.user")),
            ],
        ),
        migrations.AddIndex(
            model_name="usermfaprofile",
            index=models.Index(fields=["user", "is_enabled", "method"], name="accounts_us_user_id_2bca33_idx"),
        ),
        migrations.AddIndex(
            model_name="mfachallenge",
            index=models.Index(fields=["user", "method", "purpose", "expires_at"], name="accounts_mf_user_id_5aafc3_idx"),
        ),
    ]
