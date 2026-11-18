from django.utils import timezone
from rest_framework import serializers

from apps.assignments.models import Assignment, ConflictOfInterestDeclaration, SpecialistInvitation
from apps.core.constants import RoleType, AssignmentRoleType, AssignmentStatus, ScoreSheetStatus
from apps.evaluation.models import ReviewCycle, ScoreSheet
from apps.submissions.models import Submission
from apps.workflow.models import TaskExecution


def build_current_submission_snapshot(submission):
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
            "id": str(submission.program_id) if submission.program_id else None,
            "title": getattr(getattr(submission, "program", None), "title", ""),
        },
        "applicant": {
            "id": str(submission.innovator_id) if submission.innovator_id else None,
            "name": getattr(getattr(submission, "innovator", None), "full_name", ""),
            "email": getattr(getattr(submission, "innovator", None), "email", ""),
        },
        "responses": responses,
    }


MANAGER_SOURCE_STEPS = {
    "innovation_manager_review": "officer_review",
    "committee_manager_review": "committee_review",
}


def _score_sheet_snapshot(scorecard):
    scores = sorted(
        scorecard.criterion_scores.all(),
        key=lambda item: (
            getattr(item.criterion, "ordering", None)
            or getattr(item.stage_criterion, "ordering", None)
            or getattr(item.marking_criteria_item, "ordering", None)
            or 0,
            item.criterion_name,
        ),
    )
    max_score = sum((score.criterion_max_score for score in scores), start=0)
    percentage = None
    if max_score:
        percentage = (scorecard.total_score / max_score) * 100

    submission_snapshot = scorecard.submission_snapshot or build_current_submission_snapshot(scorecard.submission)
    return {
        "id": str(scorecard.id),
        "review_cycle_id": str(scorecard.review_cycle_id) if scorecard.review_cycle_id else None,
        "cycle_number": scorecard.review_cycle.cycle_number if scorecard.review_cycle_id else None,
        "reviewer_name": scorecard.judge.full_name,
        "reviewer_email": scorecard.judge.email,
        "status": scorecard.status,
        "total_score": scorecard.total_score,
        "max_score": max_score,
        "percentage": percentage,
        "overall_comment": scorecard.overall_comment,
        "submitted_at": scorecard.submitted_at,
        "submission_snapshot": submission_snapshot,
        "submission_snapshot_source": submission_snapshot.get("_snapshot_source") or ("stored" if scorecard.submission_snapshot else "current_backfill"),
        "scores": [
            {
                "id": str(score.id),
                "criterion_name": score.criterion_name,
                "raw_score": score.raw_score,
                "max_score": score.criterion_max_score,
                "comment": score.comment,
            }
            for score in scores
        ],
    }


class AssignmentSerializer(serializers.ModelSerializer):
    assignee_name = serializers.CharField(source="assignee.full_name", read_only=True)
    assigned_by_name = serializers.CharField(source="assigned_by.full_name", read_only=True)
    submission_reference_number = serializers.CharField(source="submission.reference_number", read_only=True)
    submission_title = serializers.CharField(source="submission.title", read_only=True)
    workflow_step_name = serializers.CharField(source="workflow_step.name", read_only=True)
    workflow_step_code = serializers.CharField(source="workflow_step.code", read_only=True)
    responded_at = serializers.DateTimeField(source="acceptance.responded_at", read_only=True)
    response_note = serializers.CharField(source="acceptance.response_note", read_only=True)
    previous_assignment_id = serializers.UUIDField(read_only=True)
    scorecard_snapshot = serializers.SerializerMethodField()

    class Meta:
        model = Assignment
        fields = (
            "id",
            "submission",
            "submission_reference_number",
            "submission_title",
            "workflow_step",
            "workflow_step_name",
            "workflow_step_code",
            "assignee",
            "assignee_name",
            "previous_assignment_id",
            "role_type",
            "assigned_by",
            "assigned_by_name",
            "assigned_at",
            "responded_at",
            "response_note",
            "deadline",
            "reassigned_at",
            "completed_at",
            "status",
            "panel",
            "scorecard_snapshot",
        )
        read_only_fields = ("assigned_by", "assigned_at", "status")

    def get_scorecard_snapshot(self, obj):
        if obj.status not in {AssignmentStatus.COMPLETED, AssignmentStatus.REASSIGNED}:
            return None
        if not obj.workflow_step_id:
            return None

        queryset = (
            ScoreSheet.objects.filter(
                submission=obj.submission,
                judge=obj.assignee,
                review_cycle__workflow_step=obj.workflow_step,
                status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
                is_final=True,
            )
            .select_related("review_cycle", "judge")
            .prefetch_related(
                "criterion_scores__criterion",
                "criterion_scores__stage_criterion",
                "criterion_scores__marking_criteria_item",
            )
        )

        completed_at = obj.completed_at or obj.reassigned_at
        if completed_at:
            scorecard = queryset.filter(
                submitted_at__lte=completed_at + timezone.timedelta(minutes=5)
            ).order_by("-submitted_at", "-created_at").first()
        else:
            scorecard = None

        if scorecard is None:
            scorecard = queryset.order_by("-submitted_at", "-created_at").first()
        if scorecard is None:
            return self._manager_decision_snapshot(obj)

        snapshot = _score_sheet_snapshot(scorecard)
        snapshot.update({
            "assignment_id": str(obj.id),
            "type": "scorecard",
        })
        return snapshot

    def _manager_decision_snapshot(self, obj):
        task = (
            TaskExecution.objects
            .filter(assignment=obj)
            .select_related("assignee", "workflow_step")
            .order_by("-completed_at", "-updated_at")
            .first()
        )
        if not task and obj.role_type != AssignmentRoleType.MANAGER:
            return None

        completed_at = getattr(task, "completed_at", None) or obj.completed_at or obj.reassigned_at
        source_step_code = MANAGER_SOURCE_STEPS.get(getattr(obj.workflow_step, "code", ""))
        source_cycle = None
        if source_step_code:
            cycle_qs = (
                ReviewCycle.objects
                .filter(
                    submission=obj.submission,
                    workflow_step__code=source_step_code,
                    status=ReviewCycle.STATUS_COMPLETED,
                )
                .select_related("workflow_step")
                .order_by("-closed_at", "-updated_at", "-created_at")
            )
            if completed_at:
                source_cycle = cycle_qs.filter(closed_at__lte=completed_at + timezone.timedelta(minutes=5)).first()
            source_cycle = source_cycle or cycle_qs.first()

        source_scorecards = []
        submission_snapshot = build_current_submission_snapshot(obj.submission)
        max_score = 0
        if source_cycle:
            sheets = (
                ScoreSheet.objects
                .filter(
                    review_cycle=source_cycle,
                    status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
                    is_final=True,
                )
                .select_related("review_cycle", "judge")
                .prefetch_related(
                    "criterion_scores__criterion",
                    "criterion_scores__stage_criterion",
                    "criterion_scores__marking_criteria_item",
                )
                .order_by("submitted_at", "created_at")
            )
            source_scorecards = [_score_sheet_snapshot(sheet) for sheet in sheets]
            if source_scorecards:
                submission_snapshot = source_scorecards[0].get("submission_snapshot") or submission_snapshot
                max_score = source_scorecards[0].get("max_score") or 0

        aggregate_score = source_cycle.aggregate_score if source_cycle else None
        aggregate_pct = source_cycle.aggregate_pct if source_cycle else None
        aggregate_outcome = source_cycle.outcome if source_cycle else None
        effective_outcome = getattr(task, "outcome", "") if task else ""
        if effective_outcome == "approve" and aggregate_outcome:
            effective_outcome = {
                ReviewCycle.OUTCOME_PASS: "approve",
                ReviewCycle.OUTCOME_RETURN: "return",
                ReviewCycle.OUTCOME_REJECT: "screen_out" if source_step_code == "officer_review" else "reject",
            }.get(aggregate_outcome, effective_outcome)

        return {
            "type": "manager_decision",
            "assignment_id": str(obj.id),
            "reviewer_name": getattr(obj.assignee, "full_name", ""),
            "reviewer_email": getattr(obj.assignee, "email", ""),
            "reviewer_role": obj.get_role_type_display() if hasattr(obj, "get_role_type_display") else obj.role_type,
            "workflow_step_code": getattr(obj.workflow_step, "code", ""),
            "workflow_step_name": getattr(obj.workflow_step, "name", ""),
            "action": getattr(task, "outcome", "") if task else "",
            "effective_outcome": effective_outcome,
            "comment": getattr(task, "comment", "") if task else "",
            "submitted_at": completed_at,
            "total_score": aggregate_score,
            "max_score": max_score,
            "percentage": aggregate_pct,
            "submission_snapshot": submission_snapshot,
            "submission_snapshot_source": submission_snapshot.get("_snapshot_source", "current_backfill"),
            "source_review": {
                "step_code": source_step_code,
                "step_name": getattr(getattr(source_cycle, "workflow_step", None), "name", "") if source_cycle else "",
                "cycle_number": source_cycle.cycle_number if source_cycle else None,
                "aggregate": {
                    "score": aggregate_score,
                    "pct": aggregate_pct,
                    "outcome": aggregate_outcome,
                    "completed_reviews": len(source_scorecards),
                },
                "scorecards": source_scorecards,
            } if source_cycle else None,
        }


class ConflictSerializer(serializers.ModelSerializer):
    class Meta:
        model = ConflictOfInterestDeclaration
        fields = ("id", "conflict_details", "resolved")
        read_only_fields = ("resolved",)


class SubmissionAssignmentActionSerializer(serializers.Serializer):
    assignee = serializers.UUIDField(required=False)
    role_type = serializers.ChoiceField(choices=Assignment._meta.get_field("role_type").choices, required=False)
    deadline = serializers.DateTimeField(required=False)
    action = serializers.ChoiceField(choices=("assign", "reassign", "unassign"), default="assign")
    assignment_id = serializers.UUIDField(required=False)


class ReviewerQueueItemSerializer(serializers.ModelSerializer):
    current_step = serializers.CharField(source="workflow_instance.current_step.name", read_only=True)
    workflow_status = serializers.CharField(source="workflow_instance.status", read_only=True)
    active_assignments = serializers.SerializerMethodField()
    required_assignments = serializers.IntegerField(source="workflow_instance.current_step.minimum_assignments", read_only=True)
    requires_evaluation = serializers.BooleanField(source="workflow_instance.current_step.requires_evaluation", read_only=True)
    slots_remaining = serializers.SerializerMethodField()
    can_claim = serializers.SerializerMethodField()
    my_assignment_id = serializers.SerializerMethodField()
    assignment_role = serializers.CharField(source="workflow_instance.current_step.assignment_role", read_only=True)
    requires_invitation = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            "id",
            "reference_number",
            "title",
            "current_status",
            "current_step",
            "workflow_status",
            "required_assignments",
            "requires_evaluation",
            "active_assignments",
            "slots_remaining",
            "can_claim",
            "my_assignment_id",
            "assignment_role",
            "requires_invitation",
        )

    def get_active_assignments(self, obj):
        current_step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        qs = obj.assignments.filter(workflow_step=current_step, status__in=["assigned", "accepted", "completed"]).select_related("assignee")
        return [
            {
                "assignment_id": str(item.id),
                "assignee_id": str(item.assignee_id),
                "assignee_name": item.assignee.full_name,
                "role_type": item.role_type,
                "status": item.status,
            }
            for item in qs
        ]

    def get_slots_remaining(self, obj):
        current_step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        required = int(getattr(current_step, "minimum_assignments", 0) or 0)
        try:
            from apps.evaluation.models import StageEvaluationConfig

            config = getattr(current_step, "evaluation_config", None)
            if (
                current_step
                and current_step.requires_evaluation
                and config
                and config.review_mode == StageEvaluationConfig.REVIEW_MODE_TIME_WINDOW
            ):
                required = int(config.maximum_reviews_allowed or required or 20)
        except Exception:
            pass
        remaining = required - len(self.get_active_assignments(obj))
        return remaining if remaining > 0 else 0

    def get_my_assignment_id(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        if not user or not user.is_authenticated:
            return None
        current_step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        assignment = obj.assignments.filter(
            workflow_step=current_step,
            assignee=user,
            status__in=["assigned", "accepted", "completed"],
        ).first()
        return str(assignment.id) if assignment else None

    def get_requires_invitation(self, obj):
        current_step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        if not current_step:
            return False
        return current_step.assignment_role == AssignmentRoleType.SPECIALIST

    def get_can_claim(self, obj):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        current_step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        if not user or not user.is_authenticated or not current_step:
            return False
        if not current_step.requires_assignment:
            return False
        if current_step.assignment_role == AssignmentRoleType.SPECIALIST:
            return False
        if current_step.assignment_role not in AssignmentRoleType.values:
            return False
        if self.get_slots_remaining(obj) <= 0:
            return False
        if self.get_my_assignment_id(obj):
            return False
        if user.is_superuser:
            return True
        from apps.assignments.services import AssignmentService
        eligible_codes = AssignmentService.ROLE_ELIGIBILITY_MAP.get(
            current_step.assignment_role, []
        )
        user_codes = set(
            user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)
        )
        return bool(user_codes & set(eligible_codes))


class SpecialistInvitationSerializer(serializers.ModelSerializer):
    invited_by_name = serializers.CharField(source="invited_by.full_name", read_only=True)
    accepted_by_name = serializers.CharField(source="accepted_by.full_name", read_only=True)
    is_expired = serializers.BooleanField(read_only=True)
    submission_title = serializers.CharField(source="submission.title", read_only=True)
    program_title = serializers.CharField(source="submission.program.title", read_only=True)

    class Meta:
        model = SpecialistInvitation
        fields = (
            "id", "submission", "submission_title", "program_title",
            "workflow_step", "invited_by", "invited_by_name",
            "invitee_email", "invitee_name", "message", "required_review_count",
            "token", "status", "expires_at", "is_expired",
            "accepted_by", "accepted_by_name", "assignment",
            "created_at", "updated_at",
        )
        read_only_fields = (
            "id", "token", "status", "accepted_by", "assignment",
            "created_at", "updated_at",
        )


class InviteSpecialistSerializer(serializers.Serializer):
    invitee_email   = serializers.EmailField()
    invitee_name    = serializers.CharField(max_length=255)
    message         = serializers.CharField(required=False, allow_blank=True, default="")
    workflow_step   = serializers.UUIDField(required=False, allow_null=True)
    required_review_count = serializers.IntegerField(required=False, default=1, min_value=1, max_value=10)
    expires_in_days = serializers.IntegerField(required=False, default=7, min_value=1, max_value=30)
