from django.db import migrations


def require_evaluation(apps, schema_editor):
    WorkflowStep = apps.get_model("workflow", "WorkflowStep")
    WorkflowStep.objects.filter(code="challenge_judging").update(requires_evaluation=True)


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0009_challenge_judges"),
        ("workflow", "0014_workflowstep_order_constraint_deferrable"),
    ]

    operations = [
        migrations.RunPython(require_evaluation, migrations.RunPython.noop),
    ]
