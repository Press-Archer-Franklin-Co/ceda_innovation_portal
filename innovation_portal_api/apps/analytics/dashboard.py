"""B7: numbers for the staff dashboard (3.1) and reports (3.2). One filter row drives every call.

Filters: from, to (submission dates), program, sector, district (id or slug), channel.
Results are cached for 5 minutes per filter combination (and per person for "waiting for me").
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Max, Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.core.constants import IntakeChannel, SubmissionStatus as S

CACHE_SECONDS = 300
WAITING_DAYS = 7

# Stages in the order the public status words use (submissions.status_labels).
PIPELINE_STAGES = [
    ("received", "Received", {S.SUBMITTED}),
    ("screening", "Under screening", {S.SCREENING}),
    ("review", "Under review", {S.UNDER_REVIEW}),
    ("judging", "Under judging", {S.JUDGING_REVIEW, S.ASSIGNED_TO_JUDGES, S.UNDER_JUDGING}),
    ("shortlisted", "Shortlisted", {S.SHORTLISTED}),
    ("finalist", "Finalist", {S.FINALIST}),
    ("action_needed", "Action needed from applicant", {S.REQUIRES_MORE_INFORMATION, S.RETURNED}),
]
FINISHED = {S.APPROVED, S.REJECTED, S.SCREENED_OUT, S.WINNER, S.CLOSED, S.SELECTED_FOR_HACKATHON}
PASSED_CHECK = {S.UNDER_REVIEW, S.JUDGING_REVIEW, S.ASSIGNED_TO_JUDGES, S.UNDER_JUDGING, S.SHORTLISTED, S.FINALIST, S.APPROVED, S.WINNER, S.SELECTED_FOR_HACKATHON}
REVIEWED = {S.JUDGING_REVIEW, S.UNDER_JUDGING, S.SHORTLISTED, S.FINALIST, S.APPROVED, S.WINNER, S.SELECTED_FOR_HACKATHON}
PANEL = {S.SHORTLISTED, S.FINALIST, S.SELECTED_FOR_HACKATHON, S.WINNER}
SUPPORTED = {S.APPROVED, S.WINNER, S.SELECTED_FOR_HACKATHON}


@dataclass(frozen=True)
class Filters:
    start: date | None
    end: date | None
    program: str | None
    sector: str | None
    district: str | None
    channel: str | None

    def key(self) -> str:
        return hashlib.sha1(json.dumps(self.__dict__, default=str, sort_keys=True).encode()).hexdigest()[:16]

    def as_dict(self) -> dict:
        return {"from": _iso(self.start), "to": _iso(self.end), "program": self.program, "sector": self.sector, "district": self.district, "channel": self.channel}


def _iso(value):
    return value.isoformat() if value else None


def _parse_date(value, name):
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        raise ValidationError({name: "Use a date like 2026-11-01."})


def parse_filters(params) -> Filters:
    """The one place that reads the filter row (query params or an export's filters dict)."""
    get = params.get
    start, end = _parse_date(get("from"), "from"), _parse_date(get("to"), "to")
    if start and end and end < start:
        raise ValidationError({"to": "The end date is before the start date."})
    channel = get("channel") or None
    if channel and channel not in IntakeChannel.values:
        raise ValidationError({"channel": f"Use one of: {', '.join(IntakeChannel.values)}."})
    return Filters(start, end, get("program") or None, get("sector") or None, get("district") or None, channel)


def _ref_q(field: str, value: str) -> Q:
    import uuid

    try:
        return Q(**{f"{field}_id": uuid.UUID(str(value))})
    except ValueError:
        return Q(**{f"{field}__slug": value})


def _aware(day: date, end: bool = False) -> datetime:
    return timezone.make_aware(datetime.combine(day, time.max if end else time.min))


def base_queryset(filters: Filters, *, dates: bool = True):
    from apps.submissions.models import Submission

    queryset = Submission.objects.filter(submitted_at__isnull=False)
    if filters.program:
        try:
            import uuid

            queryset = queryset.filter(program_id=uuid.UUID(filters.program))
        except ValueError:
            queryset = queryset.filter(program__slug=filters.program)
    if filters.sector:
        queryset = queryset.filter(_ref_q("sector", filters.sector))
    if filters.district:
        queryset = queryset.filter(_ref_q("district", filters.district))
    if filters.channel:
        queryset = queryset.filter(channel=filters.channel)
    if dates and filters.start:
        queryset = queryset.filter(submitted_at__gte=_aware(filters.start))
    if dates and filters.end:
        queryset = queryset.filter(submitted_at__lte=_aware(filters.end, end=True))
    return queryset


def cached(name: str, filters: Filters, compute, *, per_user=None):
    key = f"analytics:{name}:{filters.key()}:{getattr(per_user, 'pk', '')}"
    value = cache.get(key)
    if value is None:
        value = compute()
        cache.set(key, value, CACHE_SECONDS)
    return value


def _last_change(queryset):
    """{submission_id: time of last status change, or submitted_at}."""
    from apps.submissions.models import SubmissionStatusHistory

    changes = dict(
        SubmissionStatusHistory.objects.filter(submission__in=queryset).values_list("submission_id").annotate(last=Max("created_at")).values_list("submission_id", "last")
    )
    return {pk: changes.get(pk) or submitted for pk, submitted in queryset.values_list("id", "submitted_at")}


def _pct(now: int, before: int):
    if not before:
        return None
    return round((now - before) * 100 / before, 1)


# --- Numbers ---------------------------------------------------------------------------------


def kpis(filters: Filters, user) -> dict:
    def compute():
        from apps.submissions.models import SubmissionOutcome, SubmissionStatusHistory
        from apps.workflow.models import TaskExecution

        today = timezone.localdate()
        end = filters.end or today
        start = filters.start or (end - timedelta(days=29))
        length = (end - start).days + 1
        current = base_queryset(Filters(start, end, filters.program, filters.sector, filters.district, filters.channel))
        previous = base_queryset(Filters(start - timedelta(days=length), start - timedelta(days=1), filters.program, filters.sector, filters.district, filters.channel))
        submitted, before = current.count(), previous.count()

        active = base_queryset(filters).exclude(current_status__in=FINISHED | {S.DRAFT})
        cutoff = timezone.now() - timedelta(days=WAITING_DAYS)
        waiting = sum(1 for moment in _last_change(active).values() if moment and moment < cutoff)

        finished = base_queryset(filters).filter(current_status__in=FINISHED)
        decided = dict(SubmissionOutcome.objects.filter(submission__in=finished).values_list("submission_id").annotate(at=Max("decided_at")).values_list("submission_id", "at"))
        history = dict(
            SubmissionStatusHistory.objects.filter(submission__in=finished, to_status__in=FINISHED).values_list("submission_id").annotate(at=Max("created_at")).values_list("submission_id", "at")
        )
        days = []
        for pk, submitted_at in finished.values_list("id", "submitted_at"):
            at = decided.get(pk) or history.get(pk)
            if at and submitted_at:
                days.append(max(0.0, (at - submitted_at).total_seconds() / 86400))
        target = getattr(settings, "ANALYTICS_DECISION_TARGET_DAYS", 10)

        mine = TaskExecution.objects.filter(assignee=user, status__in=[TaskExecution.STATUS_PENDING, TaskExecution.STATUS_CLAIMED])
        return {
            "period": {"from": start.isoformat(), "to": end.isoformat(), "previous_from": (start - timedelta(days=length)).isoformat(), "previous_to": (start - timedelta(days=1)).isoformat()},
            "submitted": {"count": submitted, "previous": before, "change_pct": _pct(submitted, before)},
            "in_review": {"count": active.count(), "waiting_over_7_days": waiting},
            "days_to_decision": {"average": round(sum(days) / len(days), 1) if days else None, "decided": len(days), "target": target},
            "waiting_for_me": {"count": mine.count(), "due_today": mine.filter(due_at__date=today).count()},
        }

    return cached("kpis", filters, compute, per_user=user)


def series(filters: Filters, interval: str) -> dict:
    if interval not in ("week", "month"):
        raise ValidationError({"interval": "Use week or month."})

    def compute():
        from django.db.models.functions import TruncMonth, TruncWeek

        today = timezone.localdate()
        end = filters.end or today
        if interval == "week":
            start = filters.start or end - timedelta(weeks=11)
            first = start - timedelta(days=start.weekday())
            trunc = TruncWeek("submitted_at")
        else:
            start = filters.start or (end.replace(day=1) - timedelta(days=330)).replace(day=1)
            first = start.replace(day=1)
            trunc = TruncMonth("submitted_at")
        queryset = base_queryset(Filters(start, end, filters.program, filters.sector, filters.district, filters.channel))
        found = {}
        for bucket, total in queryset.annotate(bucket=trunc).values_list("bucket").annotate(total=Count("id")).values_list("bucket", "total"):
            day = timezone.localtime(bucket).date() if isinstance(bucket, datetime) and timezone.is_aware(bucket) else (bucket.date() if isinstance(bucket, datetime) else bucket)
            found[day] = found.get(day, 0) + total
        points, cursor = [], first
        while cursor <= end:
            points.append({"period_start": cursor.isoformat(), "count": found.get(cursor, 0)})
            if interval == "week":
                cursor += timedelta(weeks=1)
            else:
                cursor = (cursor.replace(day=28) + timedelta(days=4)).replace(day=1)
        return {"interval": interval, "points": points, "total": sum(point["count"] for point in points)}

    return cached(f"series-{interval}", filters, compute)


def pipeline(filters: Filters) -> dict:
    def compute():
        queryset = base_queryset(filters).exclude(current_status__in=FINISHED | {S.DRAFT})
        last = _last_change(queryset)
        cutoff = timezone.now() - timedelta(days=WAITING_DAYS)
        statuses = dict(queryset.values_list("id", "current_status"))
        stages = []
        for code, label, members in PIPELINE_STAGES:
            ids = [pk for pk, status in statuses.items() if status in members]
            stages.append({"code": code, "label": label, "count": len(ids), "waiting_over_7_days": sum(1 for pk in ids if last.get(pk) and last[pk] < cutoff)})
        worst = max(stages, key=lambda stage: stage["waiting_over_7_days"])
        return {"stages": stages, "bottleneck": worst["code"] if worst["waiting_over_7_days"] else None}

    return cached("pipeline", filters, compute)


def funnel(filters: Filters) -> dict:
    def compute():
        from apps.submissions.models import SubmissionStatusHistory

        queryset = base_queryset(filters)
        reached: dict = {}
        for pk, status in queryset.values_list("id", "current_status"):
            reached.setdefault(pk, set()).add(status)
        for pk, status in SubmissionStatusHistory.objects.filter(submission__in=queryset).values_list("submission_id", "to_status"):
            reached.setdefault(pk, set()).add(status)

        def count(members):
            return sum(1 for statuses in reached.values() if statuses & members)

        return {
            "submitted": len(reached),
            "passed_check": count(PASSED_CHECK),
            "reviewed": count(REVIEWED),
            "panel": count(PANEL),
            "supported": count(SUPPORTED),
            # No field records funding yet; shown as not tracked rather than guessed.
            "funded": None,
            "funded_tracked": False,
        }

    return cached("funnel", filters, compute)


def sources(filters: Filters) -> dict:
    def compute():
        from apps.core.i18n import get_text

        queryset = base_queryset(filters)
        total = queryset.count()
        by_channel = dict(queryset.values_list("channel").annotate(total=Count("id")).values_list("channel", "total"))
        channels = [
            {"channel": value, "label": label, "count": by_channel.get(value, 0), "pct": round(by_channel.get(value, 0) * 100 / total, 1) if total else 0.0}
            for value, label in IntakeChannel.choices
        ]
        districts = (
            queryset.exclude(district__isnull=True).values("district_id", "district__slug", "district__name").annotate(total=Count("id")).order_by("-total", "district__slug")[:5]
        )
        return {
            "total": total,
            "channels": channels,
            "top_districts": [{"id": str(row["district_id"]), "slug": row["district__slug"], "name": get_text(row["district__name"]), "count": row["total"]} for row in districts],
            "no_district": queryset.filter(district__isnull=True).count(),
        }

    return cached("sources", filters, compute)


def sectors(filters: Filters) -> dict:
    def compute():
        from apps.core.i18n import get_text

        queryset = base_queryset(filters)
        rows = queryset.exclude(sector__isnull=True).values("sector_id", "sector__slug", "sector__name").annotate(total=Count("id")).order_by("-total", "sector__slug")
        return {
            "sectors": [{"id": str(row["sector_id"]), "slug": row["sector__slug"], "name": get_text(row["sector__name"]), "count": row["total"]} for row in rows],
            "no_sector": queryset.filter(sector__isnull=True).count(),
        }

    return cached("sectors", filters, compute)


def _gender(value: str) -> str:
    text = (value or "").strip().lower()
    if text in {"f", "female", "woman", "women", "mosadi"}:
        return "women"
    if text in {"m", "male", "man", "men", "monna"}:
        return "men"
    return "other_or_unknown" if text else "unknown"


def inclusion(filters: Filters) -> dict:
    def compute():
        queryset = base_queryset(filters).select_related("innovator__innovator_profile", "district")
        age = {"youth_18_35": 0, "36_and_over": 0, "under_18": 0, "unknown": 0}
        gender = {"women": 0, "men": 0, "other_or_unknown": 0, "unknown": 0}
        place = {"rural": 0, "urban": 0, "unknown": 0}
        for submission in queryset:
            profile = getattr(submission.innovator, "innovator_profile", None) if submission.innovator_id else None
            born = getattr(profile, "date_of_birth", None)
            if born and submission.submitted_at:
                on = submission.submitted_at.date()
                years = on.year - born.year - ((on.month, on.day) < (born.month, born.day))
                age["youth_18_35" if 18 <= years <= 35 else "36_and_over" if years >= 36 else "under_18"] += 1
            else:
                age["unknown"] += 1
            gender[_gender(getattr(profile, "gender", ""))] += 1
            if submission.district_id:
                place["rural" if submission.district.is_rural else "urban"] += 1
            else:
                place["unknown"] += 1
        return {"total": sum(age.values()), "age": age, "gender": gender, "place": place}

    return cached("inclusion", filters, compute)


REPORTS = {
    "kpis": lambda filters, user: kpis(filters, user),
    "series": lambda filters, user: series(filters, "week"),
    "pipeline": lambda filters, user: pipeline(filters),
    "funnel": lambda filters, user: funnel(filters),
    "sources": lambda filters, user: sources(filters),
    "sectors": lambda filters, user: sectors(filters),
    "inclusion": lambda filters, user: inclusion(filters),
}
