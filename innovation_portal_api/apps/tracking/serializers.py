from rest_framework import serializers

from apps.submissions.models import Submission
from apps.workflow.models import WorkflowActionLog


class PublicWorkflowActionSerializer(serializers.ModelSerializer):
    step_name = serializers.CharField(source="step.name", read_only=True)

    class Meta:
        model = WorkflowActionLog
        fields = ("action", "step_name", "timestamp")


class PublicSubmissionTrackingSerializer(serializers.ModelSerializer):
    submission_type = serializers.CharField(read_only=True)
    current_step = serializers.CharField(source="workflow_instance.current_step.name", read_only=True)
    workflow_status = serializers.CharField(source="workflow_instance.status", read_only=True)
    history = PublicWorkflowActionSerializer(source="workflow_instance.action_logs", many=True, read_only=True)
    applicant_action_required = serializers.SerializerMethodField()
    public_status = serializers.SerializerMethodField()
    expected_next_step = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            "reference_number",
            "submission_type",
            "current_status",
            "public_status",
            "submitted_at",
            "updated_at",
            "current_step",
            "expected_next_step",
            "workflow_status",
            "applicant_action_required",
            "history",
        )

    def get_applicant_action_required(self, obj):
        return hasattr(obj, "workflow_instance") and obj.workflow_instance.status == "returned"

    def get_public_status(self, obj):
        labels = {
            "submitted": "Received",
            "screening": "Under screening",
            "judging_review": "Under judging review",
            "under_review": "Under review",
            "requires_more_information": "Action needed from applicant",
            "returned": "Action needed from applicant",
            "shortlisted": "Shortlisted",
            "assigned_to_judges": "In judging queue",
            "under_judging": "Under judging",
            "approved": "Approved",
            "rejected": "Not selected",
            "finalist": "Finalist",
            "winner": "Winner",
            "closed": "Closed",
        }
        return labels.get(obj.current_status, obj.current_status.replace("_", " ").title())

    def get_expected_next_step(self, obj):
        step = getattr(getattr(obj, "workflow_instance", None), "current_step", None)
        if not step:
            return ""
        next_step = obj.workflow_instance.workflow_definition.steps.filter(order__gt=step.order, is_active=True).order_by("order").first()
        return next_step.name if next_step else ""
