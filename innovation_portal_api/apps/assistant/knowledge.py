"""The knowledge base (Copilot A3): what admins teach the helper, and how it reaches a question.

Knowledge is the guidance lines (KnowledgeEntry), the user manual (ManualPage) and uploaded
documents (KnowledgeDocument, read into KnowledgeChunk). Each item has an audience; a person only
ever gets knowledge for their own audience (innovators never get officer-only documents).

If everything for the audience is small (under about 100,000 tokens) it all goes in the stable,
cached part of the system prompt. Above that, the 12 chunks that best match the question are
found with PostgreSQL full text search plus trigram similarity over the text and the search
words the AI wrote at upload time. No vector database, no new services.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from django.contrib.postgres.search import SearchQuery, SearchRank, TrigramWordSimilarity
from django.db.models import F, FloatField, Value
from django.db.models.functions import Coalesce, Greatest

from apps.assistant.models import Audience, KnowledgeChunk, KnowledgeDocument, KnowledgeEntry, ManualPage
from apps.assistant.providers import SystemPart

logger = logging.getLogger("apps.assistant")

CHUNK_CHARS = 1500
ALL_KNOWLEDGE_TOKENS = 100_000
BEST_CHUNKS = 12
CHARS_PER_TOKEN = 4
# Words that say nothing about the topic of a question, in English and Setswana.
QUESTION_WORDS = frozenset(
    "how what when where which who why can could should would the and for you your our are does did this that with from have has "
    "jang eng leng kae mang goreng nka ke le go ka mo ya wa ba tsa tse".split()
)


@dataclass
class Knowledge:
    stable: str = ""
    question_part: str = ""
    sources: list[dict] = field(default_factory=list)

    def parts(self, base: str) -> list[SystemPart]:
        parts = [SystemPart(f"{base}\n\n{self.stable}".strip(), cache=True)]
        if self.question_part:
            parts.append(SystemPart(self.question_part))
        return parts


def audiences_for(audience: str) -> list[str]:
    """Knowledge a person of this audience may get. `everyone` (guests) gets everyone-only items."""
    if audience == Audience.OFFICERS:
        return [Audience.EVERYONE, Audience.OFFICERS]
    if audience == Audience.INNOVATORS:
        return [Audience.EVERYONE, Audience.INNOVATORS]
    return [Audience.EVERYONE]


# -- reading files ---------------------------------------------------------------------------------


@dataclass
class ReadText:
    text: str = ""
    pages: list[str] = field(default_factory=list)
    ok: bool = False
    error: str = ""


def read_file(file, *, filename: str = "", mime_type: str = "") -> ReadText:
    """Text of an uploaded file. Uses the backend lane's extract_text() when it is on main.

    TODO(R-68): remove the fallback once apps.documents.text is on main.
    """
    try:
        from apps.documents.text import extract_text
    except ImportError:
        extract_text = None
    if extract_text is not None:
        try:
            extracted = extract_text(file, filename=filename, mime_type=mime_type)
            pages = list(getattr(extracted, "pages", None) or ([extracted.text] if getattr(extracted, "text", "") else []))
            return ReadText(text=getattr(extracted, "text", "") or "\n\n".join(pages), pages=pages, ok=bool(getattr(extracted, "ok", False)), error=getattr(extracted, "error", "") or "")
        except Exception:
            logger.exception("assistant.extract_text_failed")
            return ReadText(error="We could not read this file.")
    name = (filename or getattr(file, "name", "") or "").lower()
    if mime_type.startswith("text/") or name.endswith((".txt", ".md", ".csv")):
        try:
            file.open("rb")
            raw = file.read()
        except Exception:
            return ReadText(error="We could not read this file.")
        finally:
            try:
                file.close()
            except Exception:
                pass
        text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else str(raw)
        return ReadText(text=text, pages=[text], ok=bool(text.strip()), error="" if text.strip() else "This file is empty.")
    return ReadText(error="We cannot read this type of file yet.")


def file_bytes(file) -> bytes:
    try:
        file.open("rb")
        return file.read()
    finally:
        try:
            file.close()
        except Exception:
            pass


def split_chunks(text: str, size: int = CHUNK_CHARS) -> list[str]:
    """About `size` characters each, cut at paragraph or sentence ends where possible."""
    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", text or "") if p.strip()]
    chunks, current = [], ""
    for paragraph in paragraphs:
        while len(paragraph) > size:
            cut = paragraph.rfind(". ", 0, size)
            cut = cut + 1 if cut > size // 2 else size
            if current:
                chunks.append(current)
                current = ""
            chunks.append(paragraph[:cut].strip())
            paragraph = paragraph[cut:].strip()
        if current and len(current) + len(paragraph) + 2 > size:
            chunks.append(current)
            current = paragraph
        else:
            current = f"{current}\n\n{paragraph}".strip()
    if current:
        chunks.append(current)
    return chunks


# -- what goes with a question ---------------------------------------------------------------------


def _entries_text(audiences) -> tuple[str, list[dict]]:
    entries = KnowledgeEntry.objects.filter(is_active=True, audience__in=audiences).order_by("ordering", "created_at", "id")
    lines = [f"- {entry.title}: {entry.text.strip()}" for entry in entries]
    return "\n".join(lines), [{"type": "guidance", "id": str(entry.pk), "title": entry.title} for entry in entries]


def _manual_text(audiences, language: str) -> tuple[str, list[dict]]:
    pages = ManualPage.objects.filter(is_active=True, audience__in=audiences).prefetch_related("screenshots").order_by("ordering", "created_at", "id")
    parts, sources = [], []
    for page in pages:
        shots = "\n".join(
            f"  Screenshot {shot.id}: {(shot.caption or {}).get(language) or (shot.caption or {}).get('en') or 'no caption'}"
            for shot in sorted(page.screenshots.all(), key=lambda item: (item.ordering, item.created_at, str(item.id)))
        )
        parts.append(f"### Page {page.id}: {page.title}\nPortal page: {page.portal_path or 'not given'}\n{page.text.strip()}" + (f"\n{shots}" if shots else ""))
        sources.append({"type": "manual_page", "id": str(page.pk), "title": page.title})
    return "\n\n".join(parts), sources


def _documents(audiences, kinds=None):
    documents = KnowledgeDocument.objects.filter(is_active=True, status=KnowledgeDocument.Status.READY, audience__in=audiences)
    if kinds:
        documents = documents.filter(kind__in=kinds)
    return documents.order_by("created_at", "id")


def build(*, audience: str, language: str, question: str = "", kinds=None, include_manual: bool = True, extra_guidance: str = "") -> Knowledge:
    """The knowledge for one request. Deterministic for the same audience and data, so the stable
    part is the same bytes every time and the prompt cache is reused."""
    audiences = audiences_for(audience)
    guidance, sources = _entries_text(audiences)
    if extra_guidance.strip():
        guidance += f"\n- Draft guidance being tried: {extra_guidance.strip()}"
    manual, manual_sources = _manual_text(audiences, language) if include_manual else ("", [])
    documents = list(_documents(audiences, kinds))
    total_chars = len(guidance) + len(manual) + sum(len(doc.text or "") for doc in documents)
    stable = [f"## Guidance from CEDA\n{guidance or '- (none yet)'}"]
    if include_manual:
        stable.append(f"## User manual\n{manual or '(no manual pages yet)'}")
    knowledge = Knowledge(sources=sources + manual_sources)
    if total_chars / CHARS_PER_TOKEN <= ALL_KNOWLEDGE_TOKENS:
        for doc in documents:
            stable.append(f"## Document: {doc.title} ({doc.get_kind_display()})\n{(doc.text or '').strip()}")
            knowledge.sources.append({"type": "knowledge", "id": str(doc.pk), "title": doc.title})
    elif documents and question.strip():
        chunks = best_chunks(question, documents=documents)
        if chunks:
            knowledge.question_part = "## From CEDA's documents (the parts that match this question)\n" + "\n\n".join(
                f"[{chunk.document.title}, part {chunk.order + 1}]\n{chunk.text}" for chunk in chunks
            )
            knowledge.sources += [{"type": "knowledge", "id": str(chunk.document_id), "title": chunk.document.title, "chunk": chunk.order + 1} for chunk in chunks]
    knowledge.stable = "\n\n".join(stable)
    return knowledge


def best_chunks(question: str, *, documents, limit: int = BEST_CHUNKS) -> list[KnowledgeChunk]:
    text = " ".join((question or "").split())[:500]
    words = [word for word in re.findall(r"\w{3,}", text.lower()) if word not in QUESTION_WORDS][:20]
    if not words:
        return []
    # Any of the meaningful words (a question rarely uses every word of the answer).
    query = SearchQuery(" OR ".join(words), search_type="websearch", config="simple")
    text = " ".join(words)
    return list(
        KnowledgeChunk.objects.filter(document__in=documents)
        .select_related("document")
        .annotate(
            rank=Coalesce(SearchRank(F("search_vector"), query), Value(0.0), output_field=FloatField()),
            similarity=Greatest(TrigramWordSimilarity(text, "text"), TrigramWordSimilarity(text, "search_text"), output_field=FloatField()),
        )
        .annotate(score=F("rank") + F("similarity"))
        .filter(score__gt=0.1)
        .order_by("-score", "order")[:limit]
    )
