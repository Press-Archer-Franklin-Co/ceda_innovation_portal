
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


def backfill_graph_runtime_fields(apps, schema_editor):
    WorkflowInstance = apps.get_model('workflow', 'WorkflowInstance')
    for instance in WorkflowInstance.objects.select_related('workflow_definition', 'submission').all():
        instance.workflow_definition_version = getattr(instance.workflow_definition, 'version', 1) or 1
        if instance.submission_id:
            instance.entity_type = instance.entity_type or 'submission'
            instance.entity_id = instance.entity_id or str(instance.submission_id)
        if not instance.started_at:
            instance.started_at = instance.created_at
        instance.save(update_fields=['workflow_definition_version', 'entity_type', 'entity_id', 'started_at'])


class Migration(migrations.Migration):

    dependencies = [
        ('submissions', '0003_submissionoutcome'),
        ('workflow', '0007_alter_workflowdefinition_is_current_assignmentpolicy_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkflowFormDefinition',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('code', models.SlugField(max_length=120, unique=True)),
                ('description', models.TextField(blank=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('published', 'Published'), ('archived', 'Archived')], default='draft', max_length=20)),
                ('version', models.PositiveIntegerField(default=1)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
            ],
            options={
                'ordering': ('name', '-version'),
            },
        ),
        migrations.CreateModel(
            name='WorkflowFormField',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('key', models.SlugField(max_length=100)),
                ('label', models.CharField(max_length=255)),
                ('field_type', models.CharField(choices=[('text', 'Text'), ('textarea', 'Textarea'), ('number', 'Number'), ('date', 'Date'), ('email', 'Email'), ('phone', 'Phone'), ('boolean', 'Boolean'), ('select', 'Select'), ('multiselect', 'Multiselect'), ('file', 'File'), ('url', 'URL')], max_length=30)),
                ('required', models.BooleanField(default=False)),
                ('default_value', models.JSONField(blank=True, default=dict)),
                ('help_text', models.TextField(blank=True)),
                ('data_source_type', models.CharField(choices=[('static', 'Static'), ('api', 'API'), ('dynamic', 'Dynamic')], default='static', max_length=20)),
                ('data_source_config', models.JSONField(blank=True, default=dict)),
                ('validation_schema', models.JSONField(blank=True, default=dict)),
                ('ui_schema', models.JSONField(blank=True, default=dict)),
                ('order', models.PositiveIntegerField(default=1)),
            ],
            options={
                'ordering': ('order', 'label'),
            },
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='current_node',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='instances', to='workflow.workflownode'),
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='entity_id',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='entity_type',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='started_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='started_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='started_workflows', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='workflowinstance',
            name='workflow_definition_version',
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name='workflowinstance',
            name='submission',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='workflow_instance', to='submissions.submission'),
        ),
        migrations.CreateModel(
            name='NodeInstance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('active', 'Active'), ('completed', 'Completed'), ('skipped', 'Skipped'), ('failed', 'Failed'), ('cancelled', 'Cancelled')], default='pending', max_length=20)),
                ('entered_at', models.DateTimeField(blank=True, null=True)),
                ('exited_at', models.DateTimeField(blank=True, null=True)),
                ('assignment_policy_snapshot_json', models.JSONField(blank=True, default=dict)),
                ('form_snapshot_json', models.JSONField(blank=True, default=dict)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('node', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='node_instances', to='workflow.workflownode')),
                ('workflow_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='node_instances', to='workflow.workflowinstance')),
            ],
            options={
                'ordering': ('created_at',),
            },
        ),
        migrations.CreateModel(
            name='TransitionExecutionLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action_key', models.CharField(blank=True, max_length=80)),
                ('condition_result', models.JSONField(blank=True, default=dict)),
                ('executed_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('from_node', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transition_logs_from', to='workflow.workflownode')),
                ('node_instance', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transition_logs', to='workflow.nodeinstance')),
                ('to_node', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='transition_logs_to', to='workflow.workflownode')),
                ('transition', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='execution_logs', to='workflow.workflowtransition')),
                ('triggered_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='workflow_transition_logs', to=settings.AUTH_USER_MODEL)),
                ('workflow_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transition_logs', to='workflow.workflowinstance')),
            ],
            options={
                'ordering': ('executed_at',),
            },
        ),
        migrations.CreateModel(
            name='WorkflowDataEnvelope',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('payload_json', models.JSONField(blank=True, default=dict)),
                ('schema_version', models.PositiveIntegerField(default=1)),
                ('workflow_instance', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='data_envelope', to='workflow.workflowinstance')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='WorkflowFormFieldRule',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('rule_type', models.CharField(choices=[('visible_if', 'Visible If'), ('required_if', 'Required If'), ('enabled_if', 'Enabled If'), ('computed_if', 'Computed If')], max_length=20)),
                ('expression', models.JSONField(blank=True, default=dict)),
                ('priority', models.PositiveIntegerField(default=1)),
                ('form_field', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='rules', to='workflow.workflowformfield')),
            ],
            options={
                'ordering': ('priority', 'created_at'),
            },
        ),
        migrations.CreateModel(
            name='WorkflowFormSection',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('code', models.SlugField(max_length=100)),
                ('order', models.PositiveIntegerField(default=1)),
                ('description', models.TextField(blank=True)),
                ('form_definition', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sections', to='workflow.workflowformdefinition')),
            ],
            options={
                'ordering': ('order', 'title'),
            },
        ),
        migrations.AddField(
            model_name='workflowformfield',
            name='form_section',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fields', to='workflow.workflowformsection'),
        ),
        migrations.CreateModel(
            name='NodeFormBinding',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('binding_type', models.CharField(choices=[('entry', 'Entry'), ('review', 'Review'), ('decision', 'Decision'), ('feedback', 'Feedback')], default='entry', max_length=20)),
                ('mode', models.CharField(choices=[('read_only', 'Read Only'), ('editable', 'Editable'), ('partial_edit', 'Partial Edit')], default='editable', max_length=20)),
                ('required_on_entry', models.BooleanField(default=False)),
                ('required_on_exit', models.BooleanField(default=False)),
                ('is_active', models.BooleanField(default=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('node', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='form_bindings', to='workflow.workflownode')),
                ('form_definition', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='node_bindings', to='workflow.workflowformdefinition')),
            ],
            options={
                'ordering': ('created_at',),
                'constraints': [models.UniqueConstraint(fields=('node', 'form_definition', 'binding_type'), name='uq_node_form_binding_type')],
            },
        ),
        migrations.AddConstraint(
            model_name='workflowformsection',
            constraint=models.UniqueConstraint(fields=('form_definition', 'code'), name='uq_workflow_form_section_code'),
        ),
        migrations.AddConstraint(
            model_name='workflowformfield',
            constraint=models.UniqueConstraint(fields=('form_section', 'key'), name='uq_workflow_form_field_key'),
        ),
        migrations.RunPython(backfill_graph_runtime_fields, migrations.RunPython.noop),
    ]
