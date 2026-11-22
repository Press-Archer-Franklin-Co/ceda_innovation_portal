"""R-59 part 1 (3.38): one list of everything on the website, across content types.

Types: page (home and other built pages), news (posts), story, quote (leadership), partner, faq.
Policy pages join when their API is on main.
"""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from rest_framework.exceptions import ValidationError

TYPES = ("page", "news", "story", "quote", "partner", "faq")
STATUSES = ("draft", "pending_approval", "published", "archived")
MAX_PAGE = 50


def _short(user) -> str:
    if user is None:
        return ""
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    return f"{first} {last[:1]}." if first and last else (first or (user.email or ""))


def _tn(translations, key) -> bool:
    return bool((((translations or {}).get("tn") or {}).get(key) or "").strip())


def _pending() -> dict:
    """{(content type id, object id): approval id} for approvals still waiting."""
    from apps.content.models import ApprovalRequest

    return {(row.content_type_id, row.object_id): str(row.id) for row in ApprovalRequest.objects.filter(status=ApprovalRequest.Status.PENDING)}


def _row(kind, obj, *, title, has_setswana, status, updated_by, pending, key=None) -> dict:
    content_type = ContentType.objects.get_for_model(type(obj))
    approval = pending.get((content_type.id, str(obj.pk)))
    if approval and status != "published":
        status = "pending_approval"
    return {
        "type": kind,
        "id": key or str(obj.pk),
        "title": title,
        "has_setswana": has_setswana,
        "status": status,
        "updated_at": obj.updated_at.isoformat(),
        "updated_by": _short(updated_by),
        "pending_approval_id": approval,
    }


def rows() -> list[dict]:
    from apps.content.models import ContentItem, LeadershipCard, Page, Partner, Story
    from apps.support.models import FAQ

    pending = _pending()
    out = []
    for page in Page.objects.all():
        out.append(_row("page", page, title=page.title or page.slug.replace("-", " ").capitalize(), has_setswana=None, status="published", updated_by=None, pending=pending, key=page.slug))
    for post in ContentItem.objects.select_related("author"):
        status = "published" if post.status in ("published", "scheduled") else post.status
        out.append(_row("news", post, title=post.title, has_setswana=_tn(post.translations, "title"), status=status, updated_by=post.author, pending=pending))
    for story in Story.objects.select_related("created_by"):
        title = story.person_name + (f", {story.business}" if story.business else "")
        out.append(_row("story", story, title=title, has_setswana=_tn(story.translations, "quote") or _tn(story.translations, "body"), status=story.status, updated_by=story.created_by, pending=pending))
    for card in LeadershipCard.objects.select_related("created_by"):
        if card.is_official and card.approved_at is None:
            status = "pending_approval"
        else:
            status = "published" if card.is_active else "archived"
        out.append(_row("quote", card, title=f"{card.full_name}, {card.job_title}", has_setswana=_tn(card.translations, "quote"), status=status, updated_by=card.created_by, pending=pending))
    for partner in Partner.objects.all():
        out.append(_row("partner", partner, title=partner.name, has_setswana=None, status="published" if partner.is_active else "archived", updated_by=None, pending=pending))
    for faq in FAQ.objects.all():
        out.append(_row("faq", faq, title=faq.question, has_setswana=_tn(faq.translations, "question"), status="published" if faq.is_public else "draft", updated_by=None, pending=pending))
    return out


def all_content(params) -> dict:
    kind = params.get("type") or ""
    status = params.get("status") or ""
    lang = params.get("lang") or ""
    search = (params.get("search") or "").strip().lower()
    if kind and kind not in TYPES:
        raise ValidationError({"type": f"Use one of: {', '.join(TYPES)}."})
    if status and status not in STATUSES:
        raise ValidationError({"status": f"Use one of: {', '.join(STATUSES)}."})
    if lang and lang != "tn_missing":
        raise ValidationError({"lang": "Use tn_missing."})
    try:
        page = max(1, int(params.get("page") or 1))
        size = min(MAX_PAGE, max(1, int(params.get("page_size") or 25)))
    except ValueError:
        raise ValidationError({"page": "Use whole numbers for page and page_size."}) from None

    items = rows()
    if status:
        items = [row for row in items if row["status"] == status]
    if lang == "tn_missing":
        items = [row for row in items if row["has_setswana"] is False]
    if search:
        items = [row for row in items if search in row["title"].lower()]
    counts = {name: 0 for name in TYPES}
    for row in items:
        counts[row["type"]] += 1
    if kind:
        items = [row for row in items if row["type"] == kind]
    items.sort(key=lambda row: row["updated_at"], reverse=True)
    start = (page - 1) * size
    return {"count": len(items), "page": page, "page_size": size, "counts": counts, "results": items[start : start + size]}
