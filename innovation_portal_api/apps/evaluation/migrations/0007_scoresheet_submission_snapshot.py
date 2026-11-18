from django.db import migrations, models


def build_snapshot(submission):
    innovator = getattr(submission, "innovator", None)
    program = getattr(submission, "program", None)
    responses = []
    for response in submission.responses.all():
        responses.append({
            "id": str(response.id),
            "form_field": str(response.form_field_id) if response.form_field_id else None,
            "field_key": response.field_key_snapshot,
            "field_label": response.field_label_snapshot,
            "field_type": response.field_type_snapshot,
            "form_version_snapshot": response.form_version_snapshot,
            "value": response.value,
        })
    return {
        "_snapshot_source": "current_backfill",
        "id": str(submission.id),
        "reference_number": submission.reference_number,
        "title": submission.title,
        "current_status": submission.current_status,
        "submitted_at": submission.submitted_at.isoformat() if submission.submitted_at else None,
        "submission_type": submission.submission_type,
        "form_version_number": submission.form_version_number,
        "latest_version_number": submission.latest_version_number,
        "program": {
            "id": str(program.id) if program else None,
            "title": getattr(program, "title", ""),
        },
        "applicant": {
            "id": str(innovator.id) if innovator else None,
            "name": getattr(innovator, "full_name", ""),
            "email": getattr(innovator, "email", ""),
        },
        "responses": responses,
    }


def backfill_snapshots(apps, schema_editor):
    ScoreSheet = apps.get_model("evaluation", "ScoreSheet")
    for score_sheet in (
        ScoreSheet.objects
        .filter(submission_snapshot={})
        .select_related("submission__innovator", "submission__program")
        .prefetch_related("submission__responses")
    ):
        score_sheet.submission_snapshot = build_snapshot(score_sheet.submission)
        score_sheet.save(update_fields=["submission_snapshot"])


class Migration(migrations.Migration):

    dependencies = [
        ("evaluation", "0006_criterion_score_snapshots"),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql=(
                        "ALTER TABLE evaluation_scoresheet "
                        "ADD COLUMN IF NOT EXISTS submission_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb"
                    ),
                    reverse_sql=(
                        "ALTER TABLE evaluation_scoresheet "
                        "DROP COLUMN IF EXISTS submission_snapshot"
                    ),
                ),
            ],
            state_operations=[
                migrations.AddField(
                    model_name="scoresheet",
                    name="submission_snapshot",
                    field=models.JSONField(blank=True, default=dict),
                ),
            ],
        ),
        migrations.RunPython(backfill_snapshots, migrations.RunPython.noop),
    ]
