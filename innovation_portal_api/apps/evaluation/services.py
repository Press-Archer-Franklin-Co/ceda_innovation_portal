"""
Evaluation services — scoring, aggregation, threshold-based auto-decisions,
reviewer-blindness enforcement, and review cycle management.
"""
from datetime import datetime, timezone as dt_timezone
from decimal import Decimal
from statistics import median as statistics_median

from django.db import transaction
from django.db.models import Avg, Max, Min, Q
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from apps.assignments.models import Assignment, SpecialistInvitation
from apps.assignments.services import AssignmentService
from apps.audit.services import AuditService
from apps.communications.services import CommunicationService
from apps.core.constants import (
    AssignmentRoleType,
    AssignmentStatus,
    FinalDecisionType,
    RoleType,
    ScoreSheetStatus,
    SubmissionOutcomeType,
    SubmissionStatus,
)
from apps.core.utils import weighted_score
from apps.notifications.services import NotificationService
from apps.programs.challenge_judging import JUDGING_STEP_CODE, ChallengeJudgingService
from apps.evaluation.models import (
    CriterionScore,
    EvaluationRound,
    FinalDecision,
    MarkingCriteria,
    MarkingCriteriaItem,
    ModerationRecord,
    ReviewCycle,
    Rubric,
    RubricCriterion,
    ScoreSheet,
    StageCriterion,
    StageEvaluationConfig,
)
from apps.submissions.models import SubmissionOutcome
from apps.workflow.services import WorkflowRuntimeService



class ReviewCycleService:
    """Manages review cycle lifecycle — creation, lookup, and resubmission."""

    @staticmethod
    def _closes_at_for_config(stage_config: StageEvaluationConfig | None):
        if (
            stage_config
            and stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
            and stage_config.review_window_hours
        ):
            return timezone.now() + timezone.timedelta(hours=stage_config.review_window_hours)
        return None

    @staticmethod
    def _prefill_from_previous_cycle(*, submission, workflow_step, new_cycle: ReviewCycle) -> None:
        """
        A manager send-back is a correction pass, not a blank review. Seed the
        fresh cycle with each prior reviewer's latest final scorecard as a draft
        so they can adjust their previous marks and comments.
        """
        previous_cycle = (
            ReviewCycle.objects
            .filter(submission=submission, workflow_step=workflow_step, cycle_number__lt=new_cycle.cycle_number)
            .exclude(status=ReviewCycle.STATUS_CANCELLED)
            .order_by("-cycle_number")
            .first()
        )
        if not previous_cycle:
            return

        previous_sheets = (
            previous_cycle.completed_scorecards
            .select_related("judge")
            .prefetch_related("criterion_scores")
        )
        for old_sheet in previous_sheets:
            new_sheet, created = ScoreSheet.objects.get_or_create(
                submission=submission,
                judge=old_sheet.judge,
                review_cycle=new_cycle,
                defaults={
                    "status": ScoreSheetStatus.DRAFT,
                    "total_score": old_sheet.total_score,
                    "overall_comment": old_sheet.overall_comment,
                    "is_final": False,
                    "submitted_at": None,
                },
            )
            if not created:
                continue
            CriterionScore.objects.bulk_create([
                CriterionScore(
                    score_sheet=new_sheet,
                    criterion=score.criterion,
                    stage_criterion=score.stage_criterion,
                    marking_criteria_item=score.marking_criteria_item,
                    raw_score=score.raw_score,
                    weighted_score=score.weighted_score,
                    comment=score.comment,
                    criterion_name_snapshot=score.criterion_name,
                    criterion_max_score_snapshot=score.criterion_max_score,
                )
                for score in old_sheet.criterion_scores.all()
            ])

    @staticmethod
    def get_or_open(*, submission, workflow_step) -> ReviewCycle:
        """
        Return the currently open ReviewCycle for this submission+step.
        If none exists, create one.
        """
        open_cycle = ReviewCycle.objects.filter(
            submission=submission,
            workflow_step=workflow_step,
            status=ReviewCycle.STATUS_OPEN,
        ).first()
        if open_cycle:
            if (
                stage_config := getattr(workflow_step, "evaluation_config", None)
            ) and not open_cycle.closes_at:
                open_cycle.closes_at = ReviewCycleService._closes_at_for_config(stage_config)
                if open_cycle.closes_at:
                    open_cycle.save(update_fields=["closes_at", "updated_at"])
            return open_cycle

        last = ReviewCycle.objects.filter(
            submission=submission,
            workflow_step=workflow_step,
        ).order_by("-cycle_number").first()
        cycle_number = (last.cycle_number + 1) if last else 1

        stage_config = getattr(workflow_step, "evaluation_config", None)

        new_cycle = ReviewCycle.objects.create(
            submission=submission,
            workflow_step=workflow_step,
            stage_config=stage_config,
            cycle_number=cycle_number,
            status=ReviewCycle.STATUS_OPEN,
            closes_at=ReviewCycleService._closes_at_for_config(stage_config),
        )
        ReviewCycleService._prefill_from_previous_cycle(
            submission=submission,
            workflow_step=workflow_step,
            new_cycle=new_cycle,
        )
        return new_cycle

    @staticmethod
    @transaction.atomic
    def open_new_cycle(*, submission, workflow_step) -> ReviewCycle:
        """
        Close any open cycle for this step and open a fresh one.
        Called when a returned submission is resubmitted.
        """
        ReviewCycle.objects.filter(
            submission=submission,
            workflow_step=workflow_step,
            status=ReviewCycle.STATUS_OPEN,
        ).update(status=ReviewCycle.STATUS_CANCELLED, closed_at=timezone.now())

        stage_config = getattr(workflow_step, "evaluation_config", None)
        last = ReviewCycle.objects.filter(
            submission=submission,
            workflow_step=workflow_step,
        ).order_by("-cycle_number").first()
        cycle_number = (last.cycle_number + 1) if last else 1

        new_cycle = ReviewCycle.objects.create(
            submission=submission,
            workflow_step=workflow_step,
            stage_config=stage_config,
            cycle_number=cycle_number,
            status=ReviewCycle.STATUS_OPEN,
            closes_at=ReviewCycleService._closes_at_for_config(stage_config),
        )
        ReviewCycleService._prefill_from_previous_cycle(
            submission=submission,
            workflow_step=workflow_step,
            new_cycle=new_cycle,
        )
        return new_cycle



class StageConfigService:
    """Resolve and manage StageEvaluationConfig for workflow steps."""

    @staticmethod
    def get_for_step(workflow_step) -> StageEvaluationConfig | None:
        """Return the StageEvaluationConfig for a step, or None."""
        return getattr(workflow_step, "evaluation_config", None)

    @staticmethod
    def effective_criteria(config: StageEvaluationConfig) -> list:
        """
        Return a unified list of criterion dicts from whichever source is active.

        Resolution order:
          1. marking_criteria (library — preferred, reusable)
          2. rubric (legacy programme-level template)
          3. custom_criteria (per-step, fallback)
        """
        if config.marking_criteria_id:
            return [
                {
                    "id": str(c.id),
                    "type": "library",
                    "name": c.name,
                    "description": c.description,
                    "max_score": float(c.max_score),
                    "min_score": float(c.min_score),
                    "weight": float(c.weight),
                    "ordering": c.ordering,
                    "comment_required_below": float(c.comment_required_below) if c.comment_required_below is not None else None,
                }
                for c in config.marking_criteria.items.all()
            ]
        if config.rubric_id:
            return [
                {
                    "id": str(c.id),
                    "type": "rubric",
                    "name": c.name,
                    "description": c.description,
                    "max_score": float(c.max_score),
                    "min_score": float(c.min_score),
                    "weight": float(c.weight),
                    "ordering": c.ordering,
                    "comment_required_below": None,
                }
                for c in config.rubric.criteria.all()
            ]
        return [
            {
                "id": str(c.id),
                "type": "stage",
                "name": c.name,
                "description": c.description,
                "max_score": float(c.max_score),
                "min_score": float(c.min_score),
                "weight": float(c.weight),
                "ordering": c.ordering,
                "comment_required_below": float(c.comment_required_below) if c.comment_required_below is not None else None,
            }
            for c in config.custom_criteria.all()
        ]



def require_comment_for_score(criterion, raw, comment) -> None:
    """B5: criteria can ask for a comment on given scores, for example 1 and 5."""
    scores = getattr(criterion, "comment_required_scores", None) or []
    if not scores or (comment or "").strip():
        return
    if raw == raw.to_integral_value() and int(raw) in {int(score) for score in scores}:
        raise ValidationError(f"Add a comment to explain a score of {int(raw)} for '{criterion.name}'.")


def sheet_weighted_score(sheet) -> float | None:
    """The sheet's score out of 100: sum of weighted scores over the sum of weights (B5)."""
    total_weight = Decimal("0")
    earned = Decimal("0")
    for score in sheet.criterion_scores.select_related("marking_criteria_item", "stage_criterion", "criterion"):
        criterion = score.marking_criteria_item or score.stage_criterion or score.criterion
        if criterion is None or not criterion.weight:
            continue
        total_weight += criterion.weight
        earned += score.weighted_score or Decimal("0")
    if not total_weight:
        return None
    return round(float(earned / total_weight * 100), 2)


def _reviewer_role_label(user) -> str:
    """
    Return a short display label for the reviewer's primary role.
    Falls back to 'Reviewer' when no specific role is found.
    """
    ROLE_LABELS = {
        RoleType.JUDGE: "Judge",
        RoleType.INNOVATION_OFFICER: "Innovation Officer",
        RoleType.INNOVATION_MANAGER: "Manager",
        RoleType.ADMINISTRATOR: "Administrator",
    }
    codes = set(
        user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)
    )
    for role_type, label in ROLE_LABELS.items():
        if role_type in codes:
            return label
    return "Reviewer"



class EvaluationService:
    MANAGER_GATED_STEP_CODES = {"officer_review", "committee_review"}

    @staticmethod
    def build_submission_snapshot(submission) -> dict:
        responses = []
        for response in submission.responses.select_related("form_field").all():
            responses.append({
                "id": str(response.id),
                "form_field": str(response.form_field_id) if response.form_field_id else None,
                "field_key": response.field_key_snapshot or getattr(response.form_field, "key", ""),
                "field_label": response.field_label_snapshot or getattr(response.form_field, "label", ""),
                "field_type": response.field_type_snapshot or getattr(response.form_field, "field_type", ""),
                "form_version_snapshot": response.form_version_snapshot,
                "value": response.value,
            })
        innovator = getattr(submission, "innovator", None)
        program = getattr(submission, "program", None)
        return {
            "_snapshot_source": "submitted_review_time",
            "_snapshot_captured_at": timezone.now().isoformat(),
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

    @staticmethod
    def _required_reviewer_count_for_cycle(*, review_cycle: ReviewCycle, stage_config: StageEvaluationConfig) -> int:
        if stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
            return max(1, stage_config.minimum_reviews_required)
        required = max(1, stage_config.required_reviewer_count)
        step = review_cycle.workflow_step
        if step and step.assignment_role == AssignmentRoleType.SPECIALIST:
            invite_required = (
                SpecialistInvitation.objects
                .filter(
                    submission=review_cycle.submission,
                    status__in=["pending", "accepted", "completed"],
                )
                .filter(Q(workflow_step=step) | Q(workflow_step__isnull=True))
                .order_by("-required_review_count")
                .values_list("required_review_count", flat=True)
                .first()
            )
            if invite_required:
                required = max(1, int(invite_required))
        return required

    @staticmethod
    def _time_window_is_ready(*, review_cycle: ReviewCycle, stage_config: StageEvaluationConfig, force: bool = False) -> bool:
        if force or stage_config.review_mode != StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
            return True
        return bool(review_cycle.closes_at and timezone.now() >= review_cycle.closes_at)

    @staticmethod
    @transaction.atomic
    def resolve_evaluation_round(*, program, step=None):
        """Legacy: resolve an EvaluationRound for non-cycle-based scoring."""
        if step and step.evaluation_round_id:
            return step.evaluation_round

        existing = program.evaluation_rounds.filter(active=True).select_related("rubric").first()
        if existing:
            return existing

        rubric = Rubric.objects.filter(program_type=program.program_type, active=True).order_by("-version", "-updated_at").first()
        if not rubric:
            raise ValidationError("No active rubric is configured for this program type.")

        return EvaluationRound.objects.create(
            program=program,
            rubric=rubric,
            name=f"{program.title} Evaluation Round",
            required_judges=max(1, getattr(step, "minimum_evaluations", 0) or 1),
        )

    @staticmethod
    def _judge_assignment_required(submission, judge):
        """Legacy: require a JUDGE-role assignment. Use _get_reviewer_assignment for new code."""
        assignment = Assignment.objects.filter(
            submission=submission,
            assignee=judge,
            role_type=AssignmentRoleType.JUDGE,
            status=AssignmentStatus.ACCEPTED,
        ).first()
        if not assignment or hasattr(assignment, "conflict_declaration"):
            raise ValidationError("Judge is not eligible to score this submission.")
        return assignment

    @staticmethod
    def _get_reviewer_assignment(submission, user, review_cycle: ReviewCycle | None = None):
        """
        Return an accepted assignment for any reviewer role.

        Full-access staff (officers, managers, admins) can score without an
        explicit assignment — they oversee all submissions.  All other assigned
        staff require an accepted assignment with any reviewer-type role.
        """
        step = review_cycle.workflow_step if review_cycle else None
        if step and step.code in {"officer_review", "committee_review"}:
            assignment = Assignment.objects.filter(
                submission=submission,
                workflow_step=step,
                assignee=user,
                status=AssignmentStatus.ACCEPTED,
            ).first()
            if not assignment:
                raise ValidationError(
                    "You are not eligible to score this review. "
                    "An accepted assignment for this step is required."
                )
            return assignment

        if EvaluationService._is_full_access_staff(user):
            return None

        assignment = Assignment.objects.filter(
            submission=submission,
            assignee=user,
            status=AssignmentStatus.ACCEPTED,
        ).first()
        if not assignment:
            raise ValidationError(
                "You are not eligible to score this submission. "
                "An accepted assignment is required."
            )
        return assignment

    @staticmethod
    def _is_staff(user):
        """Legacy alias — kept for backward compatibility."""
        return EvaluationService._is_full_access_staff(user)

    @staticmethod
    def _is_full_access_staff(user):
        """Officers, managers, and admins: full access, no assignment required."""
        FULL_ACCESS = [
            RoleType.INNOVATION_OFFICER,
            RoleType.INNOVATION_MANAGER,
            RoleType.ADMINISTRATOR,
        ]
        return (
            user.is_superuser
            or user.roles.filter(
                code__in=FULL_ACCESS,
                user_roles__is_active=True,
            ).exists()
        )


    @staticmethod
    @transaction.atomic
    def get_or_create_scorecard(*, submission, judge, review_cycle: ReviewCycle) -> ScoreSheet:
        """Return (or create draft) the reviewer's scorecard for this cycle."""
        sheet, _ = ScoreSheet.objects.get_or_create(
            submission=submission,
            judge=judge,
            review_cycle=review_cycle,
            defaults={"status": ScoreSheetStatus.DRAFT},
        )
        if sheet.status in {ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED}:
            raise ValidationError("You have already submitted your evaluation for this cycle.")
        return sheet

    @staticmethod
    @transaction.atomic
    def save_cycle_scores(
        *,
        submission,
        judge,
        review_cycle: ReviewCycle,
        scores: list[dict],
        overall_comment: str = "",
    ) -> ScoreSheet:
        """
        Save or update a reviewer's draft scores for a review cycle.
        Enforces:
          - review cycle is open
          - judge has an accepted assignment
          - scores are within criterion bounds
        """
        if review_cycle.status != ReviewCycle.STATUS_OPEN:
            raise ValidationError("This review cycle is no longer open.")
        if review_cycle.stage_config and review_cycle.stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
            if review_cycle.closes_at and timezone.now() >= review_cycle.closes_at:
                raise ValidationError("This review window has closed.")
        ChallengeJudgingService.assert_marking_open(submission)

        EvaluationService._get_reviewer_assignment(submission, judge, review_cycle=review_cycle)

        sheet, _ = ScoreSheet.objects.get_or_create(
            submission=submission,
            judge=judge,
            review_cycle=review_cycle,
            defaults={"status": ScoreSheetStatus.DRAFT},
        )

        if sheet.status in {ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED}:
            raise ValidationError("Your evaluation for this cycle is already submitted and locked.")

        stage_config = review_cycle.stage_config
        total = Decimal("0")

        for item in scores:
            criterion_id = str(item.get("criterion_id") or item.get("criterion") or "")
            criterion_type = item.get("type", "")
            raw = Decimal(str(item["raw_score"]))
            comment = item.get("comment", "")

            if criterion_type == "library" or (stage_config and stage_config.marking_criteria_id):
                criterion_obj = MarkingCriteriaItem.objects.get(id=criterion_id)
                if raw < criterion_obj.min_score or raw > criterion_obj.max_score:
                    raise ValidationError(f"Score for '{criterion_obj.name}' is out of range.")
                require_comment_for_score(criterion_obj, raw, comment)
                if (
                    criterion_obj.comment_required_below is not None
                    and raw < criterion_obj.comment_required_below
                    and not comment
                ):
                    raise ValidationError(f"A comment is required for '{criterion_obj.name}' when score is below {criterion_obj.comment_required_below}.")
                computed = (raw / criterion_obj.max_score) * criterion_obj.weight if criterion_obj.max_score else Decimal("0")
                CriterionScore.objects.update_or_create(
                    score_sheet=sheet,
                    marking_criteria_item=criterion_obj,
                    defaults={
                        "raw_score": raw, "weighted_score": computed, "comment": comment,
                        "criterion_name_snapshot": criterion_obj.name,
                        "criterion_max_score_snapshot": criterion_obj.max_score,
                        "criterion": None, "stage_criterion": None,
                    },
                )
                total += raw
            elif criterion_type == "stage" or (stage_config and not stage_config.rubric_id and not stage_config.marking_criteria_id):
                criterion_obj = StageCriterion.objects.get(id=criterion_id, stage_config=stage_config)
                if raw < criterion_obj.min_score or raw > criterion_obj.max_score:
                    raise ValidationError(f"Score for '{criterion_obj.name}' is out of range.")
                require_comment_for_score(criterion_obj, raw, comment)
                if (
                    criterion_obj.comment_required_below is not None
                    and raw < criterion_obj.comment_required_below
                    and not comment
                ):
                    raise ValidationError(f"A comment is required for '{criterion_obj.name}' when score is below {criterion_obj.comment_required_below}.")
                computed = (raw / criterion_obj.max_score) * criterion_obj.weight if criterion_obj.max_score else Decimal("0")
                CriterionScore.objects.update_or_create(
                    score_sheet=sheet,
                    stage_criterion=criterion_obj,
                    defaults={
                        "raw_score": raw, "weighted_score": computed, "comment": comment,
                        "criterion_name_snapshot": criterion_obj.name,
                        "criterion_max_score_snapshot": criterion_obj.max_score,
                        "criterion": None, "marking_criteria_item": None,
                    },
                )
                total += raw
            else:
                criterion_obj = RubricCriterion.objects.get(id=criterion_id)
                if raw < criterion_obj.min_score or raw > criterion_obj.max_score:
                    raise ValidationError(f"Score for '{criterion_obj.name}' is out of range.")
                computed = Decimal(str(weighted_score(float(raw), float(criterion_obj.weight), float(criterion_obj.max_score))))
                CriterionScore.objects.update_or_create(
                    score_sheet=sheet,
                    criterion=criterion_obj,
                    defaults={
                        "raw_score": raw, "weighted_score": computed, "comment": comment,
                        "criterion_name_snapshot": criterion_obj.name,
                        "criterion_max_score_snapshot": criterion_obj.max_score,
                        "stage_criterion": None, "marking_criteria_item": None,
                    },
                )
                total += computed

        sheet.total_score = total
        sheet.overall_comment = overall_comment
        sheet.save(update_fields=["total_score", "overall_comment", "updated_at"])
        AuditService.log_action(actor=judge, action_type="score_draft_saved", target=submission, metadata={"score_sheet_id": str(sheet.id), "cycle": str(review_cycle.id)})
        return sheet

    @staticmethod
    @transaction.atomic
    def submit_cycle_scores(*, submission, judge, review_cycle: ReviewCycle) -> ScoreSheet:
        """
        Finalize and lock a reviewer's scorecard.
        After submission:
          - the scorecard is immutable
          - aggregate_and_decide() is called to check for threshold outcomes
        """
        if review_cycle.status != ReviewCycle.STATUS_OPEN:
            raise ValidationError("This review cycle is no longer open.")
        if review_cycle.stage_config and review_cycle.stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
            if review_cycle.closes_at and timezone.now() >= review_cycle.closes_at:
                raise ValidationError("This review window has closed.")
        ChallengeJudgingService.assert_marking_open(submission)

        assignment = EvaluationService._get_reviewer_assignment(submission, judge, review_cycle=review_cycle)

        sheet = ScoreSheet.objects.filter(
            submission=submission,
            judge=judge,
            review_cycle=review_cycle,
        ).first()
        if not sheet:
            raise ValidationError("No draft scorecard found. Please save your scores first.")

        stage_config = review_cycle.stage_config
        if stage_config:
            expected_count = len(StageConfigService.effective_criteria(stage_config))
            actual_count = sheet.criterion_scores.count()
            if actual_count < expected_count:
                raise ValidationError(f"All {expected_count} criteria must be scored before submission ({actual_count} scored).")

        sheet.status = ScoreSheetStatus.LOCKED
        sheet.is_final = True
        sheet.submitted_at = timezone.now()
        sheet.submission_snapshot = EvaluationService.build_submission_snapshot(submission)
        sheet.save(update_fields=["status", "is_final", "submitted_at", "submission_snapshot", "updated_at"])

        if assignment:
            AssignmentService.complete(assignment, judge, note="Evaluation submitted for review cycle.")
        NotificationService.notify(
            user=submission.program.owner,
            notification_type="evaluation_submitted",
            title="Evaluation submitted",
            message=f"A reviewer submitted their evaluation for {submission.reference_number or submission.title}.",
        )
        AuditService.log_action(actor=judge, action_type="score_submitted", target=submission, metadata={"score_sheet_id": str(sheet.id), "cycle": str(review_cycle.id)})

        EvaluationService.aggregate_and_decide(review_cycle=review_cycle, actor=judge)

        return sheet

    @staticmethod
    @transaction.atomic
    def aggregate_and_decide(*, review_cycle: ReviewCycle, actor, force: bool = False, allow_below_minimum: bool = False) -> dict | None:
        """
        Calculate the aggregate score for the current review cycle.
        If the required number of reviews have been submitted:
          1. Compute aggregate score
          2. Compare to threshold bands
          3. Automatically trigger the appropriate workflow action
        Returns None if not enough reviews yet.
        """
        stage_config = review_cycle.stage_config
        if not stage_config:
            return None
        if not force and review_cycle.workflow_step and review_cycle.workflow_step.code == JUDGING_STEP_CODE:
            return None
        if not EvaluationService._time_window_is_ready(review_cycle=review_cycle, stage_config=stage_config, force=force):
            return None

        completed = review_cycle.completed_scorecards
        required_reviewer_count = EvaluationService._required_reviewer_count_for_cycle(
            review_cycle=review_cycle,
            stage_config=stage_config,
        )
        completed_count = completed.count()
        if completed_count < required_reviewer_count and not allow_below_minimum:
            if stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
                review_cycle.status = ReviewCycle.STATUS_NEEDS_ATTENTION
                review_cycle.closed_at = timezone.now()
                review_cycle.decision_note = (
                    f"Review window closed with {completed_count} completed review(s); "
                    f"{required_reviewer_count} required."
                )
                review_cycle.save(update_fields=["status", "closed_at", "decision_note", "updated_at"])
            return None

        scores = [float(s.total_score) for s in completed]
        if not scores:
            if stage_config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW:
                review_cycle.status = ReviewCycle.STATUS_NEEDS_ATTENTION
                review_cycle.closed_at = timezone.now()
                review_cycle.decision_note = "Review window closed with no submitted scorecards."
                review_cycle.save(update_fields=["status", "closed_at", "decision_note", "updated_at"])
            return None

        method = stage_config.aggregation_method
        if method == StageEvaluationConfig.AGGREGATION_AVERAGE:
            agg_score = sum(scores) / len(scores)
        elif method == StageEvaluationConfig.AGGREGATION_MIN:
            agg_score = min(scores)
        elif method == StageEvaluationConfig.AGGREGATION_MAX:
            agg_score = max(scores)
        elif method == StageEvaluationConfig.AGGREGATION_MEDIAN:
            agg_score = statistics_median(scores)
        else:
            agg_score = sum(scores) / len(scores)

        max_score = float(stage_config.effective_max_score)
        pct = (agg_score / max_score * 100) if max_score else 0

        reject_threshold = float(stage_config.threshold_reject_below)
        pass_threshold = float(stage_config.threshold_pass_above)

        if pct < reject_threshold:
            outcome = ReviewCycle.OUTCOME_REJECT
        elif pct >= pass_threshold:
            outcome = ReviewCycle.OUTCOME_PASS
        else:
            outcome = ReviewCycle.OUTCOME_RETURN

        agg_dec = Decimal(str(round(agg_score, 2)))
        pct_dec = Decimal(str(round(pct, 2)))
        review_cycle.aggregate_score = agg_dec
        review_cycle.aggregate_pct = pct_dec
        review_cycle.outcome = outcome
        review_cycle.status = ReviewCycle.STATUS_COMPLETED
        review_cycle.closed_at = timezone.now()
        review_cycle.save(update_fields=["aggregate_score", "aggregate_pct", "outcome", "status", "closed_at"])

        submission = review_cycle.submission

        low_score_comments = []
        for sheet in completed:
            for cs in sheet.criterion_scores.all():
                if cs.comment and float(cs.raw_score) < (float(cs.criterion_max_score) * 0.5):
                    low_score_comments.append(f"• {cs.criterion_name}: {cs.comment}")
        feedback_summary = "\n".join(low_score_comments[:5]) if low_score_comments else ""

        note = f"Automated decision after {len(scores)} reviewer(s). Score: {round(pct, 1)}%.\n"
        if feedback_summary:
            note += f"\nKey reviewer feedback:\n{feedback_summary}"
        review_cycle.decision_note = note
        review_cycle.save(update_fields=["decision_note"])

        step_code = review_cycle.workflow_step.code if review_cycle.workflow_step else ""

        if step_code in EvaluationService.MANAGER_GATED_STEP_CODES:
            try:
                WorkflowRuntimeService.perform_action(
                    submission=submission,
                    actor=actor,
                    action="approve",
                    comment=note,
                )
            except Exception as exc:
                AuditService.log_action(
                    actor=actor,
                    action_type="manager_gate_advance_failed",
                    target=submission,
                    metadata={"error": str(exc), "cycle": str(review_cycle.id), "step_code": step_code},
                )

            AuditService.log_action(
                actor=actor,
                action_type="review_cycle_pending_manager_approval",
                target=submission,
                metadata={
                    "cycle": str(review_cycle.id),
                    "outcome": outcome,
                    "aggregate_score": str(agg_dec),
                    "aggregate_pct": str(pct_dec),
                    "reviewer_count": len(scores),
                    "step_code": step_code,
                },
            )
            return {
                "outcome": outcome,
                "aggregate_score": float(agg_dec),
                "aggregate_pct": float(pct_dec),
                "reviewer_count": len(scores),
                "pending_manager_approval": True,
            }

        workflow_action_map = {
            ReviewCycle.OUTCOME_PASS: "approve",
            ReviewCycle.OUTCOME_RETURN: "return",
            ReviewCycle.OUTCOME_REJECT: "reject",
        }
        workflow_action = workflow_action_map[outcome]

        try:
            WorkflowRuntimeService.perform_action(
                submission=submission,
                actor=actor,
                action=workflow_action,
                comment=note,
            )
        except Exception as exc:
            AuditService.log_action(
                actor=actor,
                action_type="auto_decision_failed",
                target=submission,
                metadata={"error": str(exc), "intended_action": workflow_action, "cycle": str(review_cycle.id)},
            )

        if outcome == ReviewCycle.OUTCOME_REJECT:
            notif_msg = f"Your submission {submission.reference_number} has been reviewed. Unfortunately it did not meet the required standard at this stage."
            if feedback_summary:
                notif_msg += f"\n\nKey areas for improvement:\n{feedback_summary}"
        elif outcome == ReviewCycle.OUTCOME_RETURN:
            notif_msg = f"Your submission {submission.reference_number} has been returned for correction. Please review the feedback and resubmit."
            if feedback_summary:
                notif_msg += f"\n\nReviewer feedback:\n{feedback_summary}"
        else:
            notif_msg = f"Good news! Your submission {submission.reference_number} has advanced to the next stage."

        if not submission.program.is_innovation_challenge:
            NotificationService.notify(
                user=submission.innovator,
                notification_type=f"review_cycle_{outcome}",
                title={
                    ReviewCycle.OUTCOME_PASS: "Submission Advanced",
                    ReviewCycle.OUTCOME_RETURN: "Submission Returned for Correction",
                    ReviewCycle.OUTCOME_REJECT: "Submission Not Selected",
                }[outcome],
                message=notif_msg,
                send_email=True,
            )

        AuditService.log_action(
            actor=actor,
            action_type="review_cycle_decided",
            target=submission,
            metadata={
                "cycle": str(review_cycle.id),
                "outcome": outcome,
                "aggregate_score": str(agg_dec),
                "aggregate_pct": str(pct_dec),
                "reviewer_count": len(scores),
            },
        )

        return {
            "outcome": outcome,
            "aggregate_score": float(agg_dec),
            "aggregate_pct": float(pct_dec),
            "reviewer_count": len(scores),
        }

    @staticmethod
    @transaction.atomic
    def process_due_timed_review_cycles(*, actor=None) -> int:
        due_cycles = (
            ReviewCycle.objects
            .select_related("stage_config", "submission__program", "workflow_step")
            .filter(
                status=ReviewCycle.STATUS_OPEN,
                stage_config__review_mode=StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW,
                closes_at__isnull=False,
                closes_at__lte=timezone.now(),
            )
        )
        if actor is None:
            from django.contrib.auth import get_user_model

            actor = get_user_model().objects.filter(is_superuser=True).first()
        processed = 0
        for cycle in due_cycles:
            EvaluationService.aggregate_and_decide(review_cycle=cycle, actor=actor, force=True)
            processed += 1
        return processed

    @staticmethod
    @transaction.atomic
    def reset_review_window(*, review_cycle: ReviewCycle, actor, hours: int | None = None, reason: str = "") -> ReviewCycle:
        review_cycle = ReviewCycle.objects.select_for_update().select_related("stage_config").get(id=review_cycle.id)
        stage_config = review_cycle.stage_config
        if not stage_config:
            raise ValidationError("This review cycle does not have an evaluation configuration.")
        duration = int(hours or stage_config.review_window_hours or 0)
        if duration < 1:
            raise ValidationError("Review window hours must be at least 1.")
        review_cycle.status = ReviewCycle.STATUS_OPEN
        review_cycle.closed_at = None
        review_cycle.decision_note = ""
        review_cycle.closes_at = timezone.now() + timezone.timedelta(hours=duration)
        review_cycle.extended_count += 1
        review_cycle.last_extended_by = actor
        review_cycle.last_extended_at = timezone.now()
        review_cycle.extension_reason = reason
        review_cycle.save(update_fields=[
            "status", "closed_at", "decision_note", "closes_at", "extended_count",
            "last_extended_by", "last_extended_at", "extension_reason", "updated_at",
        ])
        return review_cycle

    @staticmethod
    @transaction.atomic
    def extend_review_window(*, review_cycle: ReviewCycle, actor, hours: int, reason: str = "") -> ReviewCycle:
        if int(hours) < 1:
            raise ValidationError("Extension hours must be at least 1.")
        review_cycle = ReviewCycle.objects.select_for_update().get(id=review_cycle.id)
        base = review_cycle.closes_at if review_cycle.closes_at and review_cycle.closes_at > timezone.now() else timezone.now()
        review_cycle.status = ReviewCycle.STATUS_OPEN
        review_cycle.closed_at = None
        review_cycle.decision_note = ""
        review_cycle.closes_at = base + timezone.timedelta(hours=int(hours))
        review_cycle.extended_count += 1
        review_cycle.last_extended_by = actor
        review_cycle.last_extended_at = timezone.now()
        review_cycle.extension_reason = reason
        review_cycle.save(update_fields=[
            "status", "closed_at", "decision_note", "closes_at", "extended_count",
            "last_extended_by", "last_extended_at", "extension_reason", "updated_at",
        ])
        return review_cycle

    @staticmethod
    @transaction.atomic
    def close_review_window_now(*, review_cycle: ReviewCycle, actor, allow_below_minimum: bool = False) -> ReviewCycle:
        review_cycle = ReviewCycle.objects.select_for_update().get(id=review_cycle.id)
        review_cycle.closes_at = timezone.now()
        review_cycle.save(update_fields=["closes_at", "updated_at"])
        EvaluationService.aggregate_and_decide(
            review_cycle=review_cycle,
            actor=actor,
            force=True,
            allow_below_minimum=allow_below_minimum,
        )
        return ReviewCycle.objects.get(id=review_cycle.id)


    @staticmethod
    def get_scorecard_for_reviewer(
        *, submission, judge, review_cycle: ReviewCycle, reveal_identities: bool = False
    ) -> dict:
        """
        Return the reviewer's full scorecard data.

        ``reveal_identities``:
          - True  → peer reviewer names are included (staff / officer view).
          - False → peers are shown as "Reviewer 1", "Reviewer 2", etc.

        Blind-scoring rule: peer scorecards are hidden until the reviewer has
        submitted their own scores (or the cycle is complete / blind off).
        """
        stage_config = review_cycle.stage_config
        blind = stage_config.blind_scoring if stage_config else True
        required = (
            EvaluationService._required_reviewer_count_for_cycle(
                review_cycle=review_cycle,
                stage_config=stage_config,
            )
            if stage_config
            else 0
        )

        own_sheet = ScoreSheet.objects.filter(
            submission=submission,
            judge=judge,
            review_cycle=review_cycle,
        ).prefetch_related(
            "criterion_scores__criterion",
            "criterion_scores__stage_criterion",
            "criterion_scores__marking_criteria_item",
        ).first()

        own_submitted = own_sheet and own_sheet.status in {ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED}

        criteria = StageConfigService.effective_criteria(stage_config) if stage_config else []

        completed_count = review_cycle.completed_count
        pending_count = max(0, required - completed_count)

        can_score = (
            not own_submitted
            and Assignment.objects.filter(
                submission=submission,
                workflow_step=review_cycle.workflow_step,
                assignee=judge,
                status=AssignmentStatus.ACCEPTED,
            ).exists()
        )

        reviewer_role = _reviewer_role_label(judge)

        result = {
            "review_cycle_id": str(review_cycle.id),
            "cycle_number": review_cycle.cycle_number,
            "cycle_status": review_cycle.status,
            "stage_config": {
                "required_reviewer_count": required,
                "blind_scoring": blind,
                "threshold_reject_below": float(stage_config.threshold_reject_below) if stage_config else None,
                "threshold_pass_above": float(stage_config.threshold_pass_above) if stage_config else None,
            } if stage_config else None,
            "criteria": criteria,
            "my_scorecard": None,
            "peer_scores_available": False,
            "aggregate": None,
            "completed_reviews": completed_count,
            "required_reviews": required,
            "pending_count": pending_count,
            "can_score": can_score,
        }

        if own_sheet:
            result["my_scorecard"] = {
                "id": str(own_sheet.id),
                "reviewer_name": judge.full_name,
                "reviewer_role": reviewer_role,
                "status": own_sheet.status,
                "total_score": float(own_sheet.total_score),
                "weighted_score": sheet_weighted_score(own_sheet),
                "overall_comment": own_sheet.overall_comment,
                "submitted_at": own_sheet.submitted_at.isoformat() if own_sheet.submitted_at else None,
                "scores": [
                    {
                        "criterion_id": str(
                            cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id
                        ),
                        "criterion_name": cs.criterion_name,
                        "max_score": float(cs.criterion_max_score),
                        "raw_score": float(cs.raw_score),
                        "weighted_score": float(cs.weighted_score),
                        "comment": cs.comment,
                    }
                    for cs in own_sheet.criterion_scores.all()
                ],
            }

        show_aggregate = (not blind) or own_submitted or (review_cycle.status == ReviewCycle.STATUS_COMPLETED)
        result["peer_scores_available"] = show_aggregate

        if show_aggregate and review_cycle.aggregate_score is not None:
            result["aggregate"] = {
                "score": float(review_cycle.aggregate_score),
                "pct": float(review_cycle.aggregate_pct) if review_cycle.aggregate_pct else None,
                "outcome": review_cycle.outcome,
                "completed_reviews": completed_count,
            }

        if show_aggregate:
            # Judges never see each other's names, even after they submit; only staff views do.
            reveal_peers = reveal_identities
            peer_sheets = (
                ScoreSheet.objects
                .filter(
                    review_cycle=review_cycle,
                    status__in={ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED},
                )
                .exclude(judge=judge)
                .select_related("judge")
                .prefetch_related(
                    "criterion_scores__criterion",
                    "criterion_scores__stage_criterion",
                    "criterion_scores__marking_criteria_item",
                )
            )
            result["peer_scorecards"] = [
                {
                    "reviewer_label": ps.judge.full_name if reveal_peers else f"Reviewer {idx + 1}",
                    "reviewer_name": ps.judge.full_name if reveal_peers else None,
                    "reviewer_role": _reviewer_role_label(ps.judge),
                    "total_score": float(ps.total_score),
                    "weighted_score": sheet_weighted_score(ps),
                    "overall_comment": ps.overall_comment,
                    "submitted_at": ps.submitted_at.isoformat() if ps.submitted_at else None,
                    "status": ps.status,
                    "scores": [
                        {
                            "criterion_id": str(
                                cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id
                            ),
                            "criterion_name": cs.criterion_name,
                            "max_score": float(cs.criterion_max_score),
                            "raw_score": float(cs.raw_score),
                            "weighted_score": float(cs.weighted_score),
                            "comment": cs.comment,
                        }
                        for cs in ps.criterion_scores.all()
                    ],
                }
                for idx, ps in enumerate(peer_sheets)
            ]
            result["pending_scorecards"] = [
                {"reviewer_label": f"Pending reviewer {i + 1}", "status": "pending"}
                for i in range(pending_count)
            ]
        else:
            result["peer_scorecards"] = []
            result["pending_scorecards"] = []

        return result


    @staticmethod
    @transaction.atomic
    def save_scores(*, submission, judge, evaluation_round, scores: list[dict], overall_comment: str = ""):
        if not submission.program.is_evaluation_open() and not EvaluationService._is_staff(judge):
            raise ValidationError("Evaluation is outside the configured judging window.")
        EvaluationService._judge_assignment_required(submission, judge)
        score_sheet, _ = ScoreSheet.objects.get_or_create(
            submission=submission,
            judge=judge,
            evaluation_round=evaluation_round,
        )
        if score_sheet.status in {ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED} or score_sheet.is_final:
            raise ValidationError("This evaluation has already been submitted and is locked.")
        total = Decimal("0")
        criteria = {str(c.id): c for c in evaluation_round.rubric.criteria.all()}
        for item in scores:
            criterion_value = item["criterion"]
            criterion = criteria[str(getattr(criterion_value, "id", criterion_value))]
            raw = Decimal(str(item["raw_score"]))
            if raw < criterion.min_score or raw > criterion.max_score:
                raise ValidationError(f"Score for {criterion.name} is out of range.")
            computed = Decimal(str(weighted_score(float(raw), float(criterion.weight), float(criterion.max_score))))
            CriterionScore.objects.update_or_create(
                score_sheet=score_sheet,
                criterion=criterion,
                defaults={"raw_score": raw, "weighted_score": computed, "comment": item.get("comment", "")},
            )
            total += computed
        score_sheet.total_score = total
        score_sheet.overall_comment = overall_comment
        score_sheet.save(update_fields=["total_score", "overall_comment", "updated_at"])
        AuditService.log_action(actor=judge, action_type="score_draft_saved", target=submission, metadata={"score_sheet_id": str(score_sheet.id)})
        return score_sheet

    @staticmethod
    @transaction.atomic
    def submit_scores(*, submission, judge, evaluation_round):
        if not submission.program.is_evaluation_open() and not EvaluationService._is_staff(judge):
            raise ValidationError("Evaluation is outside the configured judging window.")
        assignment = EvaluationService._judge_assignment_required(submission, judge)
        score_sheet = ScoreSheet.objects.get(submission=submission, judge=judge, evaluation_round=evaluation_round)
        expected = evaluation_round.rubric.criteria.count()
        if score_sheet.criterion_scores.count() != expected:
            raise ValidationError("All criteria must be scored before submission.")
        score_sheet.status = ScoreSheetStatus.LOCKED
        score_sheet.is_final = True
        score_sheet.submitted_at = timezone.now()
        score_sheet.submission_snapshot = EvaluationService.build_submission_snapshot(submission)
        score_sheet.save(update_fields=["status", "is_final", "submitted_at", "submission_snapshot", "updated_at"])
        AssignmentService.complete(assignment, judge, note="Evaluation submitted and locked.")
        NotificationService.notify(
            user=submission.program.owner,
            notification_type="evaluation_submitted",
            title="Evaluation submitted",
            message=f"A final evaluation has been submitted for {submission.reference_number or submission.title}.",
        )
        AuditService.log_action(actor=judge, action_type="score_submitted", target=submission, metadata={"score_sheet_id": str(score_sheet.id)})
        EvaluationService.aggregate_round(submission, evaluation_round)
        return score_sheet

    @staticmethod
    @transaction.atomic
    def lock_scores(*, score_sheet, actor):
        if score_sheet.status == ScoreSheetStatus.LOCKED:
            return score_sheet
        if not score_sheet.is_final and score_sheet.status != ScoreSheetStatus.SUBMITTED:
            raise ValidationError("Only final submitted evaluations can be locked.")
        score_sheet.status = ScoreSheetStatus.LOCKED
        score_sheet.save(update_fields=["status", "updated_at"])
        AuditService.log_action(actor=actor, action_type="score_locked", target=score_sheet.submission, metadata={"score_sheet_id": str(score_sheet.id)})
        return score_sheet

    @staticmethod
    def aggregate_round(submission, evaluation_round):
        submitted_qs = ScoreSheet.objects.filter(
            submission=submission,
            evaluation_round=evaluation_round,
            status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
            is_final=True,
        )
        if submitted_qs.count() < evaluation_round.required_judges:
            return None
        aggregate = submitted_qs.aggregate(avg=Avg("total_score"), min_score=Min("total_score"), max_score=Max("total_score"))
        variance = (aggregate["max_score"] or 0) - (aggregate["min_score"] or 0)
        if variance > evaluation_round.variance_threshold:
            ModerationRecord.objects.create(
                submission=submission,
                rationale="Variance threshold exceeded.",
                variance_detected=variance,
                adjustment_metadata={"average_score": str(aggregate["avg"])},
            )
        return aggregate



class ModerationService:
    @staticmethod
    @transaction.atomic
    def moderate(*, submission, actor, rationale, adjustment_metadata=None):
        record = ModerationRecord.objects.create(
            submission=submission,
            moderated_by=actor,
            rationale=rationale,
            adjustment_metadata=adjustment_metadata or {},
        )
        AuditService.log_action(actor=actor, action_type="score_moderated", target=submission, metadata={"moderation_id": str(record.id)})
        return record



class DecisionService:
    STATUS_MAP = {
        FinalDecisionType.APPROVED: SubmissionStatus.APPROVED,
        FinalDecisionType.REJECTED: SubmissionStatus.REJECTED,
        FinalDecisionType.FINALIST: SubmissionStatus.FINALIST,
        FinalDecisionType.WINNER: SubmissionStatus.WINNER,
        FinalDecisionType.SELECTED_FOR_HACKATHON: SubmissionStatus.SELECTED_FOR_HACKATHON,
        FinalDecisionType.CLOSED: SubmissionStatus.CLOSED,
    }

    @staticmethod
    @transaction.atomic
    def record_decision(*, submission, actor, decision, rationale, approved_by=None):
        if submission.current_status not in {
            SubmissionStatus.JUDGING_REVIEW,
            SubmissionStatus.SCREENING,
            SubmissionStatus.ASSIGNED_TO_JUDGES,
            SubmissionStatus.UNDER_JUDGING,
            SubmissionStatus.FINALIST,
            SubmissionStatus.APPROVED,
            SubmissionStatus.REJECTED,
            SubmissionStatus.WINNER,
        }:
            raise ValidationError("Submission is not ready for final decision.")
        record, _ = FinalDecision.objects.update_or_create(
            submission=submission,
            defaults={
                "decision": decision,
                "rationale": rationale,
                "decided_by": actor,
                "approved_by": approved_by,
            },
        )
        submission.final_decision = decision
        submission.save(update_fields=["final_decision", "updated_at"])
        target_status = DecisionService.STATUS_MAP[decision]
        if hasattr(submission, "workflow_instance"):
            if decision == FinalDecisionType.REJECTED:
                WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="reject", comment=rationale)
            else:
                instance = submission.workflow_instance
                next_step = WorkflowRuntimeService._next_step(instance)
                current_step_status = instance.current_step.submission_status if instance.current_step else None
                next_step_status = next_step.submission_status if next_step else None
                if next_step and next_step_status == target_status:
                    WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="approve", comment=rationale)
                elif not next_step and current_step_status == target_status:
                    WorkflowRuntimeService.perform_action(submission=submission, actor=actor, action="approve", comment=rationale)
                else:
                    raise ValidationError(
                        {"decision": f"The decision `{decision}` does not match the configured workflow path."}
                    )
        else:
            raise ValidationError("Final decisions require an active workflow instance.")
        CommunicationService.send_decision_notification(submission, decision, actor)
        NotificationService.notify(
            user=submission.innovator,
            notification_type=f"submission_{decision}",
            title="Submission outcome updated",
            message=f"Submission {submission.reference_number} is now marked as {decision.replace('_', ' ')}.",
            send_email=True,
        )
        AuditService.log_action(actor=actor, action_type="final_decision_recorded", target=submission, metadata={"decision": decision})
        return record



class RankingService:
    @staticmethod
    def program_ranking(program):
        rows = []
        for submission in program.submissions.prefetch_related("score_sheets").all():
            final_sheets = submission.score_sheets.filter(is_final=True, status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED])
            completed = final_sheets.count()
            average_score = sum(float(sheet.total_score) for sheet in final_sheets) / completed if completed else 0
            rows.append(
                {
                    "submission": submission,
                    "average_score": average_score,
                    "completed_evaluators": completed,
                    "reference_number": submission.reference_number or "",
                    "submitted_at": submission.submitted_at,
                }
            )
        rows.sort(key=lambda item: (-item["average_score"], item["submitted_at"] or datetime.max.replace(tzinfo=dt_timezone.utc), item["reference_number"]))
        for index, row in enumerate(rows, start=1):
            row["ranking_position"] = index
        return rows

    @staticmethod
    @transaction.atomic
    def generate_shortlist(*, program, actor, limit: int = 10, minimum_average_score=None, apply_workflow: bool = False):
        ranking = RankingService.program_ranking(program)
        selected = []
        for row in ranking:
            if minimum_average_score is not None and row["average_score"] < float(minimum_average_score):
                continue
            selected.append(row)
            if len(selected) >= limit:
                break
        results = []
        for row in selected:
            item = {"submission_id": str(row["submission"].id), "reference_number": row["submission"].reference_number, "average_score": row["average_score"], "completed_evaluators": row["completed_evaluators"], "ranking_position": row["ranking_position"], "workflow_applied": False}
            SubmissionOutcome.objects.filter(submission=row["submission"], is_current=True).exclude(outcome_type=SubmissionOutcomeType.SHORTLISTED, ranking_position=row["ranking_position"]).update(is_current=False)
            SubmissionOutcome.objects.get_or_create(
                submission=row["submission"],
                program=program,
                outcome_type=SubmissionOutcomeType.SHORTLISTED,
                ranking_position=row["ranking_position"],
                is_current=True,
                defaults={"decided_by": actor, "decision_step": getattr(getattr(row["submission"], "workflow_instance", None), "current_step", None), "decided_at": timezone.now(), "score_snapshot": {"average_score": row["average_score"], "completed_evaluators": row["completed_evaluators"]}, "rationale": "Deterministic shortlist generated from ranking."},
            )
            if apply_workflow and hasattr(row["submission"], "workflow_instance"):
                instance = row["submission"].workflow_instance
                next_step = WorkflowRuntimeService._next_step(instance)
                if next_step:
                    WorkflowRuntimeService.perform_action(submission=row["submission"], actor=actor, action="approve", comment="Advanced by deterministic shortlist generation.")
                    item["workflow_applied"] = True
                    item["advanced_to_step"] = next_step.name
            results.append(item)
        AuditService.log_action(actor=actor, action_type="program_shortlist_generated", target=program, metadata={"limit": limit, "minimum_average_score": minimum_average_score, "apply_workflow": apply_workflow})
        return results
