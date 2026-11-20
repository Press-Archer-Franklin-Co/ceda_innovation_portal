"""C3: new integration kind `ai` (the AI helper, provider anthropic). Choices only, no data change.

The channels lane adds `ussd` to the same field (R-36). Whichever reaches main second renumbers
and keeps both values in the choices.
"""

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("platform_config", "0003_quick_start_basics_only_flag")]

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
                    ("translation", "Translation"),
                    ("storage", "Storage"),
                    ("ai", "AI helper"),
                ],
                db_index=True,
                max_length=20,
            ),
        ),
    ]
