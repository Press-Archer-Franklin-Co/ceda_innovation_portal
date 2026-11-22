"""C3: new integration kind `ai` (the AI helper, provider anthropic). Choices only, no data change.

Renumbered after channels' 0004 reached main (R-36, R-38): it depends on it and keeps `ussd`.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("platform_config", "0004_channels_ussd_kind_multi_active")]

    operations = [
        migrations.AlterField(
            model_name="integrationconnection",
            name="kind",
            field=models.CharField(
                choices=[
                    ("sso", "Single sign-on"),
                    ("sms", "SMS"),
                    ("email", "Email"),
                    ("whatsapp", "WhatsApp"),
                    ("ussd", "USSD"),
                    ("translation", "Translation"),
                    ("storage", "Storage"),
                    ("ai", "AI helper"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
