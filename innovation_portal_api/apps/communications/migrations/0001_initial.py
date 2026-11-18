
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0001_initial'),
        ('submissions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='MessageTemplate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('code', models.CharField(choices=[('acknowledgement', 'Acknowledgement'), ('correction_request', 'Correction Request'), ('reminder', 'Reminder'), ('shortlist', 'Shortlist'), ('rejection', 'Rejection'), ('winner', 'Winner'), ('general', 'General Announcement')], max_length=60, unique=True)),
                ('name', models.CharField(max_length=120)),
                ('subject_template', models.CharField(max_length=255)),
                ('body_template', models.TextField()),
                ('channel', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS'), ('internal', 'Internal Notification')], max_length=20)),
                ('active', models.BooleanField(default=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CommunicationLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('channel', models.CharField(choices=[('email', 'Email'), ('sms', 'SMS'), ('internal', 'Internal Notification')], max_length=20)),
                ('subject', models.CharField(blank=True, max_length=255)),
                ('rendered_body', models.TextField()),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed')], default='pending', max_length=20)),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='communication_logs', to=settings.AUTH_USER_MODEL)),
                ('related_program', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='communications', to='programs.program')),
                ('related_submission', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='communications', to='submissions.submission')),
                ('sent_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='communications_sent', to=settings.AUTH_USER_MODEL)),
                ('template', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='logs', to='communications.messagetemplate')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Notification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('body', models.TextField()),
                ('is_read', models.BooleanField(default=False)),
                ('recipient', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='NotificationPreference',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('email_enabled', models.BooleanField(default=True)),
                ('sms_enabled', models.BooleanField(default=False)),
                ('internal_enabled', models.BooleanField(default=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_preference', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
