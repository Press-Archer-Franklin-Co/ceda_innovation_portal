
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workflow", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="workflowdefinition",
            name="previous_version",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="next_versions", to="workflow.workflowdefinition"),
        ),
        migrations.AddField(
            model_name="workflowdefinition",
            name="version",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name="workflowdefinition",
            name="is_active",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="workflowstep",
            name="requires_assignment",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="workflowstep",
            name="requires_evaluation",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterModelOptions(
            name="workflowdefinition",
            options={"ordering": ("program", "-version", "-created_at")},
        ),
        migrations.AlterUniqueTogether(
            name="workflowstep",
            unique_together=set(),
        ),
        migrations.AddConstraint(
            model_name="workflowdefinition",
            constraint=models.UniqueConstraint(fields=("program", "version"), name="uq_workflow_definition_program_version"),
        ),
        migrations.AddConstraint(
            model_name="workflowstep",
            constraint=models.UniqueConstraint(fields=("workflow_definition", "code"), name="uq_workflow_step_code_per_definition"),
        ),
        migrations.AddConstraint(
            model_name="workflowstep",
            constraint=models.UniqueConstraint(fields=("workflow_definition", "order"), name="uq_workflow_step_order_per_definition"),
        ),
    ]
