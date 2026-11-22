"""R-59 part 2 (3.36): the live hackathon page.

Staff edit a draft and send it for approval like the home page; the live page stays until approved.
Live updates from the venue post at once.
"""

from __future__ import annotations

import uuid
from datetime import timedelta

from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService

SECTION_KEYS = ("banner", "schedule", "venue", "prizes", "teams", "updates", "faqs")
PAGE_FIELDS = ("page_sections", "venue", "schedule_items", "prize_items")
ACTIVE_WINDOW = timedelta(days=30)


def _iso(value):
    return value.isoformat() if value else None


def _text(value, lang: str) -> str:
    value = value or {}
    return (value.get(lang) or "").strip() or value.get("en", "") if isinstance(value, dict) else str(value)


def live_document(detail) -> dict:
    return {name: getattr(detail, name) for name in PAGE_FIELDS}


def draft_document(detail) -> dict:
    return {**live_document(detail), **(detail.draft or {})}


def clean(data: dict) -> dict:
    """Checks a page document and returns it in the stored shape."""
    from apps.content.models import Partner

    out = {}
    if "page_sections" in data:
        sections = []
        for order, item in enumerate(data["page_sections"] or [], start=1):
            if item.get("key") not in SECTION_KEYS:
                raise ValidationError({"page_sections": f"Section keys are: {', '.join(SECTION_KEYS)}."})
            sections.append({"key": item["key"], "enabled": bool(item.get("enabled", True)), "order": int(item.get("order") or order)})
        if len({item["key"] for item in sections}) != len(sections):
            raise ValidationError({"page_sections": "Each section only once."})
        out["page_sections"] = sorted(sections, key=lambda item: item["order"])
    if "venue" in data:
        venue = data["venue"] or {}
        out["venue"] = {key: str(venue.get(key) or "").strip()[:300] for key in ("name", "address", "map_url")}
    if "schedule_items" in data:
        items = []
        for item in data["schedule_items"] or []:
            starts = parse_datetime(str(item.get("starts_at") or ""))
            title = item.get("title") or {}
            if starts is None or not str(title.get("en") or "").strip():
                raise ValidationError({"schedule_items": "Each item needs starts_at (date and time) and an English title."})
            items.append({"id": str(item.get("id") or uuid.uuid4().hex[:12]), "starts_at": starts.isoformat(), "title": {"en": str(title["en"]).strip()[:200], "tn": str(title.get("tn") or "").strip()[:200]}})
        out["schedule_items"] = sorted(items, key=lambda item: item["starts_at"])
    if "prize_items" in data:
        prizes = []
        for item in data["prize_items"] or []:
            sponsor = item.get("sponsor_partner_id")
            if sponsor and not Partner.objects.filter(id=sponsor).exists():
                raise ValidationError({"prize_items": "The sponsor must be one of the partners (3.13)."})
            prizes.append({"place": str(item.get("place") or "")[:40], "label": str(item.get("label") or "")[:200], "amount": str(item.get("amount") or "")[:80], "sponsor_partner_id": str(sponsor) if sponsor else None})
        out["prize_items"] = prizes
    return out


def save_draft(detail, data: dict, *, actor) -> dict:
    detail.draft = {**(detail.draft or {}), **clean(data)}
    detail.save(update_fields=["draft", "updated_at"])
    AuditService.log_action(actor=actor, action_type="hackathon_page_draft_saved", target=detail)
    return staff_document(detail)


def submit(detail, *, actor):
    from apps.content.services import ApprovalService

    document = clean(draft_document(detail))
    return ApprovalService.create(detail, actor=actor, summary=f"Hackathon page: {detail.program.title}", payload={"hackathon_page": document})


def apply_approved(detail, payload: dict) -> None:
    document = (payload or {}).get("hackathon_page") or {}
    for name in PAGE_FIELDS:
        if name in document:
            setattr(detail, name, document[name])
    detail.draft = {}
    detail.save(update_fields=[*PAGE_FIELDS, "draft", "updated_at"])


def staff_document(detail) -> dict:
    from apps.content.services import ApprovalService

    pending = ApprovalService.open_for(detail).first()
    return {"id": str(detail.id), "program": {"id": str(detail.program_id), "title": detail.program.title}, "live": live_document(detail), "draft": draft_document(detail), "has_draft": bool(detail.draft), "pending_approval_id": str(pending.id) if pending else None}


def _sponsors(prizes, request=None) -> dict:
    from apps.content.models import Partner

    ids = [item["sponsor_partner_id"] for item in prizes if item.get("sponsor_partner_id")]
    out = {}
    for partner in Partner.objects.filter(id__in=ids).select_related("logo"):
        logo = partner.logo.file.url if partner.logo_id and partner.logo.file else None
        out[str(partner.id)] = {"id": str(partner.id), "name": partner.name, "logo_url": request.build_absolute_uri(logo) if logo and request else logo}
    return out


def update_payload(update, lang: str, request=None) -> dict:
    photo = update.photo.url if update.photo else None
    return {"id": str(update.id), "body": _text(update.body, lang), "body_all": update.body, "photo_url": request.build_absolute_uri(photo) if photo and request else photo, "created_at": _iso(update.created_at)}


def public_document(detail, lang: str, request=None) -> dict:
    now = timezone.now()
    schedule = detail.schedule_items or []
    current = None
    for item in schedule:
        if parse_datetime(item["starts_at"]) <= now:
            current = item["id"]
    sponsors = _sponsors(detail.prize_items or [], request)
    program = detail.program
    return {
        "id": str(detail.id),
        "program": {"id": str(program.id), "slug": program.slug, "title": program.title},
        "theme": detail.theme,
        "event_date": _iso(program.event_date),
        "sections": [item for item in (detail.page_sections or [{"key": key, "enabled": True, "order": n} for n, key in enumerate(SECTION_KEYS, start=1)]) if item.get("enabled", True)],
        "venue": detail.venue or {},
        "schedule": [{"id": item["id"], "starts_at": item["starts_at"], "title": _text(item["title"], lang), "now": item["id"] == current} for item in schedule],
        "prizes": [{**item, "sponsor": sponsors.get(item.get("sponsor_partner_id") or "")} for item in detail.prize_items or []],
        "updates": [update_payload(update, lang, request) for update in detail.updates.all()[:20]],
    }


def active(now=None):
    """The one hackathon page that is on now: its challenge is open, or its event is within 30 days (or today)."""
    from apps.content.models import HackathonDetail
    from apps.programs.challenge_public import challenge_status

    now = now or timezone.now()
    found = []
    for detail in HackathonDetail.objects.filter(is_published=True).select_related("program"):
        program = detail.program
        event = program.event_date
        soon = bool(event and now - timedelta(days=1) <= event <= now + ACTIVE_WINDOW)
        try:
            open_now = challenge_status(program) == "open"
        except Exception:
            open_now = False
        if open_now or soon:
            found.append((event or now + ACTIVE_WINDOW * 2, detail))
    return sorted(found, key=lambda item: item[0])[0][1] if found else None


def post_update(detail, *, body: dict, photo=None, actor):
    from apps.content.models import HackathonUpdate

    if not str((body or {}).get("en") or "").strip():
        raise ValidationError({"body": "Write the update in English (Setswana too if you can)."})
    update = HackathonUpdate.objects.create(hackathon=detail, body={"en": body["en"].strip()[:1000], "tn": str(body.get("tn") or "").strip()[:1000]}, created_by=actor)
    if photo is not None:
        update.photo.save(photo.name, photo, save=True)
    AuditService.log_action(actor=actor, action_type="hackathon_update_posted", target=detail, metadata={"update_id": str(update.id)})
    return update
