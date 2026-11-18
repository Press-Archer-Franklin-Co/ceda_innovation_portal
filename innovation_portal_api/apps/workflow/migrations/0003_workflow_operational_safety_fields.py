
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workflow", "0002_workflow_definition_versioning_and_step_requirements"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="workflowstep",
            name="due_in_hours",
            field=models.PositiveIntegerField(default=72),
        ),
        migrations.AddField(
            model_name="workflowinstance",
            name="due_at",
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name="workflowinstance",
            name="pause_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="workflowinstance",
            name="paused_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="workflowinstance",
            name="paused_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="paused_workflows", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name="workflowinstance",
            name="status",
            field=models.CharField(choices=[("in_progress", "In Progress"), ("paused", "Paused"), ("completed", "Completed"), ("rejected", "Rejected"), ("returned", "Returned"), ("cancelled", "Cancelled")], default="in_progress", max_length=20),
        ),
    ]
