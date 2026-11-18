import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("evaluation", "0007_scoresheet_submission_snapshot"),
        ("submissions", "0004_submission_response_snapshots"),
        ("workflow", "0014_workflowstep_order_constraint_deferrable"),
    ]

    operations = [
        migrations.CreateModel(
            name="SubmissionFeedbackSnapshot",
            fields=[
                ("id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("created_at", models.DateTimeField(auto_now_add=True, db_index=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("stage_code", models.CharField(db_index=True, max_length=100)),
                ("stage_name", models.CharField(max_length=255)),
                ("release_action", models.CharField(db_index=True, max_length=40)),
                ("released_at", models.DateTimeField(db_index=True)),
                ("payload_json", models.JSONField(blank=True, default=dict)),
                ("schema_version", models.PositiveIntegerField(default=1)),
                ("source_action_log", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="feedback_snapshot", to="workflow.workflowactionlog")),
                ("source_review_cycle", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="feedback_snapshots", to="evaluation.reviewcycle")),
                ("submission", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="feedback_snapshots", to="submissions.submission")),
                ("workflow_instance", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="feedback_snapshots", to="workflow.workflowinstance")),
            ],
            options={
                "ordering": ("released_at", "created_at"),
                "indexes": [
                    models.Index(fields=["submission", "stage_code", "released_at"], name="submission__stage__5c8de5_idx"),
                    models.Index(fields=["submission", "release_action"], name="submission__release_35df56_idx"),
                ],
            },
        ),
    ]
