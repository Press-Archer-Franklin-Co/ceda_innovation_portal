"""Demo only: give one account many sent ideas, so My ideas (2.2) can be shown paging and searching.

    python manage.py seed_demo_ideas --email demo.innovator@ceda.co.bw --count 60
    python manage.py seed_demo_ideas --email demo.innovator@ceda.co.bw --clear
    python manage.py seed_demo_ideas --email demo.innovator@ceda.co.bw --count 0 --states

--states (23 Nov, demo only, never by default) adds one idea in each state the signed-in home (2.1) talks about: a
draft, changes requested, an open question, shortlisted and one that moved on this week. The officer named on the
return and the question is the seeded officer account when it exists. Their references start with CEDA-IP-DEMO-S.

Safe to run again: it only ever adds, or removes, that account's rows with a CEDA-IP-DEMO- reference.
"""
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone

from apps.core.constants import SubmissionStatus, SubmissionType
from apps.programs.general_idea import GeneralIdeaProgram
from apps.submissions.models import ApplicationDraft, ReturnRequest, Submission, SubmissionStatusHistory
from apps.workflow.models import WorkflowInstance
from apps.workflow.services import WorkflowDefinitionService

PREFIX = "CEDA-IP-DEMO-"
STATE_PREFIX = f"{PREFIX}S"
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
        parser.add_argument("--states", action="store_true", help="Also add one idea in each home state (demo only).")

    @transaction.atomic
    def handle(self, *args, email, count, clear, states=False, **options):
        user = get_user_model().objects.filter(email__iexact=email).first()
        if user is None:
            raise CommandError(f"No account with the email {email}.")
        mine = Submission.objects.filter(innovator=user, reference_number__startswith=PREFIX)
        if clear:
            removed = mine.count()
            mine.delete()
            ApplicationDraft.objects.filter(innovator=user, reference_number__startswith=STATE_PREFIX).delete()
            self.stdout.write(f"Removed {removed} demo ideas.")
            return
        if states:
            self._states(user)
        if count == 0 and states:
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

    def _states(self, user):
        from apps.communications.models import Message, MessageThread

        program = GeneralIdeaProgram.get()
        if program is None:
            raise CommandError("There is no challenge or general ideas programme yet.")
        definition = WorkflowDefinitionService.ensure_active_definition(program)
        step = definition.steps.filter(is_active=True).order_by("order").first()
        officer = get_user_model().objects.filter(email__iexact="innovation.officer@ceda.co.bw").first()
        now = timezone.now()
        added = 0
        if not ApplicationDraft.objects.filter(innovator=user, reference_number=f"{STATE_PREFIX}1").exists():
            ApplicationDraft.objects.create(
                reference_number=f"{STATE_PREFIX}1", program=program, innovator=user, submission_type=SubmissionType.IDEA,
                title="Hair salon booking by WhatsApp", is_general_idea=True, progress_metadata={"percent_complete": 60},
            )
            added += 1

        def idea(n, title, status, instance_status=WorkflowInstance.STATUS_IN_PROGRESS):
            reference = f"{STATE_PREFIX}{n}"
            existing = Submission.objects.filter(innovator=user, reference_number=reference).first()
            if existing:
                return existing, False
            sub = Submission.objects.create(
                program=program, innovator=user, submission_type=SubmissionType.IDEA, reference_number=reference,
                title=title, current_status=status, submitted_at=now - timedelta(days=5),
            )
            WorkflowInstance.objects.create(
                submission=sub, workflow_definition=definition, current_step=step, entity_type="submission", entity_id=str(sub.id),
                status=instance_status, started_at=sub.submitted_at, due_at=now + timedelta(days=5),
            )
            return sub, True

        sub, new = idea(2, "Solar-dried mopane snacks for retail", SubmissionStatus.RETURNED, WorkflowInstance.STATUS_RETURNED)
        if new:
            ReturnRequest.objects.create(
                submission=sub, step_name=step.name if step else "", step_code=step.code if step else "", requested_by=officer,
                reason="Your idea is strong, but we need to see real costs. Please add your supplier quote and send it back.",
                fix_by=timezone.localdate() + timedelta(days=5),
            )
            added += 1
        sub, new = idea(3, "Cold room for dairy farmers", SubmissionStatus.UNDER_REVIEW)
        if new:
            thread = MessageThread.objects.create(submission=sub)
            question = Message.objects.create(
                thread=thread, author=officer, author_role=Message.AuthorRole.OFFICER,
                body="Who supplies your packaging, and what does it cost per pack?", reply_by=timezone.localdate() + timedelta(days=3),
            )
            thread.open_question = question
            thread.save(update_fields=["open_question"])
            added += 1
        sub, new = idea(4, "Shared tractor hire for Kweneng farmers", SubmissionStatus.SHORTLISTED)
        if new:
            SubmissionStatusHistory.objects.create(submission=sub, from_status=SubmissionStatus.UNDER_REVIEW, to_status=SubmissionStatus.SHORTLISTED, changed_by=officer)
            added += 1
        sub, new = idea(5, "Recycled glass pavers", SubmissionStatus.UNDER_REVIEW)
        if new:
            SubmissionStatusHistory.objects.create(submission=sub, from_status=SubmissionStatus.SCREENING, to_status=SubmissionStatus.UNDER_REVIEW, changed_by=officer)
            added += 1
        self.stdout.write(f"Added {added} ideas, one in each home state.")
