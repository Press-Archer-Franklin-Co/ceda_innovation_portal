
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0003_program_closes_at_program_evaluation_closes_at_and_more'),
        ('submissions', '0002_alter_submission_current_status_and_more'),
        ('workflow', '0005_workflowstep_execution_mode_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SubmissionOutcome',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('outcome_type', models.CharField(choices=[('shortlisted', 'Shortlisted'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('rejected', 'Rejected'), ('approved', 'Approved')], db_index=True, max_length=30)),
                ('decided_at', models.DateTimeField()),
                ('score_snapshot', models.JSONField(blank=True, default=dict)),
                ('ranking_position', models.PositiveIntegerField(blank=True, null=True)),
                ('rationale', models.TextField(blank=True)),
                ('is_current', models.BooleanField(db_index=True, default=True)),
                ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submission_outcomes', to=settings.AUTH_USER_MODEL)),
                ('decision_step', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submission_outcomes', to='workflow.workflowstep')),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='submission_outcomes', to='programs.program')),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outcomes', to='submissions.submission')),
            ],
            options={
                'ordering': ('-decided_at', '-created_at'),
                'constraints': [models.UniqueConstraint(condition=models.Q(('is_current', True)), fields=('submission',), name='uq_current_submission_outcome')],
            },
        ),
    ]
