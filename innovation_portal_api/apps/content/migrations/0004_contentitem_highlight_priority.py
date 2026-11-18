from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0003_contentitem_image_filefield"),
    ]

    operations = [
        migrations.AddField(
            model_name="contentitem",
            name="highlight_priority",
            field=models.PositiveSmallIntegerField(
                blank=True,
                db_index=True,
                help_text="Homepage highlight order from 1 (lead story) to 5.",
                null=True,
            ),
        ),
    ]
