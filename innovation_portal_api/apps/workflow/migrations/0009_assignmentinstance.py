
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0008_workflowformdefinition_workflowformfield_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AssignmentInstance',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assignee_type', models.CharField(choices=[('user', 'User'), ('role', 'Role'), ('group', 'Group'), ('department', 'Department')], default='user', max_length=20)),
                ('assignee_id', models.CharField(max_length=120)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='pending', max_length=20)),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('assignee_user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='graph_assignment_instances', to=settings.AUTH_USER_MODEL)),
                ('node_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignment_instances', to='workflow.nodeinstance')),
            ],
            options={
                'ordering': ('assigned_at', 'created_at'),
                'constraints': [models.UniqueConstraint(fields=('node_instance', 'assignee_type', 'assignee_id'), name='uq_assignment_instance_per_assignee')],
            },
        ),
    ]
