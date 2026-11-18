from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assignments", "0005_specialistinvitation"),
    ]

    operations = [
        migrations.AddField(
            model_name="specialistinvitation",
            name="required_review_count",
            field=models.PositiveIntegerField(default=1),
        ),
    ]
