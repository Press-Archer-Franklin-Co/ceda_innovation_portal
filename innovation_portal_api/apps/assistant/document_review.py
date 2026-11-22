"""Document review (Copilot A4): what one uploaded file says, with pages, and what is missing.

Allowed for the owner of the draft or submission the file belongs to, and for staff who can
already open that submission (SubmissionSelector.for_user: officers, managers, and judges only
for entries assigned to them). Cached by document version and language.
"""

from __future__ import annotations

from rest_framework.exceptions import NotFound

from apps.assistant import knowledge, language as lang_mod, prompts
from apps.assistant.models import Audience, DocumentReview, Feature
from apps.assistant.providers import AIFile, AssistantUnavailable

MAX_FILE_CHARS = 24_000


def document_for(user, document_id, *, draft_token: str | None = None):
    """The SubmissionDocument if this person may see it, else 404 (never 403: do not confirm it exists)."""
    from apps.documents.models import SubmissionDocument
    from apps.submissions.selectors import SubmissionSelector

    try:
        document = SubmissionDocument.objects.select_related("submission", "application_draft").filter(pk=document_id, is_active=True).first()
    except (ValueError, TypeError):
        document = None
    if document is None or not document.file:
        raise NotFound()
    if document.application_draft_id:
        draft = document.application_draft
        if user.is_authenticated and draft.innovator_id == user.pk:
            return document, "owner"
        if draft_token:
            from apps.submissions.intake import DraftTokenService

            try:
                if DraftTokenService.guest_draft(draft_token, draft.pk):
                    return document, "owner"
            except Exception:
                pass
        raise NotFound()
    if document.submission_id and user.is_authenticated:
        if document.submission.innovator_id == user.pk:
            return document, "owner"
        if SubmissionSelector.for_user(user).filter(pk=document.submission_id).exists():
            return document, "staff"
    raise NotFound()


def file_content(document) -> tuple[str, list[AIFile]]:
    """Text with page markers, or the file itself for a provider that reads files when there is no text."""
    read = knowledge.read_file(document.file, filename=document.original_filename, mime_type=document.mime_type)
    pages = [page for page in read.pages if page.strip()]
    if pages:
        text = "\n\n".join(f"[Page {number}]\n{page.strip()}" for number, page in enumerate(pages, start=1))
        return text[:MAX_FILE_CHARS], []
    if document.mime_type == "application/pdf" or (document.mime_type or "").startswith("image/"):
        return "", [AIFile(document.original_filename or "file", document.mime_type, knowledge.file_bytes(document.file))]
    return "", []


def version_key(document) -> str:
    return f"{document.version_number}:{document.sha256 or document.updated_at.isoformat()}"


def review(*, user, document, role: str, requested_language: str | None) -> dict:
    language = lang_mod.resolve(user=user, requested=requested_language)
    key = version_key(document)
    cached = DocumentReview.objects.filter(document=document, version=key, language=language).first()
    if cached:
        return {**cached.data, "cached": True}
    text, files = file_content(document)
    if not text and not files:
        raise AssistantUnavailable("bad_output", "There is no text in this file that the helper can read.")
    audience = Audience.OFFICERS if role == "staff" else Audience.INNOVATORS
    found = knowledge.build(audience=audience, language=language, include_manual=False)
    from apps.assistant import gateway

    result = gateway.ask(
        Feature.DOCUMENT_REVIEW,
        user=user,
        system_parts=found.parts(prompts.BASE_PROMPT) + [prompts.part(prompts.DOC_REVIEW_INSTRUCTIONS, language)],
        messages=[{"role": "user", "content": f"File: {document.original_filename}\n\n{text}" if text else f"File: {document.original_filename} (attached)"}],
        json_schema=prompts.DOC_REVIEW_SCHEMA,
        files=files or None,
        language=language,
        target=f"document:{document.pk}",
    )
    data = shape(result.data or {}, document, language)
    DocumentReview.objects.update_or_create(document=document, version=key, language=language, defaults={"data": data, "model": result.model})
    return {**data, "cached": False}


def shape(data: dict, document, language: str) -> dict:
    def page(value):
        try:
            number = int(value)
        except (TypeError, ValueError):
            return None
        return number if number > 0 else None

    return {
        "document": {"id": str(document.pk), "name": document.original_filename},
        "label": prompts.SUGGESTION_LABEL[language],
        "language": language,
        "file_language": data.get("file_language") if data.get("file_language") in ("en", "tn") else "",
        "summary": str(data.get("summary") or "").strip(),
        "key_points": [
            {"text": str(item.get("text") or "").strip(), "page": page(item.get("page"))}
            for item in (data.get("key_points") or [])[:8]
            if isinstance(item, dict) and str(item.get("text") or "").strip()
        ],
        "missing": [str(item).strip() for item in (data.get("missing") or [])[:6] if str(item).strip()],
    }
