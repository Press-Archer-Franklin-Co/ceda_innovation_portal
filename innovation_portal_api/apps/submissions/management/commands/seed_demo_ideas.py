"""Demo only: give one account many sent ideas, so My ideas (2.2) can be shown paging and searching.

    python manage.py seed_demo_ideas --email demo.innovator@ceda.co.bw --count 60
    python manage.py seed_demo_ideas --email demo.innovator@ceda.co.bw --clear

Safe to run again: it only ever adds, or removes, that account's rows with a CEDA-IP-DEMO- reference.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.constants import SubmissionStatus, SubmissionType
from apps.programs.general_idea import GeneralIdeaProgram
from apps.submissions.models import Submission
from apps.workflow.models import WorkflowInstance
from apps.workflow.services import WorkflowDefinitionService

PREFIX = "CEDA-IP-DEMO-"
WHAT = ("Solar-dried mopane snacks", "Shared tractor hire", "Mobile tuck shop orders", "Cold room for dairy farmers", "Basket weaving co-op", "Recycled glass pavers", "Village homestay booking", "Drip irrigation kits", "School uniform sewing group", "Water tank leak alerts")
WHERE = ("Gaborone", "Francistown", "Maun", "Kasane", "Serowe", "Molepolole")
# Every sixth idea is approved, every sixth not taken forward, the rest are in review at a real stage. No "returned"
# here: a real return comes from an officer on 3.16, with its reason and items.
FINISHED = {4: SubmissionStatus.APPROVED, 5: SubmissionStatus.REJECTED}


class Command(BaseCommand):
    help = "Demo only: add sent ideas to one account (references start with CEDA-IP-DEMO-)."

    def add_arguments(self, parser):
        parser.add_argument("--email", required=True)
        parser.add_argument("--count", type=int, default=60)
        parser.add_argument("--clear", action="store_true", help="Remove this account's demo ideas instead.")

    @transaction.atomic
    def handle(self, *args, email, count, clear, **options):
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No account with the email {email}.")
        mine = Submission.objects.filter(innovator=user, reference_number__startswith=PREFIX)
        if clear:
            removed = mine.count()
            mine.delete()
            self.stdout.write(f"Removed {removed} demo ideas.")
            return
        if not 1 <= count <= 1000:
            raise CommandError("Use a count from 1 to 1000.")
        program = GeneralIdeaProgram.get()
        if program is None:
            raise CommandError("There is no challenge or general ideas programme yet.")
        definition = WorkflowDefinitionService.ensure_active_definition(program)
        steps = list(definition.steps.filter(is_active=True).order_by("order"))
        if not steps:
            raise CommandError("That programme's workflow has no stages.")
        have = set(mine.values_list("reference_number", flat=True))
        now = timezone.now()
        rows, instances = [], []
        for n in range(1, count + 1):
            reference = f"{PREFIX}{n:04d}"
            if reference in have:
                continue
            finished = FINISHED.get(n % 6)
            # In-review ideas stop before the last stage, so the stage bar shows real progress.
            step = steps[-1] if finished else steps[n % max(1, len(steps) - 1)]
            row = Submission(
                program=program, innovator=user, submission_type=SubmissionType.IDEA, reference_number=reference,
                title=f"{WHAT[n % len(WHAT)]} in {WHERE[n % len(WHERE)]} ({n})",
                current_status=finished or step.submission_status or SubmissionStatus.SUBMITTED, submitted_at=now - timedelta(days=n),
            )
            rows.append(row)
            # No tasks: these ideas show the innovator's list and must not fill an officer's work queue.
            instances.append(WorkflowInstance(
                submission=row, workflow_definition=definition, current_step=step, entity_type="submission", entity_id=str(row.id),
                status={SubmissionStatus.APPROVED: WorkflowInstance.STATUS_COMPLETED, SubmissionStatus.REJECTED: WorkflowInstance.STATUS_REJECTED}.get(finished, WorkflowInstance.STATUS_IN_PROGRESS),
                started_at=row.submitted_at, completed_at=row.submitted_at + timedelta(hours=1) if finished else None,
            ))
        Submission.objects.bulk_create(rows)
        WorkflowInstance.objects.bulk_create(instances)
        for row in rows:
            Submission.objects.filter(pk=row.pk).update(updated_at=row.submitted_at)
        self.stdout.write(f"Added {len(rows)} demo ideas; {mine.count()} in all.")
