
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0009_assignmentinstance'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='assignmentinstance',
            name='cancelled_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='assignmentinstance',
            name='completed_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='completed_graph_assignment_instances', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='assignmentinstance',
            name='declined_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AlterField(
            model_name='assignmentinstance',
            name='status',
            field=models.CharField(choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('declined', 'Declined')], default='pending', max_length=20),
        ),
        migrations.CreateModel(
            name='AssignmentInstanceActionLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action', models.CharField(choices=[('accepted', 'Accepted'), ('completed', 'Completed'), ('cancelled', 'Cancelled'), ('reassigned', 'Reassigned'), ('declined', 'Declined')], max_length=30)),
                ('previous_status', models.CharField(blank=True, max_length=20)),
                ('new_status', models.CharField(blank=True, max_length=20)),
                ('note', models.TextField(blank=True)),
                ('metadata_json', models.JSONField(blank=True, default=dict)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='graph_assignment_action_logs', to=settings.AUTH_USER_MODEL)),
                ('assignment_instance', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='action_logs', to='workflow.assignmentinstance')),
            ],
            options={
                'ordering': ('created_at',),
            },
        ),
    ]
