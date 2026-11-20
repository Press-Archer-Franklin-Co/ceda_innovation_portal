"""C2: add the USSD kind and allow several active USSD and WhatsApp connections.

Schema only, reversible. Reversing fails if two USSD or WhatsApp connections are active,
so turn the extra ones off first.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("platform_config", "0003_quick_start_basics_only_flag"),
    ]

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
                ],
                db_index=True,
                max_length=20,
            ),
        ),
        migrations.RemoveConstraint(
            model_name="integrationconnection",
            name="uq_one_active_integration_per_kind",
        ),
        migrations.AddConstraint(
            model_name="integrationconnection",
            constraint=models.UniqueConstraint(
                condition=models.Q(("is_active", True), models.Q(("kind__in", ["ussd", "whatsapp"]), _negated=True)),
                fields=("kind",),
                name="uq_one_active_integration_per_kind",
            ),
        ),
    ]
