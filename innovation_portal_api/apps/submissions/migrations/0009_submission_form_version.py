import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0014_publish_existing_forms"),
        ("submissions", "0008_guest_drafts_consent_sector"),
    ]

    operations = [
        migrations.AddField(
            model_name="submission",
            name="form_version",
            field=models.ForeignKey(
                blank=True,
                help_text="The published form version the applicant answered.",
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="submissions",
                to="programs.formversion",
            ),
        ),
    ]
