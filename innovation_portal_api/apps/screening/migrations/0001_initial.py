
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
            name='DuplicateFlag',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('reason', models.TextField()),
                ('flagged_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='duplicate_flags', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ScreeningChecklist',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='screening_checklists', to='programs.program')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ScreeningChecklistItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('label', models.CharField(max_length=255)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('required', models.BooleanField(default=True)),
                ('checklist', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='screening.screeningchecklist')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ScreeningReview',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('is_complete', models.BooleanField(default=False)),
                ('is_eligible', models.BooleanField(default=False)),
                ('has_duplicate_concern', models.BooleanField(default=False)),
                ('notes', models.TextField(blank=True)),
                ('decision', models.CharField(choices=[('advance', 'Advance'), ('requires_more_information', 'Requires More Information'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted')], max_length=40)),
                ('justification', models.TextField()),
                ('reviewed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='screening_reviews', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
