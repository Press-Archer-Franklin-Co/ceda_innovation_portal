
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0005_alter_contentitem_image'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='LeadershipCard',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('full_name', models.CharField(max_length=255)),
                ('job_title', models.CharField(max_length=255)),
                ('committee_role', models.CharField(blank=True, default='', help_text="Optional subtitle, e.g. 'Innovation Committee Chairperson'", max_length=255)),
                ('quote', models.TextField(help_text='The testimonial / message from this leader.')),
                ('photo', models.ImageField(blank=True, help_text='Portrait image — displayed as a circle.', null=True, upload_to='content/leadership/')),
                ('sort_order', models.PositiveIntegerField(db_index=True, default=0, help_text='Lower numbers appear first in the carousel.')),
                ('is_active', models.BooleanField(db_index=True, default=True, help_text='Only active cards are shown on the homepage.')),
                ('start_at', models.DateTimeField(blank=True, help_text='Optional: show card only from this date/time.', null=True)),
                ('end_at', models.DateTimeField(blank=True, help_text='Optional: hide card after this date/time.', null=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='leadership_cards', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Leadership Card',
                'verbose_name_plural': 'Leadership Cards',
                'ordering': ['sort_order', 'created_at'],
            },
        ),
    ]
