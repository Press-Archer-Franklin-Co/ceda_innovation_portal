from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("profiles", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="innovatorprofile",
            name="country_code",
            field=models.CharField(blank=True, max_length=12),
        ),
        migrations.AddField(
            model_name="innovatorprofile",
            name="country",
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name="innovatorprofile",
            name="person_type",
            field=models.CharField(blank=True, max_length=60),
        ),
        migrations.AddField(
            model_name="innovatorprofile",
            name="person_type_other",
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
