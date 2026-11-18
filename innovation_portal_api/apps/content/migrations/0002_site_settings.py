
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='SiteSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('hero_video', models.FileField(blank=True, help_text='MP4/WebM video played as the homepage hero background.', null=True, upload_to='site/hero_videos/')),
                ('hero_video_muted', models.BooleanField(default=True, help_text='Whether the hero video plays muted by default.')),
            ],
            options={
                'verbose_name': 'Site Settings',
                'verbose_name_plural': 'Site Settings',
            },
        ),
    ]
