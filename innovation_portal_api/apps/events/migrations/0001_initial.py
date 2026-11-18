
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
            name='AttendanceRecord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(default='registered', max_length=20)),
                ('attendee', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_records', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CheckInLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('attendance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='check_ins', to='events.attendancerecord')),
                ('checked_in_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Event',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('location', models.CharField(blank=True, max_length=255)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='events', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AddField(
            model_name='attendancerecord',
            name='event',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='attendance_records', to='events.event'),
        ),
        migrations.CreateModel(
            name='EventSession',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('event', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='events.event')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='PresentationSlot',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('starts_at', models.DateTimeField()),
                ('ends_at', models.DateTimeField()),
                ('session', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='slots', to='events.eventsession')),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='presentation_slots', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
