"""U11C: policy page text (About, Guidelines, Privacy, Terms of use, Terms of agreement).

Shape of a page's content, the same for the live text and the draft:

    {
        "title": {"en": "...", "tn": "..."},
        "intro": {"en": "...", "tn": "..."},
        "sections": [{"heading": {"en": "...", "tn": "..."}, "body": {"en": "...", "tn": "..."}}],
    }

Bodies are plain text: a blank line starts a new paragraph and a line starting with "• " is a bullet.
English is required for the title and every body; Setswana is optional and visitors see English
where it is missing. Staff save a draft, then send it for approval through the website approvals
flow (ApprovalService). The live text stays as it is until the request is approved.
"""

from __future__ import annotations

from django.db import transaction
from django.http import Http404
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService
from apps.content.models import ApprovalRequest, PolicyPage

LANGS = ("en", "tn")
MAX_TITLE = 200
MAX_INTRO = 2000
MAX_HEADING = 200
MAX_BODY = 20000
MAX_SECTIONS = 60
CONTENT_KEYS = {"title", "intro", "sections"}


def _iso(value):
    return value.isoformat() if value else None


def _name(user):
    return (user.full_name or user.email) if user else None


def get_page(key: str) -> PolicyPage:
    page = PolicyPage.objects.filter(key=key).first()
    if page is None:
        raise Http404
    return page


def live_content(page: PolicyPage) -> dict:
    return {"title": page.title or {}, "intro": page.intro or {}, "sections": page.sections or []}


def _text(value, *, path: str, limit: int, required: bool, errors: list) -> dict:
    """Check one {en, tn} text and return it cleaned."""
    if value is None and not required:
        return {"en": "", "tn": ""}
    if not isinstance(value, dict) or not set(value) <= set(LANGS):
        errors.append({"path": path, "message": 'Send {"en": "...", "tn": "..."}.'})
        return {"en": "", "tn": ""}
    out = {}
    for lang in LANGS:
        text = value.get(lang, "")
        if text is None:
            text = ""
        if not isinstance(text, str):
            errors.append({"path": f"{path}.{lang}", "message": "Must be text."})
            text = ""
        text = text.replace("\r\n", "\n").strip()
        if len(text) > limit:
            errors.append({"path": f"{path}.{lang}", "message": f"Keep it to {limit} characters or fewer."})
        out[lang] = text
    if required and not out["en"]:
        errors.append({"path": f"{path}.en", "message": "The English text is required."})
    return out


def validate(content) -> dict:
    """Check a page's content; raises ValidationError({"errors": [{path, message}]})."""
    errors: list[dict] = []
    if not isinstance(content, dict):
        raise ValidationError({"errors": [{"path": "", "message": "Send {title, intro, sections}."}]})
    unknown = set(content) - CONTENT_KEYS
    if unknown:
        errors.append({"path": sorted(unknown)[0], "message": "Unknown field."})
    title = _text(content.get("title"), path="title", limit=MAX_TITLE, required=True, errors=errors)
    intro = _text(content.get("intro"), path="intro", limit=MAX_INTRO, required=False, errors=errors)
    sections = content.get("sections")
    cleaned = []
    if not isinstance(sections, list) or not sections:
        errors.append({"path": "sections", "message": "Add at least one section."})
    elif len(sections) > MAX_SECTIONS:
        errors.append({"path": "sections", "message": f"Keep it to {MAX_SECTIONS} sections or fewer."})
    else:
        for index, section in enumerate(sections):
            path = f"sections[{index}]"
            if not isinstance(section, dict) or not set(section) <= {"heading", "body"}:
                errors.append({"path": path, "message": "Each section is {heading, body}."})
                continue
            cleaned.append(
                {
                    "heading": _text(section.get("heading"), path=f"{path}.heading", limit=MAX_HEADING, required=False, errors=errors),
                    "body": _text(section.get("body"), path=f"{path}.body", limit=MAX_BODY, required=True, errors=errors),
                }
            )
    if errors:
        raise ValidationError({"errors": errors})
    return {"title": title, "intro": intro, "sections": cleaned}


def pending_approval(page: PolicyPage):
    from apps.content.services import ApprovalService

    return ApprovalService.open_for(page).first()


def staff_document(page: PolicyPage, user=None) -> dict:
    from apps.content.services import ApprovalService

    pending = pending_approval(page)
    return {
        "key": page.key,
        "name": page.get_key_display(),
        "live": live_content(page),
        "published_at": _iso(page.published_at),
        "published_by": _name(page.published_by),
        "draft": page.draft,
        "draft_updated_at": _iso(page.draft_updated_at),
        "draft_updated_by": _name(page.draft_updated_by),
        "pending_approval": ApprovalService.payload(pending, user) if pending else None,
    }


def staff_row(page: PolicyPage) -> dict:
    return {
        "key": page.key,
        "name": page.get_key_display(),
        "title": (page.title or {}).get("en", ""),
        "published_at": _iso(page.published_at),
        "has_draft": page.draft is not None,
        "pending_approval": pending_approval(page) is not None,
        "missing_setswana": not _complete_in(live_content(page), "tn"),
    }


def save_draft(page: PolicyPage, content, *, actor) -> PolicyPage:
    page.draft = validate(content)
    page.draft_updated_at = timezone.now()
    page.draft_updated_by = actor
    page.save(update_fields=["draft", "draft_updated_at", "draft_updated_by", "updated_at"])
    AuditService.log_action(actor=actor, action_type="policy_draft_saved", target=page, metadata={"key": page.key})
    return page


def discard_draft(page: PolicyPage, *, actor) -> PolicyPage:
    page.draft = None
    page.draft_updated_at = None
    page.draft_updated_by = None
    page.save(update_fields=["draft", "draft_updated_at", "draft_updated_by", "updated_at"])
    AuditService.log_action(actor=actor, action_type="policy_draft_discarded", target=page, metadata={"key": page.key})
    return page


def submit(page: PolicyPage, *, actor) -> ApprovalRequest:
    from apps.content.services import ApprovalService

    if page.draft is None:
        raise ValidationError({"errors": [{"path": "draft", "message": "There are no changes to send. Save a draft first."}]})
    content = validate(page.draft)
    return ApprovalService.create(page, actor=actor, summary=f"{page.get_key_display()} page text", payload={"kind": "policy", "content": content})


@transaction.atomic
def apply_approved(page: PolicyPage, approval: ApprovalRequest, *, actor) -> PolicyPage:
    """Called by ApprovalService when a policy request is approved: the sent text goes live."""
    content = validate((approval.payload or {}).get("content"))
    page = PolicyPage.objects.select_for_update().get(pk=page.pk)
    page.title, page.intro, page.sections = content["title"], content["intro"], content["sections"]
    page.published_at = timezone.now()
    page.published_by = approval.requested_by
    fields = ["title", "intro", "sections", "published_at", "published_by", "updated_at"]
    # The draft is done once what was approved is what is in it; later edits stay as a draft.
    if page.draft is not None and validate(page.draft) == content:
        page.draft, page.draft_updated_at, page.draft_updated_by = None, None, None
        fields += ["draft", "draft_updated_at", "draft_updated_by"]
    page.save(update_fields=fields)
    return page


def _complete_in(content: dict, lang: str) -> bool:
    texts = [content.get("title") or {}] + [section.get("body") or {} for section in content.get("sections") or []]
    texts += [section.get("heading") or {} for section in content.get("sections") or [] if (section.get("heading") or {}).get("en")]
    if (content.get("intro") or {}).get("en"):
        texts.append(content["intro"])
    return all((text.get(lang) or "").strip() for text in texts)


def public_document(page: PolicyPage, lang: str) -> dict:
    """The live text in one language. Missing Setswana falls back to English, and the page says so."""
    content = live_content(page)
    fallback = False

    def pick(text: dict) -> str:
        nonlocal fallback
        text = text or {}
        value = (text.get(lang) or "").strip() if lang != "en" else ""
        if value:
            return value
        if lang != "en" and (text.get("en") or "").strip():
            fallback = True
        return text.get("en") or ""

    data = {
        "key": page.key,
        "title": pick(content["title"]),
        "intro": pick(content["intro"]),
        "sections": [{"heading": pick(section.get("heading")), "body": pick(section.get("body"))} for section in content["sections"]],
        "updated_at": _iso(page.published_at),
    }
    data["lang"] = lang
    data["english_fallback"] = fallback
    return data
