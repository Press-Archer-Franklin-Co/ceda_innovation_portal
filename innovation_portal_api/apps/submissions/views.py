from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from django.utils import timezone

from apps.submissions.openapi import TRACKING as TRACKING_DOC
from apps.assignments.models import Assignment
from apps.assignments.serializers import AssignmentSerializer, SubmissionAssignmentActionSerializer
from apps.assignments.services import AssignmentService
from apps.accounts.models import User
from apps.accounts.services import UserVerificationService
from apps.core.api import api_success
from apps.core.constants import RoleType
from apps.core.permissions import HasCapability, IsOfficerOrAdmin, IsStaffWorker
from apps.evaluation.models import ScoreSheet
from apps.evaluation.selectors import EvaluationSelector
from apps.evaluation.serializers import ScoreSheetSerializer, SubmissionEvaluationSerializer
from apps.evaluation.services import EvaluationService
from apps.submissions.draft_services import ApplicationDraftService
from apps.submissions.models import ApplicationDraft, Submission, SubmissionFeedbackSnapshot
from apps.submissions.selectors import SubmissionSelector
from apps.submissions.serializers import (
    ApplicationDraftSerializer,
    SubmissionInternalNoteSerializer,
    SubmissionOutcomeSerializer,
    SubmissionSerializer,
    SubmissionStatusHistorySerializer,
)
from apps.submissions.services import SubmissionService
from apps.submissions.timeline import SubmissionTimelineService
from apps.workflow.serializers import (
    TaskExecutionSerializer,
    WorkflowActionLogSerializer,
    WorkflowActionRequestSerializer,
    WorkflowCurrentStateSerializer,
)
from apps.workflow.services import WorkflowRuntimeService


@extend_schema_view(
    list=extend_schema(tags=["Submissions"], summary="List accessible submissions"),
    retrieve=extend_schema(tags=["Submissions"], summary="Retrieve submission"),
    create=extend_schema(
        tags=["Submissions"],
        summary="Disabled runtime creation endpoint",
        description="Runtime submissions are created only from `/api/drafts/` after final submit.",
        examples=[
            OpenApiExample(
                "Deprecated payload example",
                value={
                    "program": "11111111-1111-1111-1111-111111111111",
                    "submission_type": "idea",
                    "title": "Smart Fibre Fault Prediction",
                    "team": None,
                    "metadata": {"sector": "Connectivity"},
                },
                request_only=True,
            )
        ],
    ),
    update=extend_schema(tags=["Submissions"], summary="Update submission draft"),
    partial_update=extend_schema(tags=["Submissions"], summary="Partially update submission draft"),
)
class SubmissionViewSet(viewsets.ModelViewSet):
    serializer_class = SubmissionSerializer
    filterset_fields = ("current_status", "program", "submission_type", "screening_outcome", "final_decision", "submitted_at")
    search_fields = ("title", "reference_number", "innovator__first_name", "innovator__last_name", "innovator__email", "program__title", "team__name")

    def get_permissions(self):
        if self.action in {"assign", "workflow_force_advance", "workflow_force_close", "notes"}:
            return [IsOfficerOrAdmin()]
        if self.action in {"workflow_action"}:
            return [IsStaffWorker()]
        if self.action in {"evaluate"}:
            return [HasCapability.of("entries.score")()]
        return super().get_permissions()

    def get_queryset(self):
        return SubmissionSelector.for_user(self.request.user).prefetch_related("responses", "status_history")

    def _public_journey(self, submission):
        instance = getattr(submission, "workflow_instance", None)
        current_step = getattr(instance, "current_step", None)
        status_history = list(submission.status_history.select_related("changed_by").all())

        def iso(value):
            return value.isoformat() if value else None

        def stage_state(stage):
            code = stage.get("code")
            order = stage.get("order") or 0
            current_order = getattr(current_step, "order", None)
            if submission.current_status in {"rejected", "screened_out"} and stage.get("is_final"):
                return "rejected"
            if stage.get("has_reject"):
                return "rejected"
            if submission.current_status == "returned" and stage.get("has_return"):
                if current_step and code == current_step.code:
                    stage["is_current"] = True
                return "returned"
            if current_step and code == current_step.code and getattr(instance, "status", "") not in {"completed", "rejected", "cancelled"}:
                return "current"
            if current_step and current_order is not None and code != "submitted" and order < current_order:
                return "completed"
            if stage.get("timestamp") or stage.get("comments") or stage.get("reviews"):
                return "completed"
            return "pending"

        stages = {}

        def ensure_stage(code, label, *, order=0, is_final=False):
            if code not in stages:
                stages[code] = {
                    "id": code,
                    "code": code,
                    "label": label,
                    "order": order,
                    "state": "pending",
                    "timestamp": None,
                    "comments": [],
                    "reviews": [],
                    "activities": [],
                    "aggregate": None,
                    "is_final": is_final,
                    "has_return": False,
                    "has_reject": False,
                    "is_current": False,
                }
            return stages[code]

        submitted_stage = ensure_stage("submitted", "Submitted", order=0)
        submitted_stage["timestamp"] = iso(submission.submitted_at or submission.created_at)

        workflow_steps = []
        if instance:
            workflow_steps = list(instance.workflow_definition.steps.filter(is_active=True).order_by("order", "created_at"))
            for step in workflow_steps:
                ensure_stage(step.code, step.name, order=step.order or 0)

        final_statuses = {"approved", "rejected", "screened_out", "shortlisted", "finalist", "winner"}
        if submission.current_status in final_statuses:
            final_stage = ensure_stage("final_decision", "Final Decision", order=999, is_final=True)
            final_stage["timestamp"] = iso(submission.updated_at)

        def stage_for_status(status_value):
            normalized = (status_value or "").lower()
            if normalized == "submitted":
                return stages.get("submitted")
            if normalized in stages:
                return stages[normalized]
            if normalized in {"returned", "requires_more_information"}:
                if current_step and stages.get(current_step.code):
                    return stages.get(current_step.code)
                manager_step = next(
                    (
                        step for step in workflow_steps
                        if step.role_required == RoleType.INNOVATION_MANAGER
                    ),
                    None,
                )
                if manager_step:
                    return stages.get(manager_step.code)
                return submitted_stage
            if normalized in final_statuses or normalized in {"withdrawn"}:
                return stages.get("final_decision") or (stages.get(current_step.code) if current_step else submitted_stage)
            return None

        for item in status_history:
            status_value = item.to_status or item.from_status or ""
            stage = stage_for_status(status_value)
            if not stage:
                continue
            stage["timestamp"] = stage["timestamp"] or iso(item.created_at)
            if status_value in {"returned", "requires_more_information"}:
                stage["has_return"] = True

        snapshots = (
            SubmissionFeedbackSnapshot.objects
            .filter(submission=submission)
            .order_by("released_at", "created_at")
        )
        for snapshot in snapshots:
            payload = snapshot.payload_json or {}
            stage = ensure_stage(snapshot.stage_code, snapshot.stage_name, order=payload.get("order", 0) or 0)
            activity = {
                "id": str(snapshot.id),
                "action": snapshot.release_action,
                "state": payload.get("state") or ("returned" if snapshot.release_action == "return" else "rejected" if snapshot.release_action in {"reject", "screen_out"} else "completed"),
                "title": payload.get("release", {}).get("source_stage_name") or snapshot.stage_name,
                "comment": payload.get("release", {}).get("comment") or "",
                "timestamp": payload.get("timestamp") or iso(snapshot.released_at),
                "aggregate": payload.get("aggregate"),
                "reviews": payload.get("reviews") or [],
                "comments": payload.get("comments") or [],
            }
            stage["activities"].append(activity)
            stage["timestamp"] = stage["timestamp"] or iso(snapshot.released_at)
            if snapshot.release_action == "return" or payload.get("state") == "returned":
                stage["has_return"] = True
            if snapshot.release_action in {"reject", "screen_out"} or payload.get("state") == "rejected":
                stage["has_reject"] = True

        terminal_release_order = None
        for stage in stages.values():
            stage["state"] = stage_state(stage)
            stage["is_current"] = stage.get("is_current") or stage["state"] == "current"
            stage["comments"] = [
                comment
                for activity in stage["activities"]
                for comment in (activity.get("comments") or [])
            ]
            stage["reviews"] = [
                review
                for activity in stage["activities"]
                for review in (activity.get("reviews") or [])
            ]
            if stage["activities"]:
                last_activity = stage["activities"][-1]
                stage["aggregate"] = last_activity.get("aggregate")
            if stage.get("has_reject"):
                terminal_release_order = stage["order"] if terminal_release_order is None else min(terminal_release_order, stage["order"])
            stage["comment_count"] = len(stage["comments"])
            stage["review_count"] = len(stage["reviews"])
            stage["activity_count"] = len(stage["activities"])
            stage.pop("is_final", None)
            stage.pop("has_return", None)
            stage.pop("has_reject", None)

        visible_stages = [
            stage
            for stage in stages.values()
            if terminal_release_order is None or stage["order"] <= terminal_release_order
        ]

        return sorted(visible_stages, key=lambda item: (item["order"], item["label"]))

    def create(self, request, *args, **kwargs):
        raise ValidationError(
            {
                "detail": (
                    "Runtime submissions are created only from submitted drafts. "
                    "Use `/api/drafts/` to save a draft and `/api/drafts/{id}/submit/` to submit it."
                )
            }
        )

    def perform_create(self, serializer):
        serializer.save()

    @action(detail=True, methods=["post"])
    @extend_schema(tags=["Submissions"], summary="Submit draft", description="Validates required fields, generates a reference number, locks editing, and transitions to `submitted`.")
    def submit(self, request, pk=None):
        submission = self.get_object()
        UserVerificationService.assert_verified(user=request.user, reason="submission_submit")
        submission = SubmissionService.finalize_submission(submission, request.user)
        return Response(self.get_serializer(submission).data)

    @action(detail=True, methods=["get", "post"], url_path="responses")
    @extend_schema(tags=["Submissions"], summary="List or save dynamic form responses")
    def responses(self, request, pk=None):
        submission = self.get_object()
        if request.method == "GET":
            return api_success(data=[{"id": str(item.id), "form_field": str(item.form_field_id), "value": item.value} for item in submission.responses.all()])
        UserVerificationService.assert_verified(user=request.user, reason="submission_edit")
        SubmissionService.save_responses(submission, request.data.get("responses", []), request.user)
        submission.refresh_from_db()
        return api_success(data=self.get_serializer(submission).data)

    @action(detail=True, methods=["post"])
    @extend_schema(tags=["Submissions"], summary="Resubmit returned submission")
    def resubmit(self, request, pk=None):
        submission = self.get_object()
        UserVerificationService.assert_verified(user=request.user, reason="submission_resubmit")
        submission = SubmissionService.resubmit(submission, request.user)
        return api_success(data=self.get_serializer(submission).data)

    @action(detail=True, methods=["post"], permission_classes=[IsOfficerOrAdmin], url_path="assign")
    @extend_schema(tags=["Submissions"], summary="Assign, reassign, or unassign workflow reviewers/evaluators")
    def assign(self, request, pk=None):
        submission = self.get_object()
        serializer = SubmissionAssignmentActionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        action_type = serializer.validated_data["action"]
        if action_type == "assign":
            assignee = User.objects.get(id=serializer.validated_data["assignee"])
            assignment = AssignmentService.create_assignment(
                submission=submission,
                assignee=assignee,
                role_type=serializer.validated_data.get("role_type", submission.workflow_instance.current_step.assignment_role if hasattr(submission, "workflow_instance") and submission.workflow_instance.current_step else "judge"),
                assigned_by=request.user,
                deadline=serializer.validated_data.get("deadline"),
            )
        elif action_type == "reassign":
            existing = submission.assignments.get(id=serializer.validated_data["assignment_id"])
            assignee = User.objects.get(id=serializer.validated_data["assignee"])
            assignment = AssignmentService.reassign(assignment=existing, assignee=assignee, actor=request.user, deadline=serializer.validated_data.get("deadline"))
        else:
            existing = submission.assignments.get(id=serializer.validated_data["assignment_id"])
            assignment = AssignmentService.unassign(assignment=existing, actor=request.user)
        return api_success(data=AssignmentSerializer(assignment).data, status_code=status.HTTP_200_OK)

    @action(detail=True, methods=["post"], url_path="evaluate")
    @extend_schema(tags=["Submissions"], summary="Save or submit an evaluation for the current user")
    def evaluate(self, request, pk=None):
        submission = self.get_object()
        serializer = SubmissionEvaluationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        current_step = submission.workflow_instance.current_step if hasattr(submission, "workflow_instance") else None
        evaluation_round = EvaluationService.resolve_evaluation_round(program=submission.program, step=current_step)
        score_sheet = EvaluationService.save_scores(
            submission=submission,
            judge=request.user,
            evaluation_round=evaluation_round,
            scores=serializer.validated_data["criterion_scores"],
            overall_comment=serializer.validated_data.get("comment", ""),
        )
        if serializer.validated_data.get("submit", True):
            score_sheet = EvaluationService.submit_scores(submission=submission, judge=request.user, evaluation_round=evaluation_round)
        return api_success(data=ScoreSheetSerializer(score_sheet).data, status_code=status.HTTP_200_OK)

    @action(detail=True, methods=["get"], url_path="evaluations")
    @extend_schema(tags=["Submissions"], summary="List evaluations for a submission")
    def evaluations(self, request, pk=None):
        submission = self.get_object()
        data = {
            "items": ScoreSheetSerializer(submission.score_sheets.prefetch_related("criterion_scores").all(), many=True).data,
            "aggregate": EvaluationSelector.submission_summary(submission),
        }
        return api_success(data=data)

    @action(detail=True, methods=["post"], url_path="workflow-action")
    @extend_schema(tags=["Submissions"], summary="Approve, reject, or return the current workflow step")
    def workflow_action(self, request, pk=None):
        submission = self.get_object()
        serializer = WorkflowActionRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        instance = WorkflowRuntimeService.perform_action(
            submission=submission,
            actor=request.user,
            action=serializer.validated_data["action"],
            comment=serializer.validated_data.get("comment", ""),
        )
        submission.refresh_from_db()
        return api_success(data={"submission": self.get_serializer(submission).data, "workflow_status": instance.status})

    @action(detail=True, methods=["post"], url_path="workflow-action/force-advance", permission_classes=[IsOfficerOrAdmin])
    @extend_schema(tags=["Workflow"], summary="Force advance workflow to the next step with audit trail")
    def workflow_force_advance(self, request, pk=None):
        submission = self.get_object()
        instance = WorkflowRuntimeService.force_advance(submission, request.user, reason=request.data.get("reason", "Forced advance."))
        submission.refresh_from_db()
        return api_success(data={"submission": self.get_serializer(submission).data, "workflow_status": instance.status})

    @action(detail=True, methods=["post"], url_path="workflow-action/force-close", permission_classes=[IsOfficerOrAdmin])
    @extend_schema(tags=["Workflow"], summary="Force close workflow with audit trail")
    def workflow_force_close(self, request, pk=None):
        submission = self.get_object()
        instance = WorkflowRuntimeService.force_close(submission, request.user, reason=request.data.get("reason", "Forced close."))
        submission.refresh_from_db()
        return api_success(data={"submission": self.get_serializer(submission).data, "workflow_status": instance.status})

    @action(detail=True, methods=["get"], url_path="workflow")
    @extend_schema(tags=["Workflow"], summary="Get current workflow state for a submission")
    def workflow(self, request, pk=None):
        submission = self.get_object()
        if not hasattr(submission, "workflow_instance"):
            return Response({"detail": "Submission does not have an active workflow instance."}, status=status.HTTP_404_NOT_FOUND)
        instance = submission.workflow_instance
        step = instance.current_step
        roles = set(request.user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)) if request.user.is_authenticated else set()
        internal = bool(request.user.is_authenticated and (request.user.is_superuser or roles & {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR, RoleType.MANAGEMENT_VIEWER, RoleType.JUDGE}))
        latest_manager_log = None
        if internal and step:
            manager_send_back_targets = {
                "innovation_manager_review": "officer_review",
                "committee_manager_review": "committee_review",
            }
            possible_manager_logs = (
                instance.action_logs
                .filter(action__in=["send_back", "return"], step__role_required=RoleType.INNOVATION_MANAGER)
                .select_related("performed_by", "step")
                .order_by("-timestamp")
            )
            for log in possible_manager_logs:
                log_step_code = getattr(log.step, "code", "")
                if log.action == "send_back" and manager_send_back_targets.get(log_step_code) == step.code:
                    latest_manager_log = log
                    break
                if log.action == "return" and instance.status == "returned":
                    latest_manager_log = log
                    break
        payload = {
            "workflow_instance_id": instance.id,
            "workflow_definition_id": instance.workflow_definition_id,
            "workflow_definition_name": instance.workflow_definition.name,
            "workflow_definition_version": instance.workflow_definition.version,
            "current_step_id": step.id if step else None,
            "current_step": step.name if step else "",
            "current_step_code": step.code if step else "",
            "current_step_order": step.order if step else None,
            "workflow_status": instance.status,
            "due_at": instance.due_at,
            "is_overdue": bool(instance.due_at and instance.due_at < timezone.now()),
            "submission_status": submission.current_status,
            "requires_assignment": bool(step and step.requires_assignment),
            "requires_evaluation": bool(step and step.requires_evaluation),
            "role_required": step.role_required if step else "",
            "allowed_actions": WorkflowRuntimeService.allowed_actions_for_user(instance, request.user),
            "applicant_action_required": instance.status == "returned" and request.user.is_authenticated and submission.innovator_id == request.user.id,
            "assignment_summary": WorkflowRuntimeService.assignment_summary(instance, request.user if internal else None),
            "evaluation_summary": WorkflowRuntimeService.evaluation_summary(instance),
            "task_summary": WorkflowRuntimeService.task_summary(instance, request.user if internal else None),
            "step_completion": WorkflowRuntimeService.step_completion_summary(instance),
            "latest_manager_review": {
                "action": latest_manager_log.action,
                "comment": latest_manager_log.comment,
                "step_name": latest_manager_log.step.name if latest_manager_log.step_id else "",
                "performed_by_name": latest_manager_log.performed_by.full_name if latest_manager_log.performed_by_id else "",
                "timestamp": latest_manager_log.timestamp,
            } if latest_manager_log else {},
        }
        serializer = WorkflowCurrentStateSerializer(payload)
        return api_success(data=serializer.data)

    @action(detail=True, methods=["get"], url_path="workflow/history")
    @extend_schema(tags=["Workflow"], summary="Get workflow action history for a submission")
    def workflow_history(self, request, pk=None):
        submission = self.get_object()
        if not hasattr(submission, "workflow_instance"):
            return Response({"detail": "Submission does not have an active workflow instance."}, status=status.HTTP_404_NOT_FOUND)
        roles = set(request.user.roles.filter(user_roles__is_active=True).values_list("code", flat=True)) if request.user.is_authenticated else set()
        internal = bool(request.user.is_authenticated and (request.user.is_superuser or roles & {RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER, RoleType.ADMINISTRATOR, RoleType.MANAGEMENT_VIEWER, RoleType.JUDGE}))
        data = WorkflowRuntimeService.safe_action_history(submission.workflow_instance, internal=internal)
        return api_success(data=data)

    @action(detail=True, methods=["get"])
    @extend_schema(tags=["Submissions"], summary="Get submission status history")
    def history(self, request, pk=None):
        submission = self.get_object()
        return api_success(data=SubmissionStatusHistorySerializer(submission.status_history.all(), many=True).data)

    @action(detail=True, methods=["get"], url_path="assignments", permission_classes=[IsOfficerOrAdmin])
    @extend_schema(tags=["Assignments"], summary="List submission assignments")
    def assignments(self, request, pk=None):
        submission = self.get_object()
        return api_success(data=AssignmentSerializer(submission.assignments.select_related("assignee", "workflow_step").all(), many=True).data)

    @action(detail=True, methods=["get"], url_path="tasks")
    @extend_schema(tags=["Workflow"], summary="List task executions for the current submission")
    def tasks(self, request, pk=None):
        submission = self.get_object()
        if not hasattr(submission, "workflow_instance"):
            return Response({"detail": "Submission does not have an active workflow instance."}, status=status.HTTP_404_NOT_FOUND)
        queryset = submission.workflow_instance.tasks.select_related("workflow_step", "assignee", "assignment")
        return api_success(data=TaskExecutionSerializer(queryset, many=True).data)

    @action(detail=True, methods=["get"], url_path="outcome")
    @extend_schema(tags=["Submissions"], summary="Get current and historical outcomes for a submission")
    def outcome(self, request, pk=None):
        submission = self.get_object()
        current = submission.outcomes.filter(is_current=True).first()
        payload = {
            "current": SubmissionOutcomeSerializer(current).data if current else None,
            "history": SubmissionOutcomeSerializer(submission.outcomes.all(), many=True).data,
        }
        return api_success(data=payload)

    @action(detail=True, methods=["get", "post"], url_path="notes")
    @extend_schema(tags=["Submissions"], summary="List or create internal notes")
    def notes(self, request, pk=None):
        submission = self.get_object()
        if request.method == "GET":
            return api_success(data=SubmissionInternalNoteSerializer(submission.internal_notes.all(), many=True).data)
        note_text = request.data.get("note") or request.data.get("content")
        if not note_text:
            raise ValidationError({"note": ["This field is required."]})
        note = submission.internal_notes.create(author=request.user, note=note_text)
        return api_success(data=SubmissionInternalNoteSerializer(note).data, status_code=status.HTTP_201_CREATED)

    @extend_schema(tags=["Tracking"], summary="Get owner/internal tracking detail for a submission", responses=TRACKING_DOC)
    @action(detail=True, methods=["get"], url_path="tracking-detail")
    def tracking_detail(self, request, pk=None):
        submission = self.get_object()
        payload = {
            "reference_number": submission.reference_number,
            "submission_type": submission.submission_type,
            "current_status": submission.current_status,
            "submitted_at": submission.submitted_at,
            "updated_at": submission.updated_at,
            "current_step": getattr(getattr(submission, "workflow_instance", None), "current_step", None).name if hasattr(submission, "workflow_instance") and submission.workflow_instance.current_step else "",
            "applicant_action_required": hasattr(submission, "workflow_instance") and submission.workflow_instance.status == "returned" and submission.innovator_id == request.user.id,
            "status_history": SubmissionStatusHistorySerializer(submission.status_history.all(), many=True, context={"public": True}).data,
            "journey": self._public_journey(submission),
            "workflow_history": [],
            "timeline": SubmissionTimelineService.build(submission),
        }
        return api_success(data=payload)

    @action(detail=True, methods=["get"], url_path="evaluation-readiness")
    @extend_schema(tags=["Evaluations"], summary="Check whether a submission has enough evaluations to advance")
    def evaluation_readiness(self, request, pk=None):
        submission = self.get_object()
        if not hasattr(submission, "workflow_instance"):
            return Response({"detail": "Submission does not have an active workflow instance."}, status=status.HTTP_404_NOT_FOUND)
        return api_success(data=WorkflowRuntimeService.evaluation_readiness(submission.workflow_instance))


@extend_schema(tags=["Submissions"], summary="List my submissions")
class MySubmissionListView(generics.ListAPIView):
    serializer_class = SubmissionSerializer

    def get_queryset(self):
        return SubmissionSelector.innovator_submissions(self.request.user)
