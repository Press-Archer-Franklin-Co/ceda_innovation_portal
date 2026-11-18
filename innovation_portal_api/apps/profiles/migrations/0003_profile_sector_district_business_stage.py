import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("profiles", "0002_shared_applicant_fields"),
        ("reference", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="innovatorprofile",
            name="district",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="innovator_profiles",
                to="reference.district",
            ),
        ),
        migrations.AddField(
            model_name="innovatorprofile",
            name="sector",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="innovator_profiles",
                to="reference.sector",
            ),
        ),
        migrations.AddField(
            model_name="innovatorprofile",
            name="business_stage",
            field=models.CharField(
                blank=True,
                choices=[("idea", "Idea"), ("testing", "Testing"), ("selling", "Selling"), ("growing", "Growing")],
                max_length=20,
            ),
        ),
    ]
