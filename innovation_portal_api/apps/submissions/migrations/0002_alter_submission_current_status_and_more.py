
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0002_submissionform_code_submissionform_version_and_more'),
        ('submissions', '0001_initial'),
        ('teams', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='submission',
            name='current_status',
            field=models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('screening', 'Screening'), ('judging_review', 'Judging Review'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('returned', 'Returned'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], db_index=True, default='draft', max_length=40),
        ),
        migrations.AlterField(
            model_name='submissionstatushistory',
            name='to_status',
            field=models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('screening', 'Screening'), ('judging_review', 'Judging Review'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('returned', 'Returned'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], max_length=40),
        ),
        migrations.CreateModel(
            name='ApplicationDraft',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('reference_number', models.CharField(db_index=True, max_length=60, unique=True)),
                ('submission_type', models.CharField(choices=[('idea', 'Idea'), ('hackathon_application', 'Hackathon Application')], max_length=40)),
                ('title', models.CharField(max_length=255)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted')], db_index=True, default='draft', max_length=20)),
                ('version', models.PositiveIntegerField(default=1)),
                ('draft_data', models.JSONField(blank=True, default=dict)),
                ('progress_metadata', models.JSONField(blank=True, default=dict)),
                ('current_section_code', models.CharField(blank=True, max_length=100)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('innovator', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='application_drafts', to=settings.AUTH_USER_MODEL)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='application_drafts', to='programs.program')),
                ('submitted_submission', models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='source_draft', to='submissions.submission')),
                ('team', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='application_drafts', to='teams.team')),
            ],
            options={
                'ordering': ('-updated_at', '-created_at'),
                'constraints': [models.UniqueConstraint(condition=models.Q(('status', 'draft')), fields=('innovator', 'program'), name='uq_active_application_draft_per_user_program')],
            },
        ),
    ]
