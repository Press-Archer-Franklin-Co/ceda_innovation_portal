from django.db.models import Avg, Count

from apps.assignments.models import Assignment
from apps.core.constants import AssignmentRoleType, AssignmentStatus, ScoreSheetStatus

from apps.evaluation.models import ScoreSheet


class EvaluationSelector:
    @staticmethod
    def judge_workload(user):
        return Assignment.objects.filter(
            assignee=user,
            role_type=AssignmentRoleType.JUDGE,
            status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED, AssignmentStatus.COMPLETED],
        ).select_related("submission", "workflow_step")

    @staticmethod
    def submission_summary(submission):
        final_qs = ScoreSheet.objects.filter(
            submission=submission,
            is_final=True,
            status__in=[ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED],
        ).prefetch_related("criterion_scores__criterion")
        aggregate = final_qs.aggregate(avg_score=Avg("total_score"), judges=Count("id"))
        per_criterion = {}
        for sheet in final_qs:
            for score in sheet.criterion_scores.all():
                bucket = per_criterion.setdefault(
                    str(score.criterion_id),
                    {"criterion_id": str(score.criterion_id), "criterion_name": score.criterion.name, "total_raw_score": 0.0, "count": 0},
                )
                bucket["total_raw_score"] += float(score.raw_score)
                bucket["count"] += 1
        return {
            "average_score": float(aggregate["avg_score"]) if aggregate["avg_score"] is not None else None,
            "total_evaluators": ScoreSheet.objects.filter(submission=submission).values("judge_id").distinct().count(),
            "completed_evaluators": aggregate["judges"],
            "per_criterion": [
                {
                    "criterion_id": item["criterion_id"],
                    "criterion_name": item["criterion_name"],
                    "average_raw_score": item["total_raw_score"] / item["count"] if item["count"] else None,
                }
                for item in per_criterion.values()
            ],
        }
