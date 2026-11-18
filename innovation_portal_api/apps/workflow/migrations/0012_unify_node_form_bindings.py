import django.db.models.deletion
from django.db import migrations, models


def forward_copy_program_forms(apps, schema_editor):
    NodeFormBinding = apps.get_model("workflow", "NodeFormBinding")
    SubmissionForm = apps.get_model("programs", "SubmissionForm")
    for binding in NodeFormBinding.objects.select_related("node__workflow_definition__program").all():
        program = getattr(binding.node.workflow_definition, "program", None)
        if not program:
            continue
        submission_form = getattr(program, "submission_form", None)
        if submission_form is None:
            submission_form = SubmissionForm.objects.create(
                program=program,
                title=f"{program.title} Submission Form",
            )
        binding.submission_form_temp_id = submission_form.id
        binding.save(update_fields=["submission_form_temp"])


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0001_initial"),
        ("workflow", "0011_assignmentinstance_claimed_at_and_more"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="nodeformbinding",
            name="uq_node_form_binding_type",
        ),
        migrations.AddField(
            model_name="nodeformbinding",
            name="submission_form_temp",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="+",
                to="programs.submissionform",
            ),
        ),
        migrations.RunPython(forward_copy_program_forms, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name="nodeformbinding",
            name="form_definition",
        ),
        migrations.RenameField(
            model_name="nodeformbinding",
            old_name="submission_form_temp",
            new_name="form_definition",
        ),
        migrations.AlterField(
            model_name="nodeformbinding",
            name="form_definition",
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="node_bindings",
                to="programs.submissionform",
            ),
        ),
        migrations.AddConstraint(
            model_name="nodeformbinding",
            constraint=models.UniqueConstraint(
                fields=("node", "form_definition", "binding_type"),
                name="uq_node_form_binding_type",
            ),
        ),
    ]
