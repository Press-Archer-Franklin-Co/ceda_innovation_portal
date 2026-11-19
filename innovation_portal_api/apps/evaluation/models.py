from decimal import Decimal

from django.conf import settings
from django.db import models
from django.db.models import Sum

from apps.core.constants import FinalDecisionType, ScoreSheetStatus
from apps.core.models import TimeStampedModel, UUIDModel



class MarkingCriteria(UUIDModel, TimeStampedModel):
    """
    A reusable, named set of scoring items that can be linked to any number
    of workflow steps across different programmes and workflow definitions.

    Admin creates criteria once in the library; step owners link to it.
    Editing a MarkingCriteria after it has been used is safe — historical
    ReviewCycle records snapshot the config at creation time via stage_config FK.
    """
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="marking_criteria_created",
    )
    is_library = models.BooleanField(default=False, db_index=True, help_text="Shared library set: its items can be ticked into any challenge.")

    class Meta:
        ordering = ("title",)
        verbose_name_plural = "Marking criteria"

    def __str__(self):
        return self.title

    @property
    def total_max_score(self) -> Decimal:
        total = self.items.aggregate(total=Sum("max_score"))["total"]
        return total if total else Decimal("100")


class MarkingCriteriaItem(UUIDModel, TimeStampedModel):
    """One scoring item within a MarkingCriteria template."""
    criteria = models.ForeignKey(
        MarkingCriteria,
        on_delete=models.CASCADE,
        related_name="items",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, help_text="Guidance shown to the reviewer.")
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    min_score = models.DecimalField(max_digits=5, decimal_places=2, default=Decimal("0"))
    weight = models.DecimalField(max_digits=8, decimal_places=2, default=Decimal("1.00"))
    ordering = models.PositiveIntegerField(default=1)
    comment_required_below = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Require a comment when the raw score falls below this threshold.",
    )
    score_meanings = models.JSONField(default=list, blank=True, help_text='What each score 1 to 5 means: [{"en": "...", "tn": "..."}] x5')
    comment_required_scores = models.JSONField(default=list, blank=True, help_text="Scores that need a comment, e.g. [1, 5].")
    library_item = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="copies", help_text="The library item this was copied from.")

    class Meta:
        ordering = ("ordering",)

    def __str__(self):
        return f"{self.name} (max {self.max_score})"



class Rubric(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    program_type = models.ForeignKey("programs.ProgramType", on_delete=models.PROTECT, related_name="rubrics")
    active = models.BooleanField(default=True)
    version = models.PositiveIntegerField(default=1)
    total_weight = models.DecimalField(max_digits=8, decimal_places=2, default=0)


class RubricVersion(UUIDModel, TimeStampedModel):
    rubric = models.ForeignKey(Rubric, on_delete=models.CASCADE, related_name="versions")
    version = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict, blank=True)


class RubricCriterion(UUIDModel, TimeStampedModel):
    rubric = models.ForeignKey(Rubric, on_delete=models.CASCADE, related_name="criteria")
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    weight = models.DecimalField(max_digits=8, decimal_places=2)
    min_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    max_score = models.DecimalField(max_digits=5, decimal_places=2)
    ordering = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("ordering",)


class EvaluationRound(UUIDModel, TimeStampedModel):
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="evaluation_rounds")
    rubric = models.ForeignKey(Rubric, on_delete=models.PROTECT, related_name="evaluation_rounds")
    name = models.CharField(max_length=255)
    required_judges = models.PositiveIntegerField(default=3)
    variance_threshold = models.DecimalField(max_digits=5, decimal_places=2, default=15)
    active = models.BooleanField(default=True)



class StageEvaluationConfig(UUIDModel, TimeStampedModel):
    """
    Per-workflow-step scoring configuration.

    An administrator attaches this to a WorkflowStep to enable criteria-based
    scoring for that review stage.  The config defines:
      - which rubric template to use (or leaves it blank for custom criteria below)
      - how many independent reviewers are required
      - how scores are aggregated (average / min / max / median)
      - threshold bands that drive automatic workflow outcome decisions
      - whether reviewer blindness is enforced before score submission
    """

    AGGREGATION_AVERAGE = "average"
    AGGREGATION_MIN = "min"
    AGGREGATION_MAX = "max"
    AGGREGATION_MEDIAN = "median"
    AGGREGATION_CHOICES = (
        (AGGREGATION_AVERAGE, "Average"),
        (AGGREGATION_MIN, "Minimum"),
        (AGGREGATION_MAX, "Maximum"),
        (AGGREGATION_MEDIAN, "Median"),
    )
    REVIEW_MODE_FIXED_COUNT = "fixed_count"
    REVIEW_MODE_TIME_WINDOW = "time_window"
    REVIEW_MODE_CHOICES = (
        (REVIEW_MODE_FIXED_COUNT, "Fixed reviewer count"),
        (REVIEW_MODE_TIME_WINDOW, "Timed review window"),
    )

    workflow_step = models.OneToOneField(
        "workflow.WorkflowStep",
        on_delete=models.CASCADE,
        related_name="evaluation_config",
    )
    marking_criteria = models.ForeignKey(
        MarkingCriteria,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_configs",
        help_text="Reusable marking criteria from the library. Preferred over custom criteria.",
    )
    rubric = models.ForeignKey(
        Rubric,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_configs",
        help_text="Legacy: reuse a programme-level rubric template.",
    )
    required_reviewer_count = models.PositiveIntegerField(
        default=1,
        help_text="Number of independent reviewers required before a decision is made.",
    )
    review_mode = models.CharField(
        max_length=20,
        choices=REVIEW_MODE_CHOICES,
        default=REVIEW_MODE_FIXED_COUNT,
    )
    review_window_hours = models.PositiveIntegerField(
        default=0,
        help_text="For timed review windows, number of hours before the cycle closes.",
    )
    minimum_reviews_required = models.PositiveIntegerField(
        default=1,
        help_text="For timed review windows, minimum submitted reviews needed before auto-decision.",
    )
    maximum_reviews_allowed = models.PositiveIntegerField(
        null=True,
        blank=True,
        help_text="For timed review windows, maximum reviewers that may claim this step.",
    )
    aggregation_method = models.CharField(
        max_length=20,
        choices=AGGREGATION_CHOICES,
        default=AGGREGATION_AVERAGE,
    )
    threshold_reject_below = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("40.00"),
        help_text="Aggregate score % strictly below this value → automatic rejection.",
    )
    threshold_pass_above = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal("70.00"),
        help_text="Aggregate score % at or above this value → advance to next stage. Between reject and pass → return for correction.",
    )
    blind_scoring = models.BooleanField(
        default=True,
        help_text="Prevent reviewers from seeing peer scores before submitting their own.",
    )
    allow_applicant_feedback = models.BooleanField(
        default=True,
        help_text="Allow applicants to see criterion-level feedback after a decision.",
    )
    max_score_override = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="stage_configs_created",
    )

    @property
    def effective_max_score(self) -> Decimal:
        """Max possible aggregate score for percentage calculation."""
        if self.max_score_override:
            return self.max_score_override
        if self.rubric_id:
            return self.rubric.total_weight or Decimal("100")
        if self.marking_criteria_id:
            return self.marking_criteria.total_max_score
        total = self.custom_criteria.aggregate(total=Sum("max_score"))["total"]
        return total if total else Decimal("100")

    @property
    def effective_criteria(self):
        """Return the active criteria objects for this stage.

        Resolution order:
          1. Linked MarkingCriteria from the library (preferred, reusable)
          2. Legacy Rubric template (programme-level)
          3. Custom per-step StageCriterion records (fallback)
        """
        if self.marking_criteria_id:
            return list(self.marking_criteria.items.all())
        if self.rubric_id:
            return list(self.rubric.criteria.all())
        return list(self.custom_criteria.all())

    @property
    def criteria_mode(self) -> str:
        """Return which criteria source is active for this stage."""
        if self.marking_criteria_id:
            return "library"
        if self.rubric_id:
            return "rubric"
        if self.custom_criteria.exists():
            return "custom"
        return "none"

    def __str__(self):
        return f"EvalConfig for {self.workflow_step}"


class StageCriterion(UUIDModel, TimeStampedModel):
    """
    Custom scoring criterion defined for a specific stage
    (not inherited from a global rubric template).
    """

    stage_config = models.ForeignKey(
        StageEvaluationConfig,
        on_delete=models.CASCADE,
        related_name="custom_criteria",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, help_text="Guidance shown to the reviewer.")
    max_score = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        help_text="Maximum score a reviewer can award for this criterion.",
    )
    min_score = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    weight = models.DecimalField(
        max_digits=8,
        decimal_places=2,
        default=Decimal("1.00"),
        help_text="Weight for weighted-average aggregation.",
    )
    ordering = models.PositiveIntegerField(default=1)
    comment_required_below = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Require a reviewer comment when the raw score falls below this threshold.",
    )
    score_meanings = models.JSONField(default=list, blank=True, help_text='What each score 1 to 5 means: [{"en": "...", "tn": "..."}] x5')
    comment_required_scores = models.JSONField(default=list, blank=True, help_text="Scores that need a comment, e.g. [1, 5].")

    class Meta:
        ordering = ("ordering",)

    def __str__(self):
        return f"{self.name} (max {self.max_score})"



class ReviewCycle(UUIDModel, TimeStampedModel):
    """
    Tracks one complete round of peer review for a submission at a specific
    workflow step.

    A new ReviewCycle is opened when:
      - A submission first reaches a scoring-enabled step.
      - A submission is returned for correction and the applicant resubmits.

    This model is the single source of truth for:
      - how many reviews have been collected in this round
      - the aggregated outcome score
      - the automated workflow decision derived from threshold comparison
    """

    STATUS_OPEN = "open"
    STATUS_COMPLETED = "completed"
    STATUS_NEEDS_ATTENTION = "needs_attention"
    STATUS_CANCELLED = "cancelled"
    STATUS_CHOICES = (
        (STATUS_OPEN, "Open"),
        (STATUS_COMPLETED, "Completed"),
        (STATUS_NEEDS_ATTENTION, "Needs Attention"),
        (STATUS_CANCELLED, "Cancelled"),
    )

    OUTCOME_PENDING = "pending"
    OUTCOME_PASS = "pass"
    OUTCOME_RETURN = "return_for_correction"
    OUTCOME_REJECT = "reject"
    OUTCOME_CHOICES = (
        (OUTCOME_PENDING, "Pending"),
        (OUTCOME_PASS, "Pass / Advance"),
        (OUTCOME_RETURN, "Return for Correction"),
        (OUTCOME_REJECT, "Reject"),
    )

    submission = models.ForeignKey(
        "submissions.Submission",
        on_delete=models.CASCADE,
        related_name="review_cycles",
    )
    workflow_step = models.ForeignKey(
        "workflow.WorkflowStep",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_cycles",
    )
    stage_config = models.ForeignKey(
        StageEvaluationConfig,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_cycles",
    )
    cycle_number = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_OPEN)
    outcome = models.CharField(max_length=30, choices=OUTCOME_CHOICES, default=OUTCOME_PENDING)
    aggregate_score = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    aggregate_pct = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Aggregate score as a percentage of max possible score.",
    )
    closes_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    decision_note = models.TextField(blank=True)
    extended_count = models.PositiveIntegerField(default=0)
    last_extended_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="review_cycles_extended",
    )
    last_extended_at = models.DateTimeField(null=True, blank=True)
    extension_reason = models.TextField(blank=True)

    class Meta:
        ordering = ("submission", "cycle_number")
        constraints = [
            models.UniqueConstraint(
                fields=["submission", "workflow_step", "cycle_number"],
                name="uq_review_cycle_per_step",
            )
        ]

    def __str__(self):
        return f"Cycle #{self.cycle_number} — {self.submission} @ {self.workflow_step}"

    @property
    def completed_scorecards(self):
        return self.scorecards.filter(
            status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
            is_final=True,
        )

    @property
    def completed_count(self):
        return self.completed_scorecards.count()



class ScoreSheet(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="score_sheets")
    judge = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="score_sheets")
    evaluation_round = models.ForeignKey(EvaluationRound, on_delete=models.CASCADE, related_name="score_sheets", null=True, blank=True)
    review_cycle = models.ForeignKey(
        ReviewCycle,
        on_delete=models.CASCADE,
        related_name="scorecards",
        null=True,
        blank=True,
    )
    status = models.CharField(max_length=20, choices=ScoreSheetStatus.choices, default=ScoreSheetStatus.DRAFT)
    total_score = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    overall_comment = models.TextField(blank=True)
    submission_snapshot = models.JSONField(default=dict, blank=True)
    is_final = models.BooleanField(default=False)
    submitted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["submission", "judge", "evaluation_round"],
                condition=models.Q(review_cycle__isnull=True) & models.Q(evaluation_round__isnull=False),
                name="uq_scoresheet_legacy",
            ),
            models.UniqueConstraint(
                fields=["submission", "judge", "review_cycle"],
                condition=models.Q(review_cycle__isnull=False),
                name="uq_scoresheet_per_cycle",
            ),
        ]


class CriterionScore(UUIDModel, TimeStampedModel):
    score_sheet = models.ForeignKey(ScoreSheet, on_delete=models.CASCADE, related_name="criterion_scores")
    criterion = models.ForeignKey(
        RubricCriterion,
        on_delete=models.CASCADE,
        related_name="criterion_scores",
        null=True,
        blank=True,
    )
    stage_criterion = models.ForeignKey(
        StageCriterion,
        on_delete=models.CASCADE,
        related_name="criterion_scores",
        null=True,
        blank=True,
    )
    marking_criteria_item = models.ForeignKey(
        MarkingCriteriaItem,
        on_delete=models.CASCADE,
        related_name="criterion_scores",
        null=True,
        blank=True,
    )
    raw_score = models.DecimalField(max_digits=8, decimal_places=2)
    weighted_score = models.DecimalField(max_digits=8, decimal_places=2)
    comment = models.TextField(blank=True)
    criterion_name_snapshot = models.CharField(max_length=255, blank=True)
    criterion_max_score_snapshot = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["score_sheet", "criterion"],
                condition=models.Q(criterion__isnull=False),
                name="uq_criterion_score_rubric",
            ),
            models.UniqueConstraint(
                fields=["score_sheet", "stage_criterion"],
                condition=models.Q(stage_criterion__isnull=False),
                name="uq_criterion_score_stage",
            ),
            models.UniqueConstraint(
                fields=["score_sheet", "marking_criteria_item"],
                condition=models.Q(marking_criteria_item__isnull=False),
                name="uq_criterion_score_library",
            ),
        ]

    @property
    def criterion_name(self):
        if self.criterion_name_snapshot:
            return self.criterion_name_snapshot
        if self.criterion_id:
            return self.criterion.name
        if self.stage_criterion_id:
            return self.stage_criterion.name
        if self.marking_criteria_item_id:
            return self.marking_criteria_item.name
        return ""

    @property
    def criterion_max_score(self):
        if self.criterion_max_score_snapshot is not None:
            return self.criterion_max_score_snapshot
        if self.criterion_id:
            return self.criterion.max_score
        if self.stage_criterion_id:
            return self.stage_criterion.max_score
        if self.marking_criteria_item_id:
            return self.marking_criteria_item.max_score
        return Decimal("0")


class JudgeComment(UUIDModel, TimeStampedModel):
    score_sheet = models.ForeignKey(ScoreSheet, on_delete=models.CASCADE, related_name="judge_comments")
    comment = models.TextField()


class ModerationRecord(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="moderation_records")
    moderated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    rationale = models.TextField()
    variance_detected = models.DecimalField(max_digits=8, decimal_places=2, default=0)
    adjustment_metadata = models.JSONField(default=dict, blank=True)


class FinalDecision(UUIDModel, TimeStampedModel):
    submission = models.OneToOneField("submissions.Submission", on_delete=models.CASCADE, related_name="decision_record")
    decision = models.CharField(max_length=40, choices=FinalDecisionType.choices)
    rationale = models.TextField()
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="decisions_made")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="decisions_approved")
    decided_at = models.DateTimeField(auto_now_add=True)
