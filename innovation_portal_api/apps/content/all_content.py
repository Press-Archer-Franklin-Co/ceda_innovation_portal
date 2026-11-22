"""R-59 part 1 (3.38): one list of everything on the website, across content types.

Types: page (home and other built pages), news (posts), story, quote (leadership), partner, faq, policy (3.35).
R-62: policy pages, lang=tn_has, the scheduled status and ordering.

Scheduled means published with a publish date still in the future. Only types with a publish date can be
scheduled: news (publish_at or published_at), story (published_at) and quote (start_at).
"""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType
from django.utils import timezone
from rest_framework.exceptions import ValidationError

TYPES = ("page", "news", "story", "quote", "partner", "faq", "policy")
STATUSES = ("draft", "pending_approval", "scheduled", "published", "archived")
LANGS = ("tn_missing", "tn_has")
ORDERINGS = ("-updated_at", "updated_at", "title", "-title")
MAX_PAGE = 50


def _later(*dates, now) -> bool:
    return any(date is not None and date > now for date in dates)


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
    from apps.content.models import ContentItem, LeadershipCard, Page, Partner, PolicyPage, Story
    from apps.content.policies import _complete_in, live_content
    from apps.support.models import FAQ

    pending = _pending()
    now = timezone.now()
    out = []
    for page in Page.objects.all():
        out.append(_row("page", page, title=page.title or page.slug.replace("-", " ").capitalize(), has_setswana=None, status="published", updated_by=None, pending=pending, key=page.slug))
    for post in ContentItem.objects.select_related("author"):
        status = post.status
        if status == "published" and _later(post.publish_at, post.published_at, now=now):
            status = "scheduled"
        out.append(_row("news", post, title=post.title, has_setswana=_tn(post.translations, "title"), status=status, updated_by=post.author, pending=pending))
    for story in Story.objects.select_related("created_by"):
        title = story.person_name + (f", {story.business}" if story.business else "")
        status = "scheduled" if story.status == "published" and _later(story.published_at, now=now) else story.status
        out.append(_row("story", story, title=title, has_setswana=_tn(story.translations, "quote") or _tn(story.translations, "body"), status=status, updated_by=story.created_by, pending=pending))
    for card in LeadershipCard.objects.select_related("created_by"):
        if card.is_official and card.approved_at is None:
            status = "pending_approval"
        else:
            status = "published" if card.is_active else "archived"
            if status == "published" and _later(card.start_at, now=now):
                status = "scheduled"
        out.append(_row("quote", card, title=f"{card.full_name}, {card.job_title}", has_setswana=_tn(card.translations, "quote"), status=status, updated_by=card.created_by, pending=pending))
    for partner in Partner.objects.all():
        out.append(_row("partner", partner, title=partner.name, has_setswana=None, status="published" if partner.is_active else "archived", updated_by=None, pending=pending))
    for faq in FAQ.objects.all():
        out.append(_row("faq", faq, title=faq.question, has_setswana=_tn(faq.translations, "question"), status="published" if faq.is_public else "draft", updated_by=None, pending=pending))
    for policy in PolicyPage.objects.select_related("published_by", "draft_updated_by"):
        # Waiting for approval while a sent draft waits, published once live, draft before that.
        content_type = ContentType.objects.get_for_model(PolicyPage)
        if (content_type.id, str(policy.pk)) in pending:
            status = "pending_approval"
        else:
            status = "published" if policy.published_at else "draft"
        title = (policy.title or {}).get("en") or policy.get_key_display()
        updated_by = policy.draft_updated_by if policy.draft is not None and policy.draft_updated_by else policy.published_by
        out.append(_row("policy", policy, title=title, has_setswana=_complete_in(live_content(policy), "tn"), status=status, updated_by=updated_by, pending=pending, key=policy.key))
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
    ordering = params.get("ordering") or "-updated_at"
    if lang and lang not in LANGS:
        raise ValidationError({"lang": f"Use one of: {', '.join(LANGS)}."})
    if ordering not in ORDERINGS:
        raise ValidationError({"ordering": f"Use one of: {', '.join(ORDERINGS)}."})
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
    if lang == "tn_has":
        items = [row for row in items if row["has_setswana"] is True]
    if search:
        items = [row for row in items if search in row["title"].lower()]
    counts = {name: 0 for name in TYPES}
    for row in items:
        counts[row["type"]] += 1
    if kind:
        items = [row for row in items if row["type"] == kind]
    field = ordering.lstrip("-")
    items.sort(key=(lambda row: row["title"].lower()) if field == "title" else (lambda row: row["updated_at"]), reverse=ordering.startswith("-"))
    start = (page - 1) * size
    return {"count": len(items), "page": page, "page_size": size, "counts": counts, "results": items[start : start + size]}
