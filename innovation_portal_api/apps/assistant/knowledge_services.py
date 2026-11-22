"""Knowledge base writes (Copilot A3): upload, read, edit, switch on and off, delete, re-read."""

from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.postgres.search import SearchVector
from django.db import transaction

from apps.assistant import knowledge
from apps.assistant.models import Feature, KnowledgeChunk, KnowledgeDocument
from apps.assistant.providers import AIFile, AssistantUnavailable, SystemPart
from apps.audit.services import AuditService

logger = logging.getLogger("apps.assistant")

DOC_FIELDS = ("title", "kind", "audience", "language", "is_active")
TERMS_BATCH = 30

TERMS_INSTRUCTIONS = """Task: for each numbered part of a CEDA document, write up to 8 short search words that a person might type when this part would answer their question.
Write them in English and in Setswana (both), whatever language the part is in. Plain everyday words, no sentences."""

TERMS_SCHEMA = {
    "type": "object",
    "properties": {
        "parts": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"number": {"type": "integer"}, "words": {"type": "array", "items": {"type": "string"}}},
                "required": ["number", "words"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["parts"],
    "additionalProperties": False,
}

TRANSCRIBE_INSTRUCTIONS = "Task: write out all the text in this file, page by page, as plain text. Start each page with a line '--- page N ---'. Do not summarise or translate."
TRANSCRIBE_SCHEMA = {
    "type": "object",
    "properties": {"pages": {"type": "array", "items": {"type": "string"}}},
    "required": ["pages"],
    "additionalProperties": False,
}


def _snapshot(doc) -> dict:
    return {name: str(getattr(doc, name)) for name in DOC_FIELDS}


def queue_read(document: KnowledgeDocument) -> None:
    from apps.assistant.tasks import read_knowledge_document

    def run():
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            read_knowledge_document(str(document.pk))
            return
        try:
            read_knowledge_document.delay(str(document.pk))
        except Exception:  # no broker: read it now rather than leave it "reading"
            read_knowledge_document(str(document.pk))

    transaction.on_commit(run)


class KnowledgeDocumentService:
    @staticmethod
    @transaction.atomic
    def upload(*, actor, upload, title: str, kind: str, audience: str, language: str) -> KnowledgeDocument:
        """Store the file through the media library (its type and size rules), then read it in the background."""
        from apps.media_library.services import MediaService

        asset = MediaService.create_asset(actor=actor, upload=upload)
        document = KnowledgeDocument.objects.create(
            title=title.strip() or asset.original_filename,
            asset=asset,
            kind=kind,
            audience=audience,
            language=language,
            status=KnowledgeDocument.Status.READING,
            updated_by=actor,
        )
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_document_added", target=document, after_state=_snapshot(document), metadata={"asset": str(asset.pk)})
        queue_read(document)
        return document

    @staticmethod
    def update(*, actor, document: KnowledgeDocument, data: dict) -> KnowledgeDocument:
        before = _snapshot(document)
        for key, value in data.items():
            if key in DOC_FIELDS:
                setattr(document, key, value)
        document.updated_by = actor
        document.save()
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_document_saved", target=document, before_state=before, after_state=_snapshot(document))
        return document

    @staticmethod
    def reread(*, actor, document: KnowledgeDocument) -> KnowledgeDocument:
        document.status, document.error = KnowledgeDocument.Status.READING, ""
        document.save(update_fields=["status", "error", "updated_at"])
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_document_reread", target=document)
        queue_read(document)
        return document

    @staticmethod
    def delete(*, actor, document: KnowledgeDocument) -> None:
        AuditService.log_action(actor=actor, action_type="assistant_knowledge_document_deleted", target=document, before_state=_snapshot(document))
        document.delete()


def read_document(document_id) -> str:
    """Read the file into text and chunks. Status ends as ready or failed (with plain words)."""
    document = KnowledgeDocument.objects.select_related("asset").filter(pk=document_id).first()
    if document is None:
        return "missing"
    asset = document.asset
    read = knowledge.read_file(asset.file, filename=asset.original_filename, mime_type=asset.mime_type)
    pages = [page for page in read.pages if page.strip()]
    if not pages and knowledge_needs_files(asset.mime_type):
        pages = _transcribe(document)
    if not pages:
        message = read.error or "We could not read this file."
        if asset.mime_type == "application/pdf" and not read.error:
            message = "This PDF has no text we can read. It may be a scan."
        _fail(document, message)
        return "failed"
    text = "\n\n".join(f"[Page {number}]\n{page.strip()}" if len(pages) > 1 else page.strip() for number, page in enumerate(pages, start=1))
    with transaction.atomic():
        KnowledgeChunk.objects.filter(document=document).delete()
        chunks = [KnowledgeChunk(document=document, order=index, text=part) for index, part in enumerate(knowledge.split_chunks(text))]
        KnowledgeChunk.objects.bulk_create(chunks)
        document.text = text
        document.status = KnowledgeDocument.Status.READY
        document.error = ""
        document.save(update_fields=["text", "status", "error", "updated_at"])
    _write_search_terms(document)
    KnowledgeChunk.objects.filter(document=document).update(search_vector=SearchVector("text", "search_text", config="simple"))
    return "ready"


def knowledge_needs_files(mime_type: str) -> bool:
    """A file with no readable text can still be read by a provider that takes files."""
    from apps.assistant import gateway

    return mime_type in ("application/pdf",) or mime_type.startswith("image/") and gateway.route_supports_files(Feature.DOCUMENT_REVIEW)


def _transcribe(document) -> list[str]:
    from apps.assistant import gateway

    if not gateway.route_supports_files(Feature.DOCUMENT_REVIEW):
        return []
    asset = document.asset
    try:
        result = gateway.ask(
            Feature.DOCUMENT_REVIEW,
            user=None,
            system_parts=[SystemPart(TRANSCRIBE_INSTRUCTIONS, cache=True)],
            messages=[{"role": "user", "content": f"File: {asset.original_filename}"}],
            json_schema=TRANSCRIBE_SCHEMA,
            files=[AIFile(asset.original_filename, asset.mime_type, knowledge.file_bytes(asset.file))],
            effort="low",
            max_tokens=32000,
            target=f"knowledge:{document.pk}",
        )
    except AssistantUnavailable:
        return []
    return [str(page) for page in (result.data or {}).get("pages") or [] if str(page).strip()]


def _write_search_terms(document) -> None:
    """Ask once per document (in batches) for English and Setswana search words. Optional: without
    them full text and trigram still work."""
    from apps.assistant import gateway

    chunks = list(KnowledgeChunk.objects.filter(document=document).order_by("order"))
    for start in range(0, len(chunks), TERMS_BATCH):
        batch = chunks[start : start + TERMS_BATCH]
        content = "\n\n".join(f"Part {chunk.order + 1}:\n{chunk.text[:1200]}" for chunk in batch)
        try:
            result = gateway.ask(
                Feature.DOCUMENT_REVIEW,
                user=None,
                system_parts=[SystemPart(TERMS_INSTRUCTIONS, cache=True)],
                messages=[{"role": "user", "content": f"Document: {document.title}\n\n{content}"}],
                json_schema=TERMS_SCHEMA,
                effort="low",
                max_tokens=4000,
                target=f"knowledge:{document.pk}",
            )
        except AssistantUnavailable:
            return
        by_number = {chunk.order + 1: chunk for chunk in batch}
        for item in (result.data or {}).get("parts") or []:
            chunk = by_number.get(item.get("number"))
            if chunk is None:
                continue
            words = [str(word).strip()[:40] for word in item.get("words") or [] if str(word).strip()][:16]
            KnowledgeChunk.objects.filter(pk=chunk.pk).update(search_terms=words, search_text=" ".join(words))


def _fail(document, message: str) -> None:
    document.status = KnowledgeDocument.Status.FAILED
    document.error = message[:300]
    document.save(update_fields=["status", "error", "updated_at"])
    logger.info("assistant.knowledge_read_failed document=%s", document.pk)
