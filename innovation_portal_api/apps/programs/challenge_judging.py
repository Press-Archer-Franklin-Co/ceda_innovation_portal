from decimal import Decimal

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.audit.services import AuditService
from apps.core.constants import AssignmentRoleType, AssignmentStatus, ProgramStatus, ProgramTypeCode, RoleType, SubmissionStatus
from apps.programs.models import ChallengeJudge, Program

JUDGING_STEP_CODE = "challenge_judging"
REMINDER_INTERVAL = timezone.timedelta(hours=24)
FINAL_REMINDER_WINDOW = timezone.timedelta(hours=3)


class ChallengeJudgingService:
    """Judging for innovation challenges, run by the system rather than a hand-built workflow.

    Each challenge gets a one-step "Judging" workflow scored against the marking
    criteria chosen on the challenge. Judges are invited by name and email when
    entries close; following the link signs them in, assigns them every entry
    (no claiming) and lands them on their marking list. Every judge marks every
    entry in parallel, and anyone with unmarked entries is reminded daily and
    again in the final hours before marking closes. Entries stay open for marking
    until Marking Closes, so a judge added late still marks every entry; only then
    are the marks averaged and the entries settled.
    """


    @staticmethod
    def judging_step(program):
        from apps.workflow.models import WorkflowStep

        return (
            WorkflowStep.objects.filter(
                workflow_definition__program=program,
                workflow_definition__is_active=True,
                code=JUDGING_STEP_CODE,
            )
            .select_related("evaluation_config")
            .first()
        )

    @classmethod
    @transaction.atomic
    def sync_workflow(cls, program, actor=None):
        """Make sure the challenge's active workflow is the managed judging workflow,
        scored against the challenge's marking criteria by all of its judges."""
        if not program.is_innovation_challenge:
            return None
        from apps.evaluation.models import StageEvaluationConfig
        from apps.workflow.services import WorkflowDefinitionService

        step = cls.judging_step(program)
        if step is None:
            definition = WorkflowDefinitionService.create_definition(
                program=program,
                name="Challenge Judging",
                actor=actor,
                steps_data=[
                    {
                        "name": "Judging",
                        "code": JUDGING_STEP_CODE,
                        "order": 1,
                        "role_required": RoleType.JUDGE,
                        "actions_allowed": ["approve", "reject"],
                        "submission_status": SubmissionStatus.UNDER_JUDGING,
                        "requires_assignment": True,
                        "requires_evaluation": True,
                        "assignment_role": AssignmentRoleType.JUDGE,
                        "minimum_assignments": 1,
                    }
                ],
                activate=True,
            )
            step = definition.steps.get(code=JUDGING_STEP_CODE)
        if not step.requires_evaluation:
            step.requires_evaluation = True
            step.save(update_fields=["requires_evaluation", "updated_at"])

        judges = max(1, program.challenge_judges.count())
        # R-10: reviewers per idea and the pass mark are set on the programme (PUT /api/programs/{id}/judging/).
        required = min(judges, program.reviewers_per_idea) if program.reviewers_per_idea else judges
        StageEvaluationConfig.objects.update_or_create(
            workflow_step=step,
            defaults={
                "marking_criteria": program.marking_criteria,
                "required_reviewer_count": required,
                "review_mode": StageEvaluationConfig.REVIEW_MODE_FIXED_COUNT,
                "aggregation_method": StageEvaluationConfig.AGGREGATION_AVERAGE,
                "threshold_reject_below": Decimal("0"),
                "threshold_pass_above": program.pass_mark if program.pass_mark is not None else Decimal("0"),
                "allow_applicant_feedback": False,
            },
        )
        return step

    @staticmethod
    def entries_to_mark(program):
        from apps.submissions.models import Submission

        return Submission.objects.filter(
            program=program,
            workflow_instance__current_step__code=JUDGING_STEP_CODE,
            workflow_instance__status="in_progress",
        )

    @classmethod
    def outstanding_count(cls, judge: ChallengeJudge) -> int:
        """Entries this judge still has to mark."""
        entries = cls.entries_to_mark(judge.program)
        if judge.user_id:
            entries = entries.exclude(
                score_sheets__judge_id=judge.user_id,
                score_sheets__is_final=True,
            )
        return entries.distinct().count()

    @classmethod
    def progress(cls, judge: ChallengeJudge) -> dict:
        total = cls.entries_to_mark(judge.program).count()
        from apps.evaluation.models import ScoreSheet

        marked = (
            ScoreSheet.objects.filter(submission__program=judge.program, judge_id=judge.user_id, is_final=True)
            .values("submission_id").distinct().count()
            if judge.user_id else 0
        )
        return {"marked": marked, "outstanding": cls.outstanding_count(judge), "total_in_judging": total}


    @staticmethod
    def invite_url(judge: ChallengeJudge) -> str:
        base = getattr(settings, "PUBLIC_BASE_URL", "").rstrip("/")
        return f"{base}/judge-invite/{judge.token}"

    @classmethod
    def _assign_entries(cls, judge: ChallengeJudge):
        """Assign every entry in judging to the judge, already accepted, with no per-entry emails."""
        from apps.accounts.models import Role, UserRole
        from apps.assignments.models import Assignment
        from apps.assignments.services import AssignmentService

        user = judge.user
        judge_role, _ = Role.objects.get_or_create(code=RoleType.JUDGE, defaults={"name": "Judge"})
        UserRole.objects.update_or_create(user=user, role=judge_role, defaults={"is_active": True})

        assigned_by = judge.program.owner
        created = 0
        for entry in cls.entries_to_mark(judge.program).select_related("workflow_instance"):
            exists = Assignment.objects.filter(
                submission=entry,
                assignee=user,
                role_type=AssignmentRoleType.JUDGE,
            ).exclude(status__in=[AssignmentStatus.DECLINED, AssignmentStatus.REASSIGNED]).exists()
            if exists:
                continue
            assignment = AssignmentService.create_assignment(
                submission=entry,
                assignee=user,
                role_type=AssignmentRoleType.JUDGE,
                assigned_by=assigned_by,
                deadline=judge.program.marking_closes_at,
                notify=False,
            )
            AssignmentService.respond(assignment, user, accept=True, note="Assigned automatically as a challenge judge.")
            created += 1
        return created

    @classmethod
    @transaction.atomic
    def accept_invitation(cls, token, user) -> ChallengeJudge:
        judge = ChallengeJudge.objects.select_for_update().select_related("program").filter(token=token).first()
        if judge is None:
            raise ValidationError("This judging link is not valid.")
        if (user.email or "").lower() != judge.email:
            raise PermissionDenied(f"This judging invitation was sent to {judge.email}. Sign in with that email address to continue.")
        if judge.user_id is None:
            judge.user = user
            judge.accepted_at = timezone.now()
            judge.save(update_fields=["user", "accepted_at", "updated_at"])
            AuditService.log_action(actor=user, action_type="challenge_judge_accepted", target=judge.program, metadata={"judge_id": str(judge.id)})
        cls._assign_entries(judge)
        return judge


    @staticmethod
    def _deadline_text(program) -> str:
        closes = program.marking_closes_at
        return timezone.localtime(closes).strftime("%d %B %Y at %H:%M") if closes else "the marking deadline"

    @classmethod
    def _send(cls, judge: ChallengeJudge, *, subject: str, headline: str, intro: str, outstanding: int):
        from apps.communications.email_notifications import EmailNotificationService

        url = cls.invite_url(judge)
        program = judge.program
        context = EmailNotificationService._base_context(
            preheader=subject,
            headline=headline,
            intro=intro,
            action_label="Start marking",
            action_url=url,
            fallback_label="Open your marking page",
            fallback_url=url,
            summary_items=[
                {"label": "Challenge", "value": program.title},
                {"label": "Entries for you to mark", "value": str(outstanding)},
                {"label": "Marking closes", "value": cls._deadline_text(program)},
            ],
        )
        EmailNotificationService._send(
            to_email=judge.email,
            to_name=judge.name,
            subject=subject,
            template_name="notification_generic",
            context=context,
        )

    @classmethod
    def send_invitation(cls, judge: ChallengeJudge, now=None):
        program = judge.program
        outstanding = cls.outstanding_count(judge)
        cls._send(
            judge,
            subject=f"You're invited to judge: {program.title}",
            headline="Marking is now open",
            intro=(
                f"Dear {judge.name}, you have been invited to judge {program.title} on the CEDA Innovation Portal. "
                f"Entries have closed and {outstanding} {'entry is' if outstanding == 1 else 'entries are'} ready for you to mark "
                f"against the marking criteria. Please complete your marking by {cls._deadline_text(program)}."
            ),
            outstanding=outstanding,
        )
        judge.invited_at = now or timezone.now()
        judge.save(update_fields=["invited_at", "updated_at"])

    @classmethod
    def send_reminder(cls, judge: ChallengeJudge, outstanding: int, now=None):
        program = judge.program
        now = now or timezone.now()
        closes = program.marking_closes_at
        final = bool(closes and closes - now <= FINAL_REMINDER_WINDOW)
        cls._send(
            judge,
            subject=(f"Final hours to mark: {program.title}" if final else f"Reminder: entries waiting for your marks in {program.title}"),
            headline="Marking closes soon" if final else "You still have entries to mark",
            intro=(
                f"Dear {judge.name}, you still have {outstanding} {'entry' if outstanding == 1 else 'entries'} to mark for {program.title}. "
                f"Marking closes on {cls._deadline_text(program)}."
            ),
            outstanding=outstanding,
        )
        judge.last_reminded_at = now
        judge.save(update_fields=["last_reminded_at", "updated_at"])

    @staticmethod
    def _reminder_due(judge: ChallengeJudge, now) -> bool:
        last = judge.last_reminded_at or judge.invited_at
        if last is None:
            return False
        if now - last >= REMINDER_INTERVAL:
            return True
        closes = judge.program.marking_closes_at
        return bool(closes and closes - now <= FINAL_REMINDER_WINDOW and last < closes - FINAL_REMINDER_WINDOW)


    @classmethod
    def close_marking(cls, program):
        """At the marking deadline, settle every entry with the marks that are in."""
        from apps.evaluation.models import ReviewCycle
        from apps.evaluation.services import EvaluationService

        actor = get_user_model().objects.filter(is_superuser=True).first() or program.owner
        cycles = ReviewCycle.objects.filter(
            submission__program=program,
            workflow_step__code=JUDGING_STEP_CODE,
            status=ReviewCycle.STATUS_OPEN,
        )
        for cycle in cycles:
            EvaluationService.aggregate_and_decide(review_cycle=cycle, actor=actor, force=True, allow_below_minimum=True)

    @classmethod
    def process_program(cls, program, now=None):
        now = now or timezone.now()
        closes_at = program.submission_closes_at
        if closes_at is None or now <= closes_at:  # no close date (a draft) means not closed yet
            return
        marking_closes = program.marking_closes_at
        if marking_closes and now > marking_closes:
            return
        cls.sync_workflow(program)
        for judge in program.challenge_judges.select_related("program", "user"):
            if judge.invited_at is None:
                cls.send_invitation(judge, now=now)
                continue
            if judge.user_id:
                cls._assign_entries(judge)
            outstanding = cls.outstanding_count(judge)
            if outstanding and cls._reminder_due(judge, now):
                cls.send_reminder(judge, outstanding, now=now)

    @classmethod
    def process_due(cls, now=None) -> int:
        programs = Program.objects.filter(
            program_type__code=ProgramTypeCode.INNOVATION_CHALLENGE,
            status__in=[ProgramStatus.PUBLISHED, ProgramStatus.CLOSED],
            results_announced_at__isnull=True,
        ).select_related("program_type", "owner")
        for program in programs:
            cls.process_program(program, now=now)
        return programs.count()

    @staticmethod
    def assert_marking_open(submission):
        program = submission.program
        if not program.is_innovation_challenge:
            return
        closes = program.marking_closes_at
        if closes and timezone.now() > closes:
            raise ValidationError("Marking for this challenge has closed.")
