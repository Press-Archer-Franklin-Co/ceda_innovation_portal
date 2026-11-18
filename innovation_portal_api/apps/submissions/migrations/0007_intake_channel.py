from django.db import migrations, models

CHANNEL_CHOICES = [("web", "Web"), ("whatsapp", "WhatsApp"), ("ussd", "USSD"), ("office", "CEDA office")]


def set_existing_rows_to_web(apps, schema_editor):
    # AddField already fills existing rows with the default; this makes the intent
    # explicit and repairs any row that ends up blank.
    for model_name in ("Submission", "ApplicationDraft"):
        model = apps.get_model("submissions", model_name)
        model.objects.filter(channel="").update(channel="web")


class Migration(migrations.Migration):

    dependencies = [
        ("submissions", "0006_innovation_challenge_submission_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="applicationdraft",
            name="channel",
            field=models.CharField(choices=CHANNEL_CHOICES, db_index=True, default="web", max_length=20),
        ),
        migrations.AddField(
            model_name="submission",
            name="channel",
            field=models.CharField(choices=CHANNEL_CHOICES, db_index=True, default="web", max_length=20),
        ),
        # Reverse is a no-op: the column is dropped by reversing AddField.
        migrations.RunPython(set_existing_rows_to_web, migrations.RunPython.noop),
    ]
