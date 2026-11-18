
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0006_nodeaction_workflowauditlog_workflownode_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='workflowdefinition',
            name='is_current',
            field=models.BooleanField(default=True),
        ),
        migrations.CreateModel(
            name='AssignmentPolicy',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('code', models.SlugField(max_length=120, unique=True)),
                ('policy_type', models.CharField(choices=[('specific_user', 'Specific User'), ('role_based', 'Role Based'), ('group_based', 'Group Based'), ('department_based', 'Department Based'), ('round_robin', 'Round Robin'), ('least_loaded', 'Least Loaded'), ('submitter_manager', 'Submitter Manager'), ('dynamic_query', 'Dynamic Query')], max_length=40)),
                ('config_json', models.JSONField(blank=True, default=dict)),
                ('sla_hours', models.PositiveIntegerField(default=72)),
                ('escalation_policy', models.JSONField(blank=True, default=dict)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignment_policies_created', to=settings.AUTH_USER_MODEL)),
                ('fallback_policy', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='fallback_for', to='workflow.assignmentpolicy')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignment_policies_updated', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('name',),
            },
        ),
        migrations.CreateModel(
            name='NodeAssignmentBinding',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('minimum_assignees', models.PositiveIntegerField(default=1)),
                ('maximum_assignees', models.PositiveIntegerField(default=1)),
                ('execution_mode', models.CharField(choices=[('sequential', 'Sequential'), ('parallel_all', 'Parallel All'), ('parallel_any', 'Parallel Any'), ('parallel_minimum', 'Parallel Minimum')], default='sequential', max_length=30)),
                ('minimum_completions_required', models.PositiveIntegerField(default=1)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('assignment_policy', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='node_bindings', to='workflow.assignmentpolicy')),
                ('node', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='assignment_binding', to='workflow.workflownode')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WorkflowRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('scope_type', models.CharField(choices=[('workflow', 'Workflow'), ('node', 'Node'), ('transition', 'Transition')], max_length=20)),
                ('rule_type', models.CharField(choices=[('entry_condition', 'Entry Condition'), ('exit_condition', 'Exit Condition'), ('transition_condition', 'Transition Condition'), ('visibility_condition', 'Visibility Condition'), ('assignment_override', 'Assignment Override'), ('notification_trigger', 'Notification Trigger'), ('sla_trigger', 'SLA Trigger')], max_length=40)),
                ('expression_language', models.CharField(default='json_logic', max_length=40)),
                ('expression', models.JSONField(blank=True, default=dict)),
                ('priority', models.PositiveIntegerField(default=1)),
                ('enabled', models.BooleanField(default=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('node', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='rules', to='workflow.workflownode')),
                ('transition', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='rules', to='workflow.workflowtransition')),
                ('workflow_definition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rules', to='workflow.workflowdefinition')),
            ],
            options={
                'ordering': ('scope_type', 'priority', 'created_at'),
            },
        ),
    ]
