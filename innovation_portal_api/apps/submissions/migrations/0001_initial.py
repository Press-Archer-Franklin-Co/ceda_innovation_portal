
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0001_initial'),
        ('teams', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='Submission',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('reference_number', models.CharField(blank=True, db_index=True, max_length=50)),
                ('submission_type', models.CharField(choices=[('idea', 'Idea'), ('hackathon_application', 'Hackathon Application')], max_length=40)),
                ('title', models.CharField(max_length=255)),
                ('current_status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], db_index=True, default='draft', max_length=40)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('screening_outcome', models.CharField(blank=True, choices=[('advance', 'Advance'), ('requires_more_information', 'Requires More Information'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted')], max_length=40)),
                ('final_decision', models.CharField(blank=True, choices=[('approved', 'Approved'), ('rejected', 'Rejected'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('selected_for_hackathon', 'Selected For Hackathon'), ('closed', 'Closed')], max_length=40)),
                ('locked_for_editing', models.BooleanField(default=False)),
                ('latest_version_number', models.PositiveIntegerField(default=1)),
                ('innovator', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to=settings.AUTH_USER_MODEL)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submissions', to='programs.program')),
                ('team', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submissions', to='teams.team')),
            ],
        ),
        migrations.CreateModel(
            name='SubmissionInternalNote',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('note', models.TextField()),
                ('author', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='internal_notes', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='SubmissionResponse',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('value', models.JSONField(blank=True, default=dict)),
                ('form_field', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='responses', to='programs.submissionformfield')),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='responses', to='submissions.submission')),
            ],
        ),
        migrations.CreateModel(
            name='SubmissionStatusHistory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('from_status', models.CharField(blank=True, max_length=40)),
                ('to_status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], max_length=40)),
                ('reason', models.TextField(blank=True)),
                ('comment', models.TextField(blank=True)),
                ('changed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='status_history', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='SubmissionVersion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version_number', models.PositiveIntegerField()),
                ('snapshot', models.JSONField(blank=True, default=dict)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='submissions.submission')),
                ('submitted_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['program', 'current_status'], name='submissions_program_cc6190_idx'),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['innovator', 'current_status'], name='submissions_innovat_741768_idx'),
        ),
        migrations.AddIndex(
            model_name='submission',
            index=models.Index(fields=['reference_number'], name='submissions_referen_8435b5_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='submissionresponse',
            unique_together={('submission', 'form_field')},
        ),
        migrations.AlterUniqueTogether(
            name='submissionversion',
            unique_together={('submission', 'version_number')},
        ),
    ]
