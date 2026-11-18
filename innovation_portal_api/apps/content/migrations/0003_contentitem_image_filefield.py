from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0002_site_settings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="contentitem",
            name="image",
            field=models.FileField(
                blank=True,
                null=True,
                upload_to="content/covers/",
                help_text="Cover image (JPG/PNG/WebP) or video (MP4/WebM).",
            ),
        ),
    ]
