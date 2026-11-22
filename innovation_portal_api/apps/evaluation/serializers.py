from rest_framework import serializers

from apps.assignments.models import Assignment
from apps.evaluation.models import (
    CriterionScore,
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


class RubricCriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = RubricCriterion
        fields = ("id", "name", "description", "weight", "min_score", "max_score", "ordering")


class RubricSerializer(serializers.ModelSerializer):
    criteria = RubricCriterionSerializer(many=True, read_only=True)

    class Meta:
        model = Rubric
        fields = ("id", "title", "program_type", "active", "version", "total_weight", "criteria")


class CriterionScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = CriterionScore
        fields = ("criterion", "raw_score", "weighted_score", "comment")
        read_only_fields = ("weighted_score",)


class ScoreSheetSerializer(serializers.ModelSerializer):
    criterion_scores = CriterionScoreSerializer(many=True)
    weighted_score = serializers.SerializerMethodField(help_text="Score out of 100, using the criteria weights.")

    class Meta:
        model = ScoreSheet
        fields = ("id", "submission", "judge", "evaluation_round", "status", "total_score", "weighted_score", "overall_comment", "is_final", "submitted_at", "criterion_scores")
        read_only_fields = ("judge", "status", "total_score", "submitted_at")

    def get_weighted_score(self, obj) -> float | None:
        from apps.evaluation.services import sheet_weighted_score

        return sheet_weighted_score(obj) if obj.pk else None


class SubmissionEvaluationSerializer(serializers.Serializer):
    criterion_scores = CriterionScoreSerializer(many=True)
    comment = serializers.CharField(required=False, allow_blank=True)
    submit = serializers.BooleanField(default=True)


class MyAssignedEvaluationSerializer(serializers.ModelSerializer):
    submission_id = serializers.UUIDField(source="submission.id", read_only=True)
    submission_title = serializers.CharField(source="submission.title", read_only=True)
    reference_number = serializers.CharField(source="submission.reference_number", read_only=True)
    current_status = serializers.CharField(source="submission.current_status", read_only=True)
    workflow_step = serializers.CharField(source="workflow_step.name", read_only=True)
    latest_score_sheet_id = serializers.SerializerMethodField()
    latest_score_status = serializers.SerializerMethodField()
    # R-42 (3.17): the challenge, the conflict answer and this judge's own score. Never other judges' names.
    assignment_id = serializers.UUIDField(source="id", read_only=True)
    program = serializers.SerializerMethodField()
    conflict = serializers.SerializerMethodField()
    my_score = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id",
            "assignment_id",
            "program",
            "conflict",
            "my_score",
            "submission_id",
            "submission_title",
            "reference_number",
            "current_status",
            "workflow_step",
            "status",
            "deadline",
            "latest_score_sheet_id",
            "latest_score_status",
        )

    def get_program(self, obj) -> dict:
        program = obj.submission.program
        return {"id": str(program.id), "title": program.title}

    def get_conflict(self, obj) -> str:
        """none, declared (POST /api/assignments/{id}/conflict/) or confirmed_none (POST .../accept/)."""
        if hasattr(obj, "conflict_declaration"):
            return "declared"
        from apps.programs.challenge_judging import AUTO_ACCEPT_NOTE

        acceptance = getattr(obj, "acceptance", None)
        # Challenge judges' assignments are accepted for them; only their own POST .../accept/ says "no conflict".
        if acceptance and acceptance.accepted and acceptance.response_note != AUTO_ACCEPT_NOTE:
            return "confirmed_none"
        return "none"

    def get_my_score(self, obj) -> float | None:
        from apps.evaluation.services import sheet_weighted_score

        sheet = obj.submission.score_sheets.filter(judge=obj.assignee).order_by("-is_final", "-updated_at").first()
        return sheet_weighted_score(sheet) if sheet else None

    def get_latest_score_sheet_id(self, obj):
        sheet = obj.submission.score_sheets.filter(judge=obj.assignee).order_by("-updated_at").first()
        return str(sheet.id) if sheet else None

    def get_latest_score_status(self, obj):
        sheet = obj.submission.score_sheets.filter(judge=obj.assignee).order_by("-updated_at").first()
        return sheet.status if sheet else "not_started"


class EvaluationLockSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True)


class ShortlistGenerationSerializer(serializers.Serializer):
    limit = serializers.IntegerField(min_value=1, default=10)
    minimum_average_score = serializers.DecimalField(max_digits=8, decimal_places=2, required=False)
    apply_workflow = serializers.BooleanField(default=False)


class ModerationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = ModerationRecord
        fields = "__all__"
        read_only_fields = ("moderated_by", "submission")


class FinalDecisionSerializer(serializers.ModelSerializer):
    class Meta:
        model = FinalDecision
        fields = "__all__"
        read_only_fields = ("decided_by", "approved_by", "submission")



def _validate_meanings(value):
    if not isinstance(value, list) or len(value) > 5:
        raise serializers.ValidationError("Give up to 5 meanings, one per score from 1 to 5.")
    cleaned = []
    for item in value:
        if isinstance(item, str):
            item = {"en": item}
        if not isinstance(item, dict) or set(item) - {"en", "tn"}:
            raise serializers.ValidationError('Each meaning is {"en": "...", "tn": "..."} or a plain English string.')
        cleaned.append({"en": str(item.get("en") or ""), "tn": str(item.get("tn") or "")})
    return cleaned


def _validate_comment_scores(value):
    if not isinstance(value, list) or any(isinstance(score, bool) or not isinstance(score, int) or not 1 <= score <= 5 for score in value):
        raise serializers.ValidationError("Use a list of scores from 1 to 5, for example [1, 5].")
    return sorted(set(value))


class MarkingCriteriaItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarkingCriteriaItem
        fields = (
            "id", "name", "description", "max_score", "min_score",
            "weight", "ordering", "comment_required_below",
            "score_meanings", "comment_required_scores", "library_item",
        )
        read_only_fields = ("id", "library_item")

    def validate_score_meanings(self, value):
        return _validate_meanings(value)

    def validate_comment_required_scores(self, value):
        return _validate_comment_scores(value)


class MarkingCriteriaSerializer(serializers.ModelSerializer):
    items = MarkingCriteriaItemSerializer(many=True, read_only=True)
    total_max_score = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = MarkingCriteria
        fields = ("id", "title", "description", "is_active", "is_library", "items", "total_max_score", "total_weight", "step_count", "created_at")
        read_only_fields = ("id", "created_at", "total_max_score", "total_weight", "step_count")

    total_weight = serializers.SerializerMethodField(help_text="Sum of item weights. Challenge criteria must add up to 100.")

    def get_total_weight(self, obj) -> float:
        return float(sum((item.weight for item in obj.items.all()), 0))

    def get_step_count(self, obj):
        return obj.stage_configs.count()


class MarkingCriteriaWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarkingCriteria
        fields = ("title", "description", "is_active", "is_library")



class StageCriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StageCriterion
        fields = (
            "id", "name", "description", "max_score", "min_score",
            "weight", "ordering", "comment_required_below",
            "score_meanings", "comment_required_scores",
        )
        read_only_fields = ("id",)

    def validate_score_meanings(self, value):
        return _validate_meanings(value)

    def validate_comment_required_scores(self, value):
        return _validate_comment_scores(value)


class StageEvaluationConfigSerializer(serializers.ModelSerializer):
    custom_criteria = StageCriterionSerializer(many=True, read_only=True)
    marking_criteria_detail = MarkingCriteriaSerializer(source="marking_criteria", read_only=True)
    effective_max_score = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    criteria_mode = serializers.CharField(read_only=True)

    class Meta:
        model = StageEvaluationConfig
        fields = (
            "id",
            "workflow_step",
            "marking_criteria",
            "marking_criteria_detail",
            "rubric",
            "required_reviewer_count",
            "review_mode",
            "review_window_hours",
            "minimum_reviews_required",
            "maximum_reviews_allowed",
            "aggregation_method",
            "threshold_reject_below",
            "threshold_pass_above",
            "blind_scoring",
            "allow_applicant_feedback",
            "max_score_override",
            "effective_max_score",
            "criteria_mode",
            "custom_criteria",
        )
        read_only_fields = ("id", "created_by", "effective_max_score", "criteria_mode", "custom_criteria", "marking_criteria_detail")


class StageEvaluationConfigWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = StageEvaluationConfig
        fields = (
            "marking_criteria",
            "rubric",
            "required_reviewer_count",
            "review_mode",
            "review_window_hours",
            "minimum_reviews_required",
            "maximum_reviews_allowed",
            "aggregation_method",
            "threshold_reject_below",
            "threshold_pass_above",
            "blind_scoring",
            "allow_applicant_feedback",
            "max_score_override",
        )



class ReviewCycleSerializer(serializers.ModelSerializer):
    completed_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = ReviewCycle
        fields = (
            "id",
            "submission",
            "workflow_step",
            "stage_config",
            "cycle_number",
            "status",
            "outcome",
            "aggregate_score",
            "aggregate_pct",
            "closes_at",
            "closed_at",
            "decision_note",
            "extended_count",
            "last_extended_by",
            "last_extended_at",
            "extension_reason",
            "completed_count",
        )
        read_only_fields = fields



class CycleScoreItemSerializer(serializers.Serializer):
    criterion_id = serializers.UUIDField()
    type = serializers.ChoiceField(choices=["rubric", "stage", "library"])
    raw_score = serializers.DecimalField(max_digits=8, decimal_places=2)
    comment = serializers.CharField(required=False, allow_blank=True, default="")


class SaveCycleScoresSerializer(serializers.Serializer):
    scores = CycleScoreItemSerializer(many=True)
    overall_comment = serializers.CharField(required=False, allow_blank=True, default="")
