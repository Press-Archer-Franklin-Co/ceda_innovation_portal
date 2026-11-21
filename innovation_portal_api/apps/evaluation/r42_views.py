"""R-42: the judge's summary (3.17) and all scores for one idea (3.19)."""

from __future__ import annotations

import csv
import io
from decimal import Decimal

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.renderers import JSONRenderer
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.constants import AssignmentRoleType, AssignmentStatus, ScoreSheetStatus
from apps.core.permissions import HasAnyCapability, HasCapability
from apps.evaluation.models import ReviewCycle, ScoreSheet
from apps.evaluation.selectors import EvaluationSelector
from apps.evaluation.services import StageConfigService, sheet_weighted_score
from apps.programs.form_views import CSVRenderer
from apps.submissions.models import Submission

TAGS = ["Judging (R-42)"]
SENT = (ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED)
OPEN = (AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED)


class MyAssignedSummaryView(APIView):
    permission_classes = [HasCapability.of("entries.score")]

    @extend_schema(
        tags=TAGS,
        summary="My judging in numbers (3.17)",
        description="{assigned, scored, programs, due_at}: due_at is the earliest deadline of an entry not yet scored.",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        rows = list(EvaluationSelector.judge_workload(request.user))
        sent = set(
            ScoreSheet.objects.filter(judge=request.user, is_final=True, status__in=SENT, submission_id__in=[row.submission_id for row in rows]).values_list(
                "submission_id", flat=True
            )
        )
        deadlines = sorted(row.deadline for row in rows if row.deadline and row.status in OPEN and row.submission_id not in sent)
        return api_success(
            data={
                "assigned": len(rows),
                "scored": sum(1 for row in rows if row.submission_id in sent),
                "programs": len({row.submission.program_id for row in rows}),
                "due_at": deadlines[0].isoformat() if deadlines else None,
            }
        )


def _criterion_key(score) -> str:
    return str(score.marking_criteria_item_id or score.stage_criterion_id or score.criterion_id)


def scores_overview(submission) -> dict:
    """Sent scorecards of the latest review round, judges numbered 1, 2, 3 by when they sent (never named)."""
    from apps.assignments.models import Assignment

    program = submission.program
    threshold = program.disagreement_threshold if program.disagreement_threshold is not None else Decimal("2")
    cycle = (
        ReviewCycle.objects.filter(submission=submission, scorecards__is_final=True, scorecards__status__in=SENT)
        .exclude(status=ReviewCycle.STATUS_CANCELLED)
        .select_related("stage_config")
        .order_by("-cycle_number", "-created_at")
        .first()
    )
    sheets = ScoreSheet.objects.filter(submission=submission, is_final=True, status__in=SENT)
    sheets = sheets.filter(review_cycle=cycle) if cycle else sheets
    sheets = list(sheets.prefetch_related("criterion_scores").order_by("submitted_at", "created_at"))
    criteria = StageConfigService.effective_criteria(cycle.stage_config if cycle else None, program=program)
    if not criteria and sheets:
        # Old scorecards with no criteria left to read: use the names kept on the scores.
        seen = {}
        for sheet in sheets:
            for score in sheet.criterion_scores.all():
                seen.setdefault(_criterion_key(score), {"id": _criterion_key(score), "name": score.criterion_name, "weight": None, "max_score": float(score.criterion_max_score)})
        criteria = list(seen.values())
    rows = []
    for criterion in criteria:
        scores = []
        for number, sheet in enumerate(sheets, start=1):
            hit = next((score for score in sheet.criterion_scores.all() if _criterion_key(score) == criterion["id"]), None)
            if hit is not None:
                scores.append({"judge": number, "score": float(hit.raw_score)})
        values = [item["score"] for item in scores]
        spread = (max(values) - min(values)) if values else 0.0
        rows.append(
            {
                "id": criterion["id"],
                "name": criterion["name"],
                "weight": criterion.get("weight"),
                "max": criterion.get("max_score") or 5,
                "average": round(sum(values) / len(values), 2) if values else None,
                "scores": scores,
                "spread": spread,
                "flagged": spread > float(threshold),
            }
        )
    totals = [value for value in (sheet_weighted_score(sheet) for sheet in sheets) if value is not None]
    assigned = Assignment.objects.filter(submission=submission, role_type=AssignmentRoleType.JUDGE).exclude(
        status__in=[AssignmentStatus.REASSIGNED, AssignmentStatus.DECLINED]
    )
    if cycle and cycle.workflow_step_id:
        assigned = assigned.filter(workflow_step_id=cycle.workflow_step_id) if assigned.filter(workflow_step_id=cycle.workflow_step_id).exists() else assigned
    last = max((sheet.submitted_at for sheet in sheets if sheet.submitted_at), default=None)
    return {
        "average": round(sum(totals) / len(totals), 1) if totals else None,
        "pass_mark": float(program.pass_mark) if program.pass_mark is not None else None,
        "judges_scored": len(sheets),
        "judges_assigned": max(assigned.values("assignee_id").distinct().count(), len(sheets)),
        "last_scored_at": last.isoformat() if last else None,
        "criteria": rows,
        "comments": [{"judge": number, "comment": sheet.overall_comment} for number, sheet in enumerate(sheets, start=1) if (sheet.overall_comment or "").strip()],
        "disagreement_threshold": float(threshold),
    }


def overview_csv(submission, data: dict) -> HttpResponse:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    judges = sorted({item["judge"] for row in data["criteria"] for item in row["scores"]})
    writer.writerow(["criterion", "weight", *[f"judge {number}" for number in judges], "average", "spread", "flagged"])
    for row in data["criteria"]:
        by_judge = {item["judge"]: item["score"] for item in row["scores"]}
        writer.writerow([row["name"], row["weight"], *[by_judge.get(number, "") for number in judges], row["average"], row["spread"], "yes" if row["flagged"] else "no"])
    writer.writerow([])
    writer.writerow(["average out of 100", data["average"] if data["average"] is not None else ""])
    writer.writerow(["pass mark", data["pass_mark"] if data["pass_mark"] is not None else ""])
    response = HttpResponse(buffer.getvalue().encode("utf-8"), content_type="text/csv; charset=utf-8")
    response["Content-Disposition"] = f'attachment; filename="scores-{submission.reference_number or submission.id}.csv"'
    return response


class ScoresOverviewView(APIView):
    permission_classes = [HasAnyCapability.of("entries.assign", "dashboard.view")]
    renderer_classes = [JSONRenderer, CSVRenderer]

    @extend_schema(
        tags=TAGS,
        summary="All scores for one idea (3.19)",
        description="{average, pass_mark, judges_scored, judges_assigned, last_scored_at, criteria: [{id, name, weight, max, average, "
        "scores: [{judge, score}], spread, flagged}], comments: [{judge, comment}], disagreement_threshold}. Judges are numbers, never names. "
        "flagged: the scores differ by more than the challenge's disagreement_threshold. ?format=csv downloads it.",
        parameters=[OpenApiParameter("format", OpenApiTypes.STR, enum=["csv"])],
        responses={200: OpenApiTypes.OBJECT, (200, "text/csv"): OpenApiTypes.BINARY},
    )
    def get(self, request, submission_id):
        # entries.assign or dashboard.view already allow every idea; judges hold neither.
        submission = get_object_or_404(Submission.objects.select_related("program"), id=submission_id)
        data = scores_overview(submission)
        if request.query_params.get("format") == "csv":
            return overview_csv(submission, data)
        return api_success(data=data)
