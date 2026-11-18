from rest_framework import generics, status
from rest_framework.response import Response
from django.utils import timezone

from apps.assignments.models import Assignment
from apps.core.constants import AssignmentRoleType, AssignmentStatus
from apps.core.api import api_success
from apps.core.constants import ScoreSheetStatus
from apps.core.permissions import IsAdministrator, IsJudge, IsJudgeOrOfficer, IsOfficerOrAdmin, IsStaffWorker
from apps.evaluation.models import (
    EvaluationRound, MarkingCriteria, MarkingCriteriaItem,
    ReviewCycle, ScoreSheet, StageEvaluationConfig, StageCriterion,
)
from apps.evaluation.selectors import EvaluationSelector
from apps.evaluation.serializers import (
    EvaluationLockSerializer,
    FinalDecisionSerializer,
    MarkingCriteriaItemSerializer,
    MarkingCriteriaSerializer,
    MarkingCriteriaWriteSerializer,
    ModerationRecordSerializer,
    MyAssignedEvaluationSerializer,
    ReviewCycleSerializer,
    RubricSerializer,
    SaveCycleScoresSerializer,
    ScoreSheetSerializer,
    ShortlistGenerationSerializer,
    StageCriterionSerializer,
    StageEvaluationConfigSerializer,
    StageEvaluationConfigWriteSerializer,
)
from apps.evaluation.services import (
    DecisionService,
    EvaluationService,
    ModerationService,
    RankingService,
    ReviewCycleService,
    StageConfigService,
)
from apps.programs.models import Program
from apps.submissions.models import Submission
from apps.workflow.models import WorkflowStep
from apps.workflow.services import WorkflowRuntimeService


class MyAssignedEvaluationsView(generics.ListAPIView):
    permission_classes = [IsJudge]
    serializer_class = MyAssignedEvaluationSerializer

    def get_queryset(self):
        return EvaluationSelector.judge_workload(self.request.user)

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)


class SubmissionRubricView(generics.RetrieveAPIView):
    permission_classes = [IsJudge]
    serializer_class = RubricSerializer

    def get_object(self):
        submission = Submission.objects.get(id=self.kwargs["submission_id"])
        step = submission.workflow_instance.current_step if hasattr(submission, "workflow_instance") else None
        evaluation_round = EvaluationService.resolve_evaluation_round(program=submission.program, step=step)
        return evaluation_round.rubric


class SaveScoresView(generics.GenericAPIView):
    permission_classes = [IsJudge]
    serializer_class = ScoreSheetSerializer

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        step = submission.workflow_instance.current_step if hasattr(submission, "workflow_instance") else None
        evaluation_round = EvaluationService.resolve_evaluation_round(program=submission.program, step=step)
        score_sheet = EvaluationService.save_scores(
            submission=submission,
            judge=request.user,
            evaluation_round=evaluation_round,
            scores=request.data.get("criterion_scores", []),
            overall_comment=request.data.get("comment", ""),
        )
        return api_success(data=ScoreSheetSerializer(score_sheet).data, status_code=status.HTTP_200_OK)


class SubmitScoresView(generics.GenericAPIView):
    permission_classes = [IsJudge]

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        step = submission.workflow_instance.current_step if hasattr(submission, "workflow_instance") else None
        evaluation_round = EvaluationService.resolve_evaluation_round(program=submission.program, step=step)
        score_sheet = EvaluationService.submit_scores(submission=submission, judge=request.user, evaluation_round=evaluation_round)
        return api_success(data=ScoreSheetSerializer(score_sheet).data)


class EvaluationSummaryView(generics.GenericAPIView):
    def get(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        return api_success(data=EvaluationSelector.submission_summary(submission))


class LockEvaluationView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = EvaluationLockSerializer

    def post(self, request, submission_id, evaluation_id):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        score_sheet = Submission.objects.get(id=submission_id).score_sheets.get(id=evaluation_id)
        locked = EvaluationService.lock_scores(score_sheet=score_sheet, actor=request.user)
        return api_success(data=ScoreSheetSerializer(locked).data)


class ModerateSubmissionView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = ModerationRecordSerializer

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        record = ModerationService.moderate(submission=submission, actor=request.user, rationale=request.data["rationale"], adjustment_metadata=request.data.get("adjustment_metadata"))
        return api_success(data=self.get_serializer(record).data, status_code=status.HTTP_201_CREATED)


class FinalDecisionView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FinalDecisionSerializer

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        record = DecisionService.record_decision(
            submission=submission,
            actor=request.user,
            decision=request.data["decision"],
            rationale=request.data["rationale"],
        )
        return api_success(data=self.get_serializer(record).data, status_code=status.HTTP_201_CREATED)


class ProgramRankingView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, program_id):
        program = Program.objects.get(id=program_id)
        ranking = [
            {
                "submission_id": str(item["submission"].id),
                "reference_number": item["submission"].reference_number,
                "title": item["submission"].title,
                "average_score": item["average_score"],
                "completed_evaluators": item["completed_evaluators"],
                "ranking_position": item["ranking_position"],
                "current_status": item["submission"].current_status,
            }
            for item in RankingService.program_ranking(program)
        ]
        return api_success(data=ranking)


class ProgramShortlistGenerationView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = ShortlistGenerationSerializer

    def post(self, request, program_id):
        serializer = self.get_serializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        program = Program.objects.get(id=program_id)
        results = RankingService.generate_shortlist(
            program=program,
            actor=request.user,
            limit=serializer.validated_data["limit"],
            minimum_average_score=serializer.validated_data.get("minimum_average_score"),
            apply_workflow=serializer.validated_data["apply_workflow"],
        )
        return api_success(data=results)


class PendingEvaluationsView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        assignments = Assignment.objects.select_related("submission", "assignee", "workflow_step").filter(
            role_type=AssignmentRoleType.JUDGE,
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
        )
        data = [
            {
                "assignment_id": str(item.id),
                "submission_id": str(item.submission_id),
                "reference_number": item.submission.reference_number,
                "assignee_id": str(item.assignee_id),
                "assignee_name": item.assignee.full_name,
                "status": item.status,
                "deadline": item.deadline,
            }
            for item in assignments
        ]
        return api_success(data=data)


class OverdueEvaluationsView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, *args, **kwargs):
        assignments = Assignment.objects.select_related("submission", "assignee").filter(
            role_type=AssignmentRoleType.JUDGE,
            deadline__lt=timezone.now(),
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED],
        )
        data = [
            {
                "assignment_id": str(item.id),
                "submission_id": str(item.submission_id),
                "reference_number": item.submission.reference_number,
                "assignee_name": item.assignee.full_name,
                "deadline": item.deadline,
                "overdue_by_hours": round((timezone.now() - item.deadline).total_seconds() / 3600, 2) if item.deadline else None,
            }
            for item in assignments
        ]
        return api_success(data=data)


class EvaluationOverrideView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        instance = WorkflowRuntimeService.force_advance(
            submission,
            request.user,
            reason=request.data.get("reason", "Evaluation override applied by officer/admin."),
        )
        return api_success(data={"workflow_status": instance.status, "submission_status": submission.current_status})



class MarkingCriteriaListView(generics.GenericAPIView):
    """
    GET  — list all reusable marking criteria (officers + admins).
    POST — create a new criteria definition (admins only).
    """

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsOfficerOrAdmin()]
        return [IsAdministrator()]

    def get(self, request):
        qs = MarkingCriteria.objects.prefetch_related("items").order_by("title")
        active_only = request.query_params.get("active_only", "").lower() in ("1", "true")
        if active_only:
            qs = qs.filter(is_active=True)
        return api_success(data=MarkingCriteriaSerializer(qs, many=True).data)

    def post(self, request):
        ser = MarkingCriteriaWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        criteria = MarkingCriteria.objects.create(
            created_by=request.user,
            **ser.validated_data,
        )
        return api_success(data=MarkingCriteriaSerializer(criteria).data, status_code=status.HTTP_201_CREATED)


class MarkingCriteriaDetailView(generics.GenericAPIView):
    """
    GET    — retrieve a single marking criteria.
    PUT    — fully update it.
    PATCH  — partially update it.
    DELETE — deactivate (soft-delete) it.
    """
    permission_classes = [IsOfficerOrAdmin]

    def _get_criteria(self, criteria_id):
        return MarkingCriteria.objects.get(id=criteria_id)

    def get(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        return api_success(data=MarkingCriteriaSerializer(criteria).data)

    def put(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        ser = MarkingCriteriaWriteSerializer(criteria, data=request.data)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(criteria, attr, value)
        criteria.save()
        return api_success(data=MarkingCriteriaSerializer(criteria).data)

    def patch(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        ser = MarkingCriteriaWriteSerializer(criteria, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(criteria, attr, value)
        criteria.save()
        return api_success(data=MarkingCriteriaSerializer(criteria).data)

    def delete(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        in_use = criteria.stage_configs.count()
        if in_use > 0:
            criteria.is_active = False
            criteria.save(update_fields=["is_active", "updated_at"])
            return api_success(data={"deactivated": True, "steps_using": in_use})
        criteria.delete()
        return api_success(data={"deleted": True})


class MarkingCriteriaItemsView(generics.GenericAPIView):
    """
    GET  — list items within a criteria.
    POST — add a new item.
    """
    permission_classes = [IsOfficerOrAdmin]

    def _get_criteria(self, criteria_id):
        return MarkingCriteria.objects.get(id=criteria_id)

    def get(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        return api_success(data=MarkingCriteriaItemSerializer(criteria.items.all(), many=True).data)

    def post(self, request, criteria_id):
        criteria = self._get_criteria(criteria_id)
        ser = MarkingCriteriaItemSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        item = MarkingCriteriaItem.objects.create(criteria=criteria, **ser.validated_data)
        return api_success(data=MarkingCriteriaItemSerializer(item).data, status_code=status.HTTP_201_CREATED)


class MarkingCriteriaItemDetailView(generics.GenericAPIView):
    """PUT / PATCH / DELETE a single criteria item."""
    permission_classes = [IsOfficerOrAdmin]

    def _get_item(self, criteria_id, item_id):
        return MarkingCriteriaItem.objects.get(id=item_id, criteria_id=criteria_id)

    def put(self, request, criteria_id, item_id):
        item = self._get_item(criteria_id, item_id)
        ser = MarkingCriteriaItemSerializer(item, data=request.data)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(item, attr, value)
        item.save()
        return api_success(data=MarkingCriteriaItemSerializer(item).data)

    def patch(self, request, criteria_id, item_id):
        item = self._get_item(criteria_id, item_id)
        ser = MarkingCriteriaItemSerializer(item, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(item, attr, value)
        item.save()
        return api_success(data=MarkingCriteriaItemSerializer(item).data)

    def delete(self, request, criteria_id, item_id):
        item = self._get_item(criteria_id, item_id)
        item.delete()
        return api_success(data={"deleted": True})



class SubmissionReviewFeedbackView(generics.GenericAPIView):
    """
    GET — return structured criterion-level feedback for a submission's
    most recently decided review cycle, if allow_applicant_feedback is True.

    Accessible by:
      - the submission's innovator (applicant)
      - officers / admins
    """

    def get(self, request, submission_id):
        from rest_framework.exceptions import NotFound, PermissionDenied

        submission = Submission.objects.get(id=submission_id)

        if not request.user or not request.user.is_authenticated:
            raise PermissionDenied
        is_owner = submission.innovator_id == request.user.id
        is_staff = EvaluationService._is_staff(request.user) or request.user.is_superuser
        if not is_owner and not is_staff:
            raise PermissionDenied

        decided_cycle = (
            ReviewCycle.objects
            .filter(
                submission=submission,
                status=ReviewCycle.STATUS_COMPLETED,
            )
            .order_by("-closed_at")
            .first()
        )

        if not decided_cycle:
            return api_success(data=None)

        stage_config = decided_cycle.stage_config
        allow_feedback = stage_config.allow_applicant_feedback if stage_config else False

        if is_owner and not is_staff and not allow_feedback:
            raise PermissionDenied("Feedback is not available for this submission.")

        feedback = {
            "cycle_id": str(decided_cycle.id),
            "cycle_number": decided_cycle.cycle_number,
            "outcome": decided_cycle.outcome,
            "aggregate_pct": float(decided_cycle.aggregate_pct) if decided_cycle.aggregate_pct else None,
            "decision_note": decided_cycle.decision_note,
            "closed_at": decided_cycle.closed_at.isoformat() if decided_cycle.closed_at else None,
            "criteria_feedback": [],
        }

        if allow_feedback or is_staff:
            completed_sheets = list(
                decided_cycle.completed_scorecards
                .select_related("judge")
                .prefetch_related(
                    "criterion_scores__criterion",
                    "criterion_scores__stage_criterion",
                    "criterion_scores__marking_criteria_item",
                )
            )

            max_raw = float(stage_config.effective_max_score) if stage_config else 0
            scorecards = []
            for idx, sheet in enumerate(completed_sheets):
                label = sheet.judge.full_name if is_staff else f"Reviewer {idx + 1}"
                reviewer_name = sheet.judge.full_name if is_staff else None
                sheet_max = sum(
                    float(cs.criterion_max_score) for cs in sheet.criterion_scores.all()
                ) or max_raw or 0
                pct = round(float(sheet.total_score) / sheet_max * 100, 1) if sheet_max else 0
                scorecards.append({
                    "reviewer_label": label,
                    "reviewer_name": reviewer_name,
                    "total_score": float(sheet.total_score),
                    "total_pct": pct,
                    "overall_comment": sheet.overall_comment if (is_staff or allow_feedback) else "",
                    "submitted_at": sheet.submitted_at.isoformat() if sheet.submitted_at else None,
                    "scores": [
                        {
                            "criterion_id": str(
                                cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id
                            ),
                            "criterion_name": cs.criterion_name,
                            "max_score": float(cs.criterion_max_score),
                            "raw_score": float(cs.raw_score),
                            "weighted_score": float(cs.weighted_score),
                            "comment": cs.comment if (is_staff or allow_feedback) else (cs.comment if cs.comment else ""),
                        }
                        for cs in sheet.criterion_scores.all()
                    ],
                })
            feedback["scorecards"] = scorecards

            criteria_data = {}
            for sheet in completed_sheets:
                for cs in sheet.criterion_scores.all():
                    cid = str(cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id)
                    if cid not in criteria_data:
                        criteria_data[cid] = {
                            "criterion_name": cs.criterion_name,
                            "max_score": float(cs.criterion_max_score),
                            "scores": [],
                            "comments": [],
                        }
                    criteria_data[cid]["scores"].append(float(cs.raw_score))
                    if cs.comment:
                        criteria_data[cid]["comments"].append(cs.comment)

            for cid, data in criteria_data.items():
                avg = sum(data["scores"]) / len(data["scores"]) if data["scores"] else 0
                feedback["criteria_feedback"].append({
                    "criterion_name": data["criterion_name"],
                    "max_score": data["max_score"],
                    "average_score": round(avg, 2),
                    "score_pct": round(avg / data["max_score"] * 100, 1) if data["max_score"] else 0,
                    "reviewer_comments": data["comments"] if is_staff else data["comments"][:1],
                })

        return api_success(data=feedback)



class SubmissionCycleHistoryView(generics.GenericAPIView):
    """
    GET — return all completed review cycles for a submission, visible to the
    applicant. Each cycle includes per-reviewer scores and comments when
    allow_applicant_feedback is enabled for that stage; otherwise only the
    aggregate outcome and score are returned.

    Accessible by: submission owner OR staff.
    """

    def get(self, request, submission_id):
        from rest_framework.exceptions import PermissionDenied

        if not request.user or not request.user.is_authenticated:
            raise PermissionDenied

        submission = Submission.objects.get(id=submission_id)
        is_owner = submission.innovator_id == request.user.id
        is_staff = EvaluationService._is_staff(request.user) or request.user.is_superuser
        if not is_owner and not is_staff:
            raise PermissionDenied

        cycles = (
            ReviewCycle.objects
            .filter(submission=submission)
            .order_by("cycle_number")
        )

        result = []
        for cycle in cycles:
            stage_config = cycle.stage_config
            allow_feedback = stage_config.allow_applicant_feedback if stage_config else False
            show_detail = is_staff or allow_feedback

            completed_sheets = list(
                cycle.completed_scorecards
                .select_related("judge")
                .prefetch_related(
                    "criterion_scores__criterion",
                    "criterion_scores__stage_criterion",
                    "criterion_scores__marking_criteria_item",
                )
            ) if show_detail else []

            scorecards = []
            for idx, sheet in enumerate(completed_sheets):
                label = sheet.judge.full_name if is_staff else f"Reviewer {idx + 1}"
                sheet_max = sum(
                    float(cs.criterion_max_score) for cs in sheet.criterion_scores.all()
                ) or 0
                pct = round(float(sheet.total_score) / sheet_max * 100, 1) if sheet_max else 0
                scorecards.append({
                    "scorecard_id": str(sheet.id),
                    "reviewer": label,
                    "status": sheet.status,
                    "total_score": float(sheet.total_score) if sheet.total_score is not None else None,
                    "total_pct": pct,
                    "overall_comment": sheet.overall_comment or "",
                    "submitted_at": sheet.submitted_at.isoformat() if sheet.submitted_at else None,
                    "scores": [
                        {
                            "criterion_id": str(
                                cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id
                            ),
                            "criterion_name": cs.criterion_name,
                            "max_score": float(cs.criterion_max_score),
                            "raw_score": float(cs.raw_score),
                            "weighted_score": float(cs.weighted_score),
                            "comment": cs.comment or "",
                        }
                        for cs in sheet.criterion_scores.all()
                    ],
                })

            result.append({
                "id": str(cycle.id),
                "cycle_number": cycle.cycle_number,
                "status": cycle.status,
                "outcome": cycle.outcome,
                "aggregate_score": float(cycle.aggregate_score) if cycle.aggregate_score is not None else None,
                "aggregate_pct": float(cycle.aggregate_pct) if cycle.aggregate_pct is not None else None,
                "closes_at": cycle.closes_at.isoformat() if cycle.closes_at else None,
                "closed_at": cycle.closed_at.isoformat() if cycle.closed_at else None,
                "decision_note": cycle.decision_note if (show_detail or is_staff) else "",
                "extended_count": cycle.extended_count,
                "completed_count": cycle.completed_count,
                "scorecards": scorecards,
            })

        return api_success(data=result)



class StageEvaluationConfigView(generics.GenericAPIView):
    """
    GET  — return the stage evaluation config for a workflow step.
    PUT  — create or fully update the config.
    """
    permission_classes = [IsOfficerOrAdmin]

    def _get_step(self, step_id):
        return WorkflowStep.objects.get(id=step_id)

    def get(self, request, step_id):
        step = self._get_step(step_id)
        config = StageConfigService.get_for_step(step)
        if not config:
            return api_success(data=None)
        return api_success(data=StageEvaluationConfigSerializer(config).data)

    def put(self, request, step_id):
        step = self._get_step(step_id)
        config = StageConfigService.get_for_step(step)
        write_ser = StageEvaluationConfigWriteSerializer(data=request.data)
        write_ser.is_valid(raise_exception=True)
        if config:
            for attr, value in write_ser.validated_data.items():
                setattr(config, attr, value)
            config.save()
        else:
            config = StageEvaluationConfig.objects.create(
                workflow_step=step,
                created_by=request.user,
                **write_ser.validated_data,
            )
        return api_success(data=StageEvaluationConfigSerializer(config).data)


class StageCriteriaView(generics.GenericAPIView):
    """
    GET  — list custom criteria for a step's evaluation config.
    POST — add a new criterion.
    """
    permission_classes = [IsOfficerOrAdmin]

    def _get_config(self, step_id):
        step = WorkflowStep.objects.get(id=step_id)
        config = StageConfigService.get_for_step(step)
        if not config:
            from rest_framework.exceptions import NotFound
            raise NotFound("No evaluation config exists for this step. Create one first.")
        return config

    def get(self, request, step_id):
        config = self._get_config(step_id)
        ser = StageCriterionSerializer(config.custom_criteria.all(), many=True)
        return api_success(data=ser.data)

    def post(self, request, step_id):
        config = self._get_config(step_id)
        ser = StageCriterionSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        criterion = StageCriterion.objects.create(stage_config=config, **ser.validated_data)
        return api_success(data=StageCriterionSerializer(criterion).data, status_code=status.HTTP_201_CREATED)


class StageCriterionDetailView(generics.GenericAPIView):
    """
    PUT    — update a single criterion.
    DELETE — remove a criterion.
    """
    permission_classes = [IsOfficerOrAdmin]

    def _get_criterion(self, step_id, criterion_id):
        step = WorkflowStep.objects.get(id=step_id)
        return StageCriterion.objects.get(id=criterion_id, stage_config__workflow_step=step)

    def put(self, request, step_id, criterion_id):
        criterion = self._get_criterion(step_id, criterion_id)
        ser = StageCriterionSerializer(criterion, data=request.data, partial=False)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(criterion, attr, value)
        criterion.save()
        return api_success(data=StageCriterionSerializer(criterion).data)

    def patch(self, request, step_id, criterion_id):
        criterion = self._get_criterion(step_id, criterion_id)
        ser = StageCriterionSerializer(criterion, data=request.data, partial=True)
        ser.is_valid(raise_exception=True)
        for attr, value in ser.validated_data.items():
            setattr(criterion, attr, value)
        criterion.save()
        return api_success(data=StageCriterionSerializer(criterion).data)

    def delete(self, request, step_id, criterion_id):
        criterion = self._get_criterion(step_id, criterion_id)
        criterion.delete()
        return api_success(data={"deleted": True})



class MyCycleView(generics.GenericAPIView):
    """
    GET — return or open the current ReviewCycle for a submission,
          along with the reviewer's own scorecard (blindness-enforced).

    Accessible by all staff workers (judges, officers, managers, analysts, etc.).
    """
    permission_classes = [IsStaffWorker]

    MANAGER_SOURCE_STEPS = {
        "innovation_manager_review": "officer_review",
        "committee_manager_review": "committee_review",
    }

    def _latest_completed_source_cycle(self, submission, step):
        source_step_code = self.MANAGER_SOURCE_STEPS.get(getattr(step, "code", ""))
        if not source_step_code:
            return None
        return (
            ReviewCycle.objects
            .filter(
                submission=submission,
                workflow_step__code=source_step_code,
                status=ReviewCycle.STATUS_COMPLETED,
            )
            .select_related("workflow_step", "stage_config")
            .order_by("-cycle_number", "-updated_at")
            .first()
        )

    def get(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if not step:
            from rest_framework.exceptions import NotFound
            raise NotFound("Submission has no active workflow step.")

        is_manager_review_step = getattr(step, "code", "") in self.MANAGER_SOURCE_STEPS
        if is_manager_review_step and EvaluationService._is_full_access_staff(request.user):
            source_cycle = self._latest_completed_source_cycle(submission, step)
            if source_cycle:
                data = EvaluationService.get_scorecard_for_reviewer(
                    submission=submission,
                    judge=request.user,
                    review_cycle=source_cycle,
                    reveal_identities=True,
                )
                data["can_score"] = False
                data["source_review_step"] = source_cycle.workflow_step.code
                data["source_review_step_name"] = source_cycle.workflow_step.name
                data["readonly_reason"] = "manager_review_context"
                return api_success(data=data)

        if not step.requires_evaluation:
            if WorkflowRuntimeService.allowed_actions_for_user(submission.workflow_instance, request.user):
                source_cycle = self._latest_completed_source_cycle(submission, step)
                if source_cycle:
                    data = EvaluationService.get_scorecard_for_reviewer(
                        submission=submission,
                        judge=request.user,
                        review_cycle=source_cycle,
                        reveal_identities=True,
                    )
                    data["can_score"] = False
                    data["source_review_step"] = source_cycle.workflow_step.code
                    data["source_review_step_name"] = source_cycle.workflow_step.name
                    data["readonly_reason"] = "manager_review_context"
                    return api_success(data=data)
                return api_success(data={
                    "review_cycle_id": None,
                    "cycle_number": None,
                    "cycle_status": None,
                    "stage_config": None,
                    "criteria": [],
                    "my_scorecard": None,
                    "peer_scores_available": False,
                    "aggregate": None,
                    "completed_reviews": 0,
                    "required_reviews": 0,
                    "pending_count": 0,
                    "can_score": False,
                })

            latest_sheet = (
                ScoreSheet.objects
                .filter(
                    submission=submission,
                    judge=request.user,
                    status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
                    is_final=True,
                    review_cycle__isnull=False,
                )
                .select_related("review_cycle")
                .order_by("-submitted_at", "-updated_at")
                .first()
            )
            if latest_sheet and latest_sheet.review_cycle:
                reveal = EvaluationService._is_full_access_staff(request.user)
                data = EvaluationService.get_scorecard_for_reviewer(
                    submission=submission,
                    judge=request.user,
                    review_cycle=latest_sheet.review_cycle,
                    reveal_identities=reveal,
                )
                data["can_score"] = False
                return api_success(data=data)


        open_cycle = ReviewCycle.objects.filter(
            submission=submission,
            workflow_step=step,
            status=ReviewCycle.STATUS_OPEN,
        ).order_by("-cycle_number").first()

        if open_cycle:
            review_cycle = open_cycle
        else:
            existing_sheet = (
                ScoreSheet.objects
                .filter(
                    submission=submission,
                    judge=request.user,
                    status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
                    is_final=True,
                    review_cycle__workflow_step=step,
                )
                .select_related("review_cycle")
                .order_by("-updated_at")
                .first()
            )

            if existing_sheet and existing_sheet.review_cycle:
                review_cycle = existing_sheet.review_cycle
            else:
                closed_cycle = (
                    ReviewCycle.objects
                    .filter(submission=submission, workflow_step=step)
                    .exclude(status=ReviewCycle.STATUS_CANCELLED)
                    .order_by("-cycle_number")
                    .first()
                )
                if closed_cycle:
                    review_cycle = closed_cycle
                else:
                    review_cycle = ReviewCycleService.get_or_open(
                        submission=submission, workflow_step=step
                    )

        reveal = EvaluationService._is_full_access_staff(request.user)
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=submission,
            judge=request.user,
            review_cycle=review_cycle,
            reveal_identities=reveal,
        )
        return api_success(data=data)


class SaveCycleScoresView(generics.GenericAPIView):
    """POST — save (draft) scores for the current review cycle."""
    permission_classes = [IsStaffWorker]
    serializer_class = SaveCycleScoresSerializer

    def post(self, request, submission_id):
        ser = self.get_serializer(data=request.data)
        ser.is_valid(raise_exception=True)
        submission = Submission.objects.get(id=submission_id)
        step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if not step:
            from rest_framework.exceptions import NotFound
            raise NotFound("Submission has no active workflow step.")
        review_cycle = ReviewCycleService.get_or_open(submission=submission, workflow_step=step)
        scores = [
            {
                "criterion_id": str(item["criterion_id"]),
                "type": item["type"],
                "raw_score": item["raw_score"],
                "comment": item.get("comment", ""),
            }
            for item in ser.validated_data["scores"]
        ]
        sheet = EvaluationService.save_cycle_scores(
            submission=submission,
            judge=request.user,
            review_cycle=review_cycle,
            scores=scores,
            overall_comment=ser.validated_data.get("overall_comment", ""),
        )
        return api_success(data=ScoreSheetSerializer(sheet).data)


class SubmitCycleScoresView(generics.GenericAPIView):
    """POST — finalize and lock scores for the current review cycle.

    Accepts an optional ``scores`` array in the body. If provided, scores are
    saved (upserted) atomically before locking, so callers do not need a
    separate Save Draft step first.
    """
    permission_classes = [IsStaffWorker]
    serializer_class = SaveCycleScoresSerializer

    def post(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        step = getattr(getattr(submission, "workflow_instance", None), "current_step", None)
        if not step:
            from rest_framework.exceptions import NotFound
            raise NotFound("Submission has no active workflow step.")
        review_cycle = ReviewCycleService.get_or_open(submission=submission, workflow_step=step)

        raw_scores = request.data.get("scores")
        if raw_scores:
            ser = SaveCycleScoresSerializer(data=request.data)
            ser.is_valid(raise_exception=True)
            scores = [
                {
                    "criterion_id": str(item["criterion_id"]),
                    "type": item["type"],
                    "raw_score": item["raw_score"],
                    "comment": item.get("comment", ""),
                }
                for item in ser.validated_data["scores"]
            ]
            EvaluationService.save_cycle_scores(
                submission=submission,
                judge=request.user,
                review_cycle=review_cycle,
                scores=scores,
                overall_comment=ser.validated_data.get("overall_comment", ""),
            )

        sheet = EvaluationService.submit_cycle_scores(
            submission=submission,
            judge=request.user,
            review_cycle=review_cycle,
        )
        return api_success(data=ScoreSheetSerializer(sheet).data)



class ReviewCycleListView(generics.GenericAPIView):
    """GET — list all review cycles for a submission (admin/officer)."""
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, submission_id):
        submission = Submission.objects.get(id=submission_id)
        cycles = ReviewCycle.objects.filter(submission=submission).order_by("cycle_number")
        return api_success(data=ReviewCycleSerializer(cycles, many=True).data)


class ReviewCycleSummaryView(generics.GenericAPIView):
    """
    GET — full cycle summary: all scorecards, per-criterion breakdown,
          aggregate score, outcome. Used by admin/officer views.
    """
    permission_classes = [IsOfficerOrAdmin]

    def get(self, request, submission_id, cycle_id):
        submission = Submission.objects.get(id=submission_id)
        cycle = ReviewCycle.objects.get(id=cycle_id, submission=submission)
        stage_config = cycle.stage_config

        scorecards = []
        for sheet in cycle.scorecards.select_related("judge").prefetch_related(
            "criterion_scores__criterion",
            "criterion_scores__stage_criterion",
            "criterion_scores__marking_criteria_item",
        ).all():
            scorecards.append({
                "scorecard_id": str(sheet.id),
                "reviewer": {
                    "id": str(sheet.judge.id),
                    "name": sheet.judge.full_name,
                    "email": sheet.judge.email,
                },
                "status": sheet.status,
                "total_score": float(sheet.total_score),
                "overall_comment": sheet.overall_comment,
                "submitted_at": sheet.submitted_at.isoformat() if sheet.submitted_at else None,
                "scores": [
                    {
                        "criterion_id": str(
                            cs.marking_criteria_item_id or cs.criterion_id or cs.stage_criterion_id
                        ),
                        "criterion_name": cs.criterion_name,
                        "raw_score": float(cs.raw_score),
                        "weighted_score": float(cs.weighted_score),
                        "max_score": float(cs.criterion_max_score),
                        "comment": cs.comment,
                    }
                    for cs in sheet.criterion_scores.all()
                ],
            })

        data = {
            "cycle": ReviewCycleSerializer(cycle).data,
            "criteria": StageConfigService.effective_criteria(stage_config) if stage_config else [],
            "scorecards": scorecards,
            "aggregate": {
                "score": float(cycle.aggregate_score) if cycle.aggregate_score is not None else None,
                "pct": float(cycle.aggregate_pct) if cycle.aggregate_pct is not None else None,
                "outcome": cycle.outcome,
                "completed_reviews": cycle.completed_count,
            },
        }
        return api_success(data=data)


class ReviewCycleActionView(generics.GenericAPIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request, submission_id, cycle_id, action):
        submission = Submission.objects.get(id=submission_id)
        cycle = ReviewCycle.objects.select_related("submission", "stage_config").get(
            id=cycle_id,
            submission=submission,
        )
        hours = request.data.get("hours")
        reason = request.data.get("reason", "")
        if action == "reset":
            cycle = EvaluationService.reset_review_window(
                review_cycle=cycle,
                actor=request.user,
                hours=int(hours) if hours else None,
                reason=reason,
            )
        elif action == "extend":
            cycle = EvaluationService.extend_review_window(
                review_cycle=cycle,
                actor=request.user,
                hours=int(hours or 0),
                reason=reason,
            )
        elif action == "close-now":
            cycle = EvaluationService.close_review_window_now(
                review_cycle=cycle,
                actor=request.user,
                allow_below_minimum=False,
            )
        elif action == "proceed":
            cycle = EvaluationService.close_review_window_now(
                review_cycle=cycle,
                actor=request.user,
                allow_below_minimum=True,
            )
        else:
            return Response({"detail": "Unsupported review cycle action."}, status=status.HTTP_400_BAD_REQUEST)
        return api_success(data=ReviewCycleSerializer(cycle).data)
