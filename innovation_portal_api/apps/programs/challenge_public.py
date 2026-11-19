"""Public challenge list and detail (B5, screens 1.7 and 1.8), setup status and judging settings (3.6, 3.7).

Never exposes judges, scores or internal notes.
"""

from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.core.constants import ProgramStatus
from apps.core.i18n import get_text
from apps.programs.models import Program

STATUSES = ("open", "upcoming", "closed")
SETUP_STEPS = ("details", "dates", "support", "judging", "form", "panel")
LANGS = ("en", "tn")


def _iso(value):
    return value.isoformat() if value else None


def text_in(obj, attr: str, lang: str) -> str:
    english = getattr(obj, attr, "") or ""
    tn = ((obj.translations or {}).get("tn") or {}).get(attr, "")
    return tn if lang == "tn" and isinstance(tn, str) and tn.strip() else english


def _pick(value, lang):
    if isinstance(value, dict) and "en" in value:
        text = value.get(lang) or ""
        return text if text.strip() else value.get("en", "")
    return value


def _sector(sector, lang):
    return {"id": str(sector.id), "slug": sector.slug, "name": get_text(sector.name, lang)}


def challenge_status(program, now=None) -> str:
    now = now or timezone.now()
    opens, closes = program.submission_opens_at, program.submission_closes_at
    if program.status in (ProgramStatus.CLOSED, ProgramStatus.ARCHIVED) or (closes and closes < now):
        return "closed"
    if opens and opens > now:
        return "upcoming"
    return "open"


def public_queryset():
    return (
        Program.objects.filter(is_public=True, is_general_intake=False, status__in=[ProgramStatus.PUBLISHED, ProgramStatus.CLOSED])
        .select_related("program_type", "cover", "form")
        .prefetch_related("sectors")
    )


def has_results(program) -> bool:
    return bool(program.results_announced_at) or program.winner_spotlights.exists()


def card(program, lang: str, now=None) -> dict:
    """One challenge in the public list (R-2a / B5). Same names the home page uses."""
    now = now or timezone.now()
    opens, closes = program.submission_opens_at, program.submission_closes_at
    progress = None
    if opens and closes and closes > opens:
        progress = round(min(1.0, max(0.0, (now - opens) / (closes - opens))), 3)
    status = challenge_status(program, now)
    sectors = [_sector(sector, lang) for sector in program.sectors.all()]
    summary = text_in(program, "summary", lang) or (program.description or "").strip().split("\n")[0][:200]
    return {
        "id": str(program.id),
        "slug": program.slug,
        "title": program.title,
        "status": status,
        "summary": summary,
        "sector": sectors[0] if sectors else None,
        "sectors": sectors,
        "support_headline": text_in(program, "support_headline", lang),
        "opens_at": _iso(opens),
        "closes_at": _iso(closes),
        "days_left": max(0, (closes - now).days) if status == "open" and closes else 0,
        "window_progress": progress,
        "cover_url": program.cover.file.url if program.cover_id and program.cover.file else None,
        "has_results": status == "closed" and has_results(program),
        "results_url": f"/challenges/{program.slug}/results" if status == "closed" and has_results(program) else None,
    }


def public_list(*, status: str | None, sector: str | None, sort: str | None, lang: str) -> dict:
    now = timezone.now()
    queryset = public_queryset()
    if sector:
        match = Q(sectors__slug=sector) | Q(sectors__id=sector) if _is_uuid(sector) else Q(sectors__slug=sector)
        queryset = queryset.filter(match).distinct()
    programs = list(queryset)
    counts = {name: 0 for name in STATUSES}
    for program in programs:
        counts[challenge_status(program, now)] += 1
    if status in STATUSES:
        programs = [program for program in programs if challenge_status(program, now) == status]
    far = now + timezone.timedelta(days=36500)
    if sort == "closing_soon":
        programs.sort(key=lambda p: p.submission_closes_at or far)
    elif sort == "newest":
        programs.sort(key=lambda p: p.published_at or p.created_at, reverse=True)
    else:
        programs.sort(key=lambda p: (STATUSES.index(challenge_status(p, now)), p.submission_closes_at or far))
    return {"counts": {**counts, "all": sum(counts.values())}, "results": [card(program, lang, now) for program in programs]}


def _is_uuid(value) -> bool:
    import uuid

    try:
        uuid.UUID(str(value))
        return True
    except ValueError:
        return False


def public_detail(program, lang: str) -> dict:
    """Everything the challenge page shows (1.8), in one call."""
    from apps.submissions.models import ApplicationDraft, Submission
    from apps.support.models import FAQ

    data = card(program, lang)
    criteria = []
    if program.marking_criteria_id:
        for item in program.marking_criteria.items.order_by("ordering"):
            criteria.append({"name": item.name, "description": item.description, "weight": float(item.weight)})
    timeline = [
        {"title": entry.title, "starts_at": _iso(entry.starts_at), "ends_at": _iso(entry.ends_at)}
        for entry in program.timelines.order_by("starts_at")
    ]
    faqs = [{"question": faq.question, "answer": faq.answer} for faq in FAQ.objects.filter(program=program, is_public=True).order_by("ordering")]
    partners = []
    partner_model = _partner_model()
    if partner_model is not None:
        now = timezone.now()
        for partner in (
            partner_model.objects.filter(programs=program, is_active=True)
            .filter(Q(show_from__isnull=True) | Q(show_from__lte=now))
            .filter(Q(show_until__isnull=True) | Q(show_until__gt=now))
            .order_by("tier_rank", "order")
        ):
            partners.append({"name": partner.name, "tier": partner.tier, "url": partner.url, "logo_url": partner.logo.file.url if partner.logo_id else None})
    form_summary = None
    if program.form_id:
        from apps.programs.form_builder import FormLibraryService

        form_summary = FormLibraryService.summary(program.form)
    estimated = (form_summary or {}).get("estimated_minutes")
    if estimated is None and form_summary:
        estimated = max(2, round(form_summary["question_count"] * 1.5))  # about 90 seconds a question
    data.update(
        {
            "description": program.description,
            "problem_statement": text_in(program, "problem_statement", lang),
            "who_can_enter": text_in(program, "who_can_enter", lang),
            "where": text_in(program, "where", lang),
            "what_we_look_for": [_pick(item, lang) for item in program.what_we_look_for or []],
            "support_package": [
                {"title": _pick(item.get("title"), lang), "amount_label": item.get("amount_label", ""), "description": _pick(item.get("description"), lang)}
                for item in program.support_package or []
                if isinstance(item, dict)
            ],
            "judging_criteria": criteria,
            "key_dates": timeline,
            "faqs": faqs,
            "partners": partners,
            "started_count": ApplicationDraft.objects.filter(program=program).count() + Submission.objects.filter(program=program, submitted_at__isnull=False).count(),
            "estimated_minutes": estimated,
            "form_id": str(program.form_id) if program.form_id else None,
            "availability": program.availability_summary(),
        }
    )
    return data


def _partner_model():
    """Partner arrives with B6; until then challenge pages have no partners."""
    from django.apps import apps

    try:
        return apps.get_model("content", "Partner")
    except LookupError:
        return None


def setup_status(program) -> dict:
    """Which of the 6 builder steps (3.6) are complete."""
    judges = program.challenge_judges.count()
    weights = _criteria_total(program)
    steps = {
        "details": bool(program.title.strip() and (program.summary or program.description).strip() and program.sectors.exists()),
        "dates": bool(program.submission_opens_at and program.submission_closes_at and program.submission_closes_at > program.submission_opens_at),
        "support": bool(program.support_headline.strip() or program.support_package),
        "judging": bool(program.marking_criteria_id and weights == Decimal("100")),
        "form": bool(program.form_id and program.form.versions.exists()),
        "panel": judges > 0,
    }
    return {
        "steps": [{"step": name, "complete": steps[name]} for name in SETUP_STEPS],
        "complete_count": sum(steps.values()),
        "ready_to_publish": all(steps.values()),
    }


# --- Judging settings (R-10) -------------------------------------------------------------


def _criteria_total(program) -> Decimal:
    if not program.marking_criteria_id:
        return Decimal("0")
    return sum((item.weight for item in program.marking_criteria.items.all()), Decimal("0"))


def _meanings(value):
    meanings = []
    for item in value or []:
        if isinstance(item, str):
            item = {"en": item}
        if isinstance(item, dict):
            meanings.append({lang: str(item.get(lang) or "") for lang in LANGS})
    return meanings


def criterion_payload(item) -> dict:
    return {
        "id": str(item.id),
        "library_id": str(item.library_item_id) if item.library_item_id else None,
        "name": item.name,
        "description": item.description,
        "weight": float(item.weight),
        "order": item.ordering,
        "score_meanings": _meanings(item.score_meanings),
        "comment_required_scores": item.comment_required_scores or [],
        "max_score": float(item.max_score),
    }


def judging_settings(program) -> dict:
    items = list(program.marking_criteria.items.order_by("ordering")) if program.marking_criteria_id else []
    return {
        "criteria": [criterion_payload(item) for item in items],
        "total": float(sum((item.weight for item in items), Decimal("0"))),
        "pass_mark": float(program.pass_mark) if program.pass_mark is not None else None,
        "reviewers_per_idea": program.reviewers_per_idea,
        "judge_count": program.challenge_judges.count(),
    }


def validate_weights(weights) -> None:
    total = sum((Decimal(str(weight)) for weight in weights), Decimal("0"))
    if total != Decimal("100"):
        raise ValidationError({"weights": f"Weights must add up to 100. They add up to {total.normalize():f} now.", "total": float(total)})


@transaction.atomic
def save_judging(program, data: dict, *, actor) -> dict:
    from apps.evaluation.models import MarkingCriteria, MarkingCriteriaItem
    from apps.programs.challenge_judging import ChallengeJudgingService

    criteria = data.get("criteria") or []
    validate_weights([item["weight"] for item in criteria])
    own = program.marking_criteria
    if own is None or own.is_library or own.challenge_programs.exclude(id=program.id).exists():
        # Each challenge gets its own set, so editing one never changes another.
        own = MarkingCriteria.objects.create(title=f"{program.title} criteria", created_by=actor)
        program.marking_criteria = own
    existing = {str(item.id): item for item in own.items.all()}
    keep = []
    for order, row in enumerate(criteria, start=1):
        library = None
        if row.get("library_id"):
            library = MarkingCriteriaItem.objects.filter(id=row["library_id"], criteria__is_library=True).first()
            if library is None:
                raise ValidationError({"criteria": f"Library criterion {row['library_id']} not found."})
        item = existing.get(str(row.get("id") or "")) or MarkingCriteriaItem(criteria=own, max_score=Decimal("5"), min_score=Decimal("1"))
        item.name = row.get("name") or (library.name if library else "")
        item.description = row.get("description", library.description if library else "")
        item.weight = Decimal(str(row["weight"]))
        item.ordering = order
        item.score_meanings = _meanings(row.get("score_meanings", library.score_meanings if library else []))
        item.comment_required_scores = sorted({int(score) for score in row.get("comment_required_scores", library.comment_required_scores if library else [])})
        item.library_item = library or item.library_item
        if not item.name.strip():
            raise ValidationError({"criteria": f"Criterion {order} needs a name."})
        item.save()
        keep.append(item.id)
    own.items.exclude(id__in=keep).delete()
    if "pass_mark" in data:
        program.pass_mark = data["pass_mark"]
    if "reviewers_per_idea" in data:
        program.reviewers_per_idea = data["reviewers_per_idea"]
    program.save(update_fields=["marking_criteria", "pass_mark", "reviewers_per_idea", "updated_at"])
    ChallengeJudgingService.sync_workflow(program, actor=actor)
    AuditService.log_action(actor=actor, action_type="challenge_judging_updated", target=program, after_state={"criteria": len(keep), "pass_mark": str(program.pass_mark)})
    return judging_settings(program)
