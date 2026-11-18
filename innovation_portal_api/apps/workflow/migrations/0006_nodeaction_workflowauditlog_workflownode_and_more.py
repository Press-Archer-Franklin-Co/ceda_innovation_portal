
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def backfill_workflow_definition_lifecycle(apps, schema_editor):
    WorkflowDefinition = apps.get_model('workflow', 'WorkflowDefinition')
    for definition in WorkflowDefinition.objects.order_by('program_id', '-version', '-created_at'):
        definition.code = definition.code or f"workflow-{definition.version}"
        if definition.is_active:
            definition.status = 'active'
        else:
            definition.status = 'inactive' if definition.version > 1 else 'draft'
        definition.is_current = False
        definition.save(update_fields=['code', 'status', 'is_current'])
    for program_id in WorkflowDefinition.objects.values_list('program_id', flat=True).distinct():
        current = WorkflowDefinition.objects.filter(program_id=program_id).order_by('-is_active', '-version', '-created_at').first()
        if current:
            current.is_current = True
            current.save(update_fields=['is_current'])


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0003_program_closes_at_program_evaluation_closes_at_and_more'),
        ('workflow', '0005_workflowstep_execution_mode_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='NodeAction',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key', models.CharField(max_length=80)),
                ('label', models.CharField(max_length=120)),
                ('requires_comment', models.BooleanField(default=False)),
                ('requires_attachment', models.BooleanField(default=False)),
                ('is_terminal_action', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'ordering': ('created_at', 'label'),
            },
        ),
        migrations.CreateModel(
            name='WorkflowAuditLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action', models.CharField(choices=[('definition_created', 'Definition Created'), ('definition_updated', 'Definition Updated'), ('node_added', 'Node Added'), ('node_updated', 'Node Updated'), ('node_deleted', 'Node Deleted'), ('transition_added', 'Transition Added'), ('transition_updated', 'Transition Updated'), ('transition_deleted', 'Transition Deleted'), ('node_action_changed', 'Node Action Changed'), ('form_binding_changed', 'Form Binding Changed'), ('assignment_binding_changed', 'Assignment Binding Changed'), ('published', 'Published'), ('activated', 'Activated'), ('archived', 'Archived'), ('cloned', 'Cloned'), ('validated', 'Validated')], max_length=50)),
                ('comment', models.TextField(blank=True)),
                ('metadata', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WorkflowNode',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('code', models.CharField(max_length=80)),
                ('node_type', models.CharField(choices=[('start', 'Start'), ('user_task', 'User Task'), ('review_task', 'Review Task'), ('approval_task', 'Approval Task'), ('system_task', 'System Task'), ('decision', 'Decision'), ('wait', 'Wait'), ('notification', 'Notification'), ('end', 'End')], max_length=30)),
                ('description', models.TextField(blank=True)),
                ('position_x', models.IntegerField(default=0)),
                ('position_y', models.IntegerField(default=0)),
                ('is_initial', models.BooleanField(default=False)),
                ('is_terminal', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'ordering': ('created_at', 'name'),
            },
        ),
        migrations.CreateModel(
            name='WorkflowTransition',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action_key', models.CharField(blank=True, max_length=80)),
                ('condition_expression', models.JSONField(blank=True, default=dict)),
                ('condition_language', models.CharField(default='json_logic', max_length=40)),
                ('priority', models.PositiveIntegerField(default=1)),
                ('label', models.CharField(blank=True, max_length=255)),
                ('is_default', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ('priority', 'created_at'),
            },
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='code',
            field=models.SlugField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_definitions_created', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='description',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='is_current',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='metadata_json',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='published_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='scope',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='status',
            field=models.CharField(choices=[('draft', 'Draft'), ('published', 'Published'), ('active', 'Active'), ('inactive', 'Inactive'), ('archived', 'Archived')], db_index=True, default='draft', max_length=20),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='updated_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_definitions_updated', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='workflowdefinition',
            name='workflow_type',
            field=models.CharField(blank=True, max_length=80),
        ),
        migrations.RunPython(backfill_workflow_definition_lifecycle, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name='workflowdefinition',
            constraint=models.UniqueConstraint(condition=models.Q(('is_current', True)), fields=('program',), name='uq_workflow_definition_current_per_program'),
        ),
        migrations.AddField(
            model_name='workflowauditlog',
            name='performed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_definition_audits', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='workflowauditlog',
            name='workflow_definition',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='audit_logs', to='workflow.workflowdefinition'),
        ),
        migrations.AddField(
            model_name='workflownode',
            name='workflow_definition',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='nodes', to='workflow.workflowdefinition'),
        ),
        migrations.AddField(
            model_name='workflowauditlog',
            name='node',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='workflow.workflownode'),
        ),
        migrations.AddField(
            model_name='nodeaction',
            name='node',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='actions', to='workflow.workflownode'),
        ),
        migrations.AddField(
            model_name='workflowtransition',
            name='from_node',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='outgoing_transitions', to='workflow.workflownode'),
        ),
        migrations.AddField(
            model_name='workflowtransition',
            name='to_node',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='incoming_transitions', to='workflow.workflownode'),
        ),
        migrations.AddField(
            model_name='workflowtransition',
            name='workflow_definition',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transitions', to='workflow.workflowdefinition'),
        ),
        migrations.AddField(
            model_name='workflowauditlog',
            name='transition',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='audit_logs', to='workflow.workflowtransition'),
        ),
        migrations.AddConstraint(
            model_name='workflownode',
            constraint=models.UniqueConstraint(fields=('workflow_definition', 'code'), name='uq_workflow_node_code_per_definition'),
        ),
        migrations.AddConstraint(
            model_name='workflownode',
            constraint=models.UniqueConstraint(condition=models.Q(('is_initial', True)), fields=('workflow_definition',), name='uq_workflow_initial_node_per_definition'),
        ),
        migrations.AddConstraint(
            model_name='nodeaction',
            constraint=models.UniqueConstraint(fields=('node', 'key'), name='uq_node_action_key_per_node'),
        ),
        migrations.AddConstraint(
            model_name='workflowtransition',
            constraint=models.UniqueConstraint(fields=('workflow_definition', 'from_node', 'action_key', 'priority'), name='uq_workflow_transition_priority_per_action'),
        ),
    ]
