from django.core.cache import cache
from django.db.models import Avg, Count

from apps.assignments.models import Assignment
from apps.capability.models import CapabilityScore
from apps.communications.models import CommunicationLog
from apps.evaluation.models import FinalDecision
from apps.submissions.models import Submission

_TTL = 300


class ReportSelector:
    @staticmethod
    def dashboard():
        key = "report:dashboard"
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = {
            "submissions_total": Submission.objects.count(),
            "submissions_by_status": list(Submission.objects.values("current_status").annotate(total=Count("id")).order_by("current_status")),
            "judge_completion_rate": list(Assignment.objects.values("status").annotate(total=Count("id")).order_by("status")),
            "communications_total": CommunicationLog.objects.count(),
        }
        cache.set(key, result, timeout=_TTL)
        return result

    @staticmethod
    def submissions_report():
        key = "report:submissions"
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = list(
            Submission.objects.values("program__title", "program__program_type__code", "current_status", "submission_type", "innovator__innovator_profile__region")
            .annotate(total=Count("id"))
            .order_by("program__title", "current_status", "innovator__innovator_profile__region")
        )
        cache.set(key, result, timeout=_TTL)
        return result

    @staticmethod
    def judging_report():
        key = "report:judging"
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = list(Assignment.objects.values("status").annotate(total=Count("id")).order_by("status"))
        cache.set(key, result, timeout=_TTL)
        return result

    @staticmethod
    def turnaround_report():
        key = "report:turnaround"
        cached = cache.get(key)
        if cached is not None:
            return cached
        durations = []
        for decision in FinalDecision.objects.select_related("submission").exclude(submission__submitted_at=None):
            durations.append((decision.decided_at - decision.submission.submitted_at).days)
        result = {
            "avg_submission_to_decision_days": (sum(durations) / len(durations)) if durations else None,
            "decisions_count": len(durations),
        }
        cache.set(key, result, timeout=_TTL)
        return result

    @staticmethod
    def capability_report():
        key = "report:capability"
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = {
            "average_scores_by_dimension": list(
                CapabilityScore.objects.values("dimension").annotate(average_score=Avg("score"), total=Count("id")).order_by("dimension")
            )
        }
        cache.set(key, result, timeout=_TTL)
        return result
