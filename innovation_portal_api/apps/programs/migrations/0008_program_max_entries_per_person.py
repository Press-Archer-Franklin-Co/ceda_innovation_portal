from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0007_innovation_challenge"),
    ]

    operations = [
        migrations.AddField(
            model_name="program",
            name="max_entries_per_person",
            field=models.PositiveIntegerField(blank=True, help_text="Leave blank for no limit.", null=True),
        ),
    ]
