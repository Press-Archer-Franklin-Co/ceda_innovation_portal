
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0003_assignment_completed_at'),
        ('evaluation', '0002_scoresheet_is_final_scoresheet_overall_comment'),
        ('workflow', '0003_workflow_operational_safety_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowstep',
            name='evaluation_round',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_steps', to='evaluation.evaluationround'),
        ),
        migrations.AlterField(
            model_name='workflowstep',
            name='submission_status',
            field=models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('screening', 'Screening'), ('judging_review', 'Judging Review'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('returned', 'Returned'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], max_length=40),
        ),
        migrations.CreateModel(
            name='TaskExecution',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('claimed', 'Claimed'), ('completed', 'Completed'), ('rejected', 'Rejected'), ('returned', 'Returned'), ('reassigned', 'Reassigned'), ('cancelled', 'Cancelled')], db_index=True, default='pending', max_length=20)),
                ('due_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('started_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('outcome', models.CharField(blank=True, choices=[('approve', 'Approve'), ('reject', 'Reject'), ('return', 'Return'), ('resubmit', 'Resubmit'), ('assign', 'Assign'), ('reassign', 'Reassign'), ('unassign', 'Unassign'), ('submit', 'Submit')], max_length=20)),
                ('comment', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('assignee', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_tasks', to=settings.AUTH_USER_MODEL)),
                ('assignment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='tasks', to='assignments.assignment')),
                ('workflow_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='workflow.workflowinstance')),
                ('workflow_step', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tasks', to='workflow.workflowstep')),
            ],
            options={
                'ordering': ('workflow_step__order', 'created_at'),
            },
        ),
    ]
