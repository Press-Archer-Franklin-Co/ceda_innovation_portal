import django.db.models.deletion
from django.db import migrations, models


def populate_response_snapshots(apps, schema_editor):
    Submission = apps.get_model("submissions", "Submission")
    SubmissionResponse = apps.get_model("submissions", "SubmissionResponse")
    for submission in Submission.objects.select_related("program__submission_form").all():
        form = getattr(submission.program, "submission_form", None)
        version = getattr(form, "version", 1) or 1
        if not submission.form_version_number:
            submission.form_version_number = version
            submission.save(update_fields=["form_version_number"])
    for response in SubmissionResponse.objects.select_related("form_field", "submission").all():
        field = response.form_field
        if field:
            response.field_key_snapshot = response.field_key_snapshot or field.key
            response.field_label_snapshot = response.field_label_snapshot or field.label
            response.field_type_snapshot = response.field_type_snapshot or field.field_type
            response.form_version_snapshot = response.form_version_snapshot or response.submission.form_version_number or 1
            response.save(
                update_fields=[
                    "field_key_snapshot",
                    "field_label_snapshot",
                    "field_type_snapshot",
                    "form_version_snapshot",
                ]
            )


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0003_program_closes_at_program_evaluation_closes_at_and_more"),
        ("submissions", "0003_submissionoutcome"),
    ]

    operations = [
        migrations.AddField(
            model_name="submission",
            name="form_version_number",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AlterField(
            model_name="submissionresponse",
            name="form_field",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="responses", to="programs.submissionformfield"),
        ),
        migrations.AddField(
            model_name="submissionresponse",
            name="field_key_snapshot",
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name="submissionresponse",
            name="field_label_snapshot",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="submissionresponse",
            name="field_type_snapshot",
            field=models.CharField(blank=True, max_length=30),
        ),
        migrations.AddField(
            model_name="submissionresponse",
            name="form_version_snapshot",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.RunPython(populate_response_snapshots, migrations.RunPython.noop),
    ]
