
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
            name='WorkflowDefinition',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('is_active', models.BooleanField(default=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workflow_definitions', to='programs.program')),
            ],
        ),
        migrations.CreateModel(
            name='WorkflowStep',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('code', models.CharField(max_length=80)),
                ('order', models.PositiveIntegerField()),
                ('role_required', models.CharField(choices=[('innovator', 'Innovator'), ('innovation_officer', 'Innovation Officer'), ('judge', 'Judge'), ('mentor', 'Mentor'), ('administrator', 'Administrator'), ('management_viewer', 'Management Viewer')], max_length=50)),
                ('actions_allowed', models.JSONField(blank=True, default=list)),
                ('submission_status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('under_review', 'Under Review'), ('requires_more_information', 'Requires More Information'), ('screened_out', 'Screened Out'), ('shortlisted', 'Shortlisted'), ('assigned_to_judges', 'Assigned To Judges'), ('under_judging', 'Under Judging'), ('approved', 'Approved'), ('rejected', 'Rejected'), ('selected_for_hackathon', 'Selected For Hackathon'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('closed', 'Closed')], max_length=40)),
                ('assignment_role', models.CharField(blank=True, choices=[('judge', 'Judge'), ('mentor', 'Mentor'), ('reviewer', 'Reviewer')], max_length=20)),
                ('minimum_assignments', models.PositiveIntegerField(default=0)),
                ('minimum_evaluations', models.PositiveIntegerField(default=0)),
                ('is_active', models.BooleanField(default=True)),
                ('workflow_definition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='steps', to='workflow.workflowdefinition')),
            ],
            options={
                'ordering': ('order',),
            },
        ),
        migrations.CreateModel(
            name='WorkflowInstance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(choices=[('in_progress', 'In Progress'), ('completed', 'Completed'), ('rejected', 'Rejected'), ('returned', 'Returned')], default='in_progress', max_length=20)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('submission', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='workflow_instance', to='submissions.submission')),
                ('workflow_definition', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='instances', to='workflow.workflowdefinition')),
                ('current_step', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='instances', to='workflow.workflowstep')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WorkflowActionLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('action', models.CharField(choices=[('approve', 'Approve'), ('reject', 'Reject'), ('return', 'Return'), ('resubmit', 'Resubmit'), ('assign', 'Assign'), ('reassign', 'Reassign'), ('unassign', 'Unassign'), ('submit', 'Submit')], max_length=20)),
                ('comment', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('timestamp', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('performed_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_actions', to=settings.AUTH_USER_MODEL)),
                ('workflow_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='action_logs', to='workflow.workflowinstance')),
                ('step', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='action_logs', to='workflow.workflowstep')),
            ],
            options={
                'ordering': ('timestamp',),
            },
        ),
        migrations.AddConstraint(
            model_name='workflowdefinition',
            constraint=models.UniqueConstraint(condition=models.Q(('is_active', True)), fields=('program',), name='uq_active_workflow_per_program'),
        ),
        migrations.AlterUniqueTogether(
            name='workflowstep',
            unique_together={('workflow_definition', 'code')},
        ),
    ]
