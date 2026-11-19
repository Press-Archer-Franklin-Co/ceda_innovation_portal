import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    """Record which provider sent a text message and its delivery status.

    recipient becomes nullable so a sign-in code sent to a number with no account yet can
    be logged. Reversing fails while such rows exist; delete them first.
    """

    dependencies = [
        ("communications", "0004_channels_and_type_preferences"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name="communicationlog",
            name="recipient",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name="communication_logs",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="to_address",
            field=models.CharField(blank=True, help_text="Phone number or address the message went to.", max_length=255),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="provider",
            field=models.CharField(blank=True, help_text="Provider key from Platform settings, or 'environment'.", max_length=60),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="provider_message_id",
            field=models.CharField(blank=True, db_index=True, max_length=255),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="provider_status",
            field=models.CharField(blank=True, max_length=60),
        ),
    ]
