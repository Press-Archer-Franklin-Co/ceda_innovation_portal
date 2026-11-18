from django.core.management.base import BaseCommand

from apps.submissions.services import ApplicantFeedbackSnapshotService
from apps.workflow.models import WorkflowActionLog
from apps.workflow.services import WorkflowRuntimeService


class Command(BaseCommand):
    help = "Backfill applicant-safe feedback snapshots from completed workflow action logs."

    def add_arguments(self, parser):
        parser.add_argument("--submission", dest="reference_number", help="Optional submission reference number to backfill.")
        parser.add_argument("--dry-run", action="store_true", help="Show what would be backfilled without creating snapshots.")

    def handle(self, *args, **options):
        reference_number = options.get("reference_number")
        dry_run = options["dry_run"]
        release_actions = [
            WorkflowActionLog.ACTION_APPROVE,
            WorkflowActionLog.ACTION_RETURN,
            WorkflowActionLog.ACTION_REJECT,
            WorkflowRuntimeService.ACTION_SCREEN_OUT,
        ]
        logs = (
            WorkflowActionLog.objects
            .filter(action__in=release_actions, comment__gt="")
            .select_related(
                "workflow_instance",
                "workflow_instance__submission",
                "step",
                "performed_by",
            )
            .order_by("timestamp")
        )
        if reference_number:
            logs = logs.filter(workflow_instance__submission__reference_number=reference_number)

        created = 0
        skipped = 0
        for log in logs:
            submission = log.workflow_instance.submission
            if hasattr(log, "feedback_snapshot"):
                skipped += 1
                continue
            if dry_run:
                self.stdout.write(f"Would snapshot {submission.reference_number} {log.step.name if log.step_id else ''} {log.action}")
                created += 1
                continue
            snapshot = ApplicantFeedbackSnapshotService.capture_release(
                submission=submission,
                workflow_instance=log.workflow_instance,
                release_step=log.step,
                action=log.action,
                actor=log.performed_by,
                comment=log.comment,
                source_action_log=log,
            )
            if snapshot:
                created += 1
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(f"Backfill complete. Created {created}; skipped {skipped}."))
