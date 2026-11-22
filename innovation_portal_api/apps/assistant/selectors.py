"""AI helper reads (C3): related-ideas shortlist, usage report, admin overview."""

from __future__ import annotations

import re
from datetime import timedelta
from decimal import Decimal

from django.contrib.postgres.search import TrigramSimilarity
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.assistant.client import FLAG, AssistantClient, _month_start, month_spend
from apps.assistant.models import UsageRecord
from apps.assistant.privacy import safe_submission_answers
from apps.platform_config.flags import is_enabled

SHORTLIST_SIZE = 10
CANDIDATE_POOL = 60
MIN_SCORE = 0.12
STOPWORDS = frozenset(
    "about after again their there these those which while where would could should other people using through because between "
    "botswana idea ideas project business small local community products product service services market create help make".split()
)

# TODO tn-review: the Setswana text below is a first draft by the ai lane; a Setswana speaker at CEDA must check it.
PRIVACY_NOTE = {
    "en": (
        "What is sent to Anthropic: your guidance and the user manual text; for innovator guidance, the answers on the form step being "
        "checked; for officer hints and idea matching, the idea's title, sector, district and answers; for help, the question asked. "
        "Never sent: names, phone numbers, email addresses, Omang or other ID numbers, dates of birth, bank details, uploaded files, "
        "or any form field marked sensitive. Every call is recorded in the audit log "
        "with who asked."
    ),
    "tn": (
        "Se se romelwang kwa Anthropic: kaelo ya lona le buka ya kaedi; mo kaelong ya baitlhami, dikarabo tsa kgato e e tlhatlhobiwang; "
        "mo dikakantshong tsa batlhankedi le go tshwantsha dikakanyo, setlhogo, lephata, kgaolo le dikarabo tsa kakanyo; mo thusong, potso e "
        "e bodiwang. Ga go ke go romelwa: maina, dinomore tsa mogala, diaterese tsa email, Omang kgotsa dinomore tse dingwe tsa boitshupo, "
        "matlha a botsalo, dintlha tsa banka, difaele, kgotsa karolo epe ya foromo e e tshwailweng e le ya sephiri. Pitso nngwe le nngwe e kwalwa mo rekotong ya ditiro le gore ke mang a botsitseng."
    ),
}


def _keywords(text: str) -> set[str]:
    return {word for word in re.findall(r"[a-z]{5,}", (text or "").lower()) if word not in STOPWORDS}


def _idea_text(submission) -> str:
    return " ".join([submission.title, *(row["answer"] for row in safe_submission_answers(submission))])


def related_shortlist(*, submission, user) -> list:
    """Up to SHORTLIST_SIZE other ideas this officer may see, most alike first.

    The pool comes from SubmissionSelector.for_user, so an idea the officer cannot open is never
    shortlisted, sent to Claude or shown.
    """
    from apps.submissions.selectors import SubmissionSelector

    visible = (
        SubmissionSelector.for_user(user)
        .exclude(pk=submission.pk)
        .exclude(current_status="draft")
        .select_related("sector", "district")
    )
    pool = list(
        visible.annotate(title_similarity=TrigramSimilarity("title", submission.title))
        .filter(Q(title_similarity__gte=0.05) | Q(sector_id=submission.sector_id) if submission.sector_id else Q(title_similarity__gte=0.05))
        .order_by("-title_similarity", "-submitted_at")[:CANDIDATE_POOL]
    )
    mine = _keywords(_idea_text(submission))
    scored = []
    for other in pool:
        overlap = len(mine & _keywords(_idea_text(other))) / max(len(mine), 1)
        score = float(getattr(other, "title_similarity", 0) or 0) + min(overlap, 1.0) * 0.6
        if submission.sector_id and other.sector_id == submission.sector_id:
            score += 0.1
        if submission.district_id and other.district_id == submission.district_id:
            score += 0.05
        if score >= MIN_SCORE:
            scored.append((score, other))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [other for _, other in scored[:SHORTLIST_SIZE]]


def usage_report(*, days: int = 30) -> dict:
    since = timezone.localtime() - timedelta(days=days)
    rows = UsageRecord.objects.filter(created_at__gte=since)
    by_day = (
        rows.annotate(day=TruncDate("created_at"))
        .values("day")
        .annotate(calls=Count("id", filter=Q(ok=True)), skipped=Count("id", filter=Q(ok=False)), cost=Sum("cost_usd"))
        .order_by("day")
    )
    by_feature = (
        rows.values("feature")
        .annotate(calls=Count("id", filter=Q(ok=True)), skipped=Count("id", filter=Q(ok=False)), cost=Sum("cost_usd"))
        .order_by("feature")
    )
    runtime = AssistantClient.runtime()
    spend = month_spend()
    limit = runtime.monthly_limit_usd if runtime else None
    return {
        "days": days,
        "month": {
            "from": _month_start().date().isoformat(),
            "spend_usd": str(spend.quantize(Decimal("0.01"))),
            "limit_usd": str(limit) if limit is not None else None,
            "left_usd": str(max(limit - spend, Decimal("0")).quantize(Decimal("0.01"))) if limit is not None else None,
            "calls": UsageRecord.objects.filter(created_at__gte=_month_start(), ok=True).count(),
        },
        "by_day": [{"date": row["day"].isoformat(), "calls": row["calls"], "skipped": row["skipped"], "cost_usd": str(row["cost"] or 0)} for row in by_day],
        "by_feature": [{"feature": row["feature"], "calls": row["calls"], "skipped": row["skipped"], "cost_usd": str(row["cost"] or 0)} for row in by_feature],
        "recent_problems": [
            {"at": record.created_at.isoformat(), "feature": record.feature, "outcome": record.outcome}
            for record in UsageRecord.objects.filter(ok=False).order_by("-created_at")[:10]
        ],
    }


def overview(language: str = "en") -> dict:
    """Admin page header: is the helper working, and if not, why."""
    from apps.platform_config.models import IntegrationConnection

    connection = IntegrationConnection.objects.filter(kind="ai").order_by("-is_active", "-updated_at").first()
    runtime = AssistantClient.runtime()
    flag_on = is_enabled(FLAG)
    if connection is None:
        state = "waiting_for_key"
    elif not connection.is_active:
        state = "not_active" if connection.status != IntegrationConnection.Status.FAILED else "key_failed"
    elif not flag_on:
        state = "switched_off"
    elif runtime and (runtime.monthly_limit_usd <= 0 or month_spend() >= runtime.monthly_limit_usd):
        state = "limit_reached"
    else:
        state = "ready"
    config = (connection.config or {}) if connection else {}
    return {
        "state": state,
        "helper_on": flag_on,
        "connection": (
            {
                "id": str(connection.pk),
                "name": connection.name,
                "status": connection.status,
                "is_active": connection.is_active,
                "model": config.get("model") or "",
                "last_tested_at": connection.last_tested_at.isoformat() if connection.last_tested_at else None,
                "last_test_ok": bool((connection.last_test_result or {}).get("ok")) if connection.last_test_result else None,
            }
            if connection
            else None
        ),
        "settings": {
            key: config.get(key, default)
            for key, default in (
                ("feature_draft_check", True),
                ("feature_hints", True),
                ("feature_related", True),
                ("feature_help", True),
                ("feature_web_chat", True),
                ("allow_guests_help", False),
                ("monthly_limit_usd", 50),
                ("timeout_seconds", 30),
            )
        },
        "status": AssistantClient.status(),
        "privacy_note": PRIVACY_NOTE["tn" if language == "tn" else "en"],
    }
