from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0004_contentitem_highlight_priority"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contentitem",
            name="image",
            field=models.FileField(blank=True, null=True, upload_to="content/covers/"),
        ),
    ]
