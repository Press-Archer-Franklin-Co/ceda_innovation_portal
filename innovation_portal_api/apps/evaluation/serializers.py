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

    class Meta:
        model = ScoreSheet
        fields = ("id", "submission", "judge", "evaluation_round", "status", "total_score", "overall_comment", "is_final", "submitted_at", "criterion_scores")
        read_only_fields = ("judge", "status", "total_score", "submitted_at")


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

    class Meta:
        model = Assignment
        fields = (
            "id",
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



class MarkingCriteriaItemSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarkingCriteriaItem
        fields = (
            "id", "name", "description", "max_score", "min_score",
            "weight", "ordering", "comment_required_below",
        )
        read_only_fields = ("id",)


class MarkingCriteriaSerializer(serializers.ModelSerializer):
    items = MarkingCriteriaItemSerializer(many=True, read_only=True)
    total_max_score = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    step_count = serializers.SerializerMethodField()

    class Meta:
        model = MarkingCriteria
        fields = ("id", "title", "description", "is_active", "items", "total_max_score", "step_count", "created_at")
        read_only_fields = ("id", "created_at", "total_max_score", "step_count")

    def get_step_count(self, obj):
        return obj.stage_configs.count()


class MarkingCriteriaWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = MarkingCriteria
        fields = ("title", "description", "is_active")



class StageCriterionSerializer(serializers.ModelSerializer):
    class Meta:
        model = StageCriterion
        fields = (
            "id", "name", "description", "max_score", "min_score",
            "weight", "ordering", "comment_required_below",
        )
        read_only_fields = ("id",)


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
