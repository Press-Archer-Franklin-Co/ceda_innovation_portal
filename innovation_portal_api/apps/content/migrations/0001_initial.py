
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0003_program_closes_at_program_evaluation_closes_at_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ContentItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('excerpt', models.TextField(max_length=500)),
                ('body', models.TextField(blank=True, default='')),
                ('category', models.CharField(choices=[('announcement', 'Announcement'), ('challenge_update', 'Challenge Update'), ('winners', 'Winners'), ('partnership', 'Partnership'), ('success_story', 'Success Story')], default='announcement', max_length=50)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('published', 'Published'), ('archived', 'Archived')], default='draft', max_length=20)),
                ('image', models.ImageField(blank=True, null=True, upload_to='content/images/')),
                ('tags', models.JSONField(blank=True, default=list)),
                ('read_time', models.CharField(blank=True, default='', max_length=30)),
                ('is_highlighted', models.BooleanField(db_index=True, default=False, help_text='Show on homepage highlights (max 5 at a time)')),
                ('published_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('author', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='content_items', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name': 'Content Item',
                'verbose_name_plural': 'Content Items',
                'ordering': ['-published_at', '-created_at'],
            },
        ),
        migrations.CreateModel(
            name='HackathonDetail',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('banner_image', models.ImageField(blank=True, null=True, upload_to='content/hackathon_banners/')),
                ('theme', models.CharField(blank=True, default='', max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('rules', models.TextField(blank=True, default='')),
                ('prizes', models.JSONField(blank=True, default=list, help_text='Array of {position, label, amount, description}')),
                ('faq', models.JSONField(blank=True, default=list, help_text='Array of {question, answer}')),
                ('judges', models.JSONField(blank=True, default=list, help_text='Array of {name, title, bio, photo_url}')),
                ('schedule', models.JSONField(blank=True, default=list, help_text='Array of {date, label, description}')),
                ('is_published', models.BooleanField(default=False)),
                ('program', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='hackathon_detail', to='programs.program')),
            ],
            options={
                'verbose_name': 'Hackathon Detail',
                'verbose_name_plural': 'Hackathon Details',
            },
        ),
        migrations.CreateModel(
            name='HackathonMedia',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('media_type', models.CharField(choices=[('photo', 'Photo'), ('video', 'Video')], default='photo', max_length=10)),
                ('file', models.FileField(upload_to='content/hackathon_media/')),
                ('caption', models.CharField(blank=True, default='', max_length=255)),
                ('order', models.PositiveIntegerField(db_index=True, default=0)),
                ('hackathon_detail', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='media', to='content.hackathondetail')),
            ],
            options={
                'verbose_name': 'Hackathon Media',
                'verbose_name_plural': 'Hackathon Media',
                'ordering': ['order', 'created_at'],
            },
        ),
        migrations.CreateModel(
            name='WinnerSpotlight',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('team_name', models.CharField(max_length=255)),
                ('project_name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, default='')),
                ('position', models.CharField(choices=[('1st', '1st Place'), ('2nd', '2nd Place'), ('3rd', '3rd Place'), ('runner_up', 'Runner-up'), ('special', 'Special Award')], default='1st', max_length=20)),
                ('members_count', models.PositiveIntegerField(default=1)),
                ('year', models.PositiveIntegerField()),
                ('tags', models.JSONField(blank=True, default=list)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='content/winner_photos/')),
                ('is_featured', models.BooleanField(db_index=True, default=False, help_text='Show on homepage')),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='winner_spotlights', to='programs.program')),
            ],
            options={
                'verbose_name': 'Winner Spotlight',
                'verbose_name_plural': 'Winner Spotlights',
                'ordering': ['-year', 'position'],
            },
        ),
    ]
