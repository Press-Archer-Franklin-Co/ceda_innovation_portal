"""Read the text of an uploaded file, for the AI Copilot and search. No AI service is called here.

extract_text() never runs macros, never follows links and never starts another program: PDF pages are read with
pypdf, Word documents with python-docx (only the document text and tables), plain text and CSV as text. Anything
else answers status "unsupported". A scanned PDF (pictures of pages, no text layer) answers status "empty".
"""

from __future__ import annotations

import io
import logging
import signal
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from django.utils import timezone

logger = logging.getLogger(__name__)

MAX_PAGES = 200
TIME_LIMIT_SECONDS = 20
MAX_TEXT_CHARS = 2_000_000  # about 1,000 pages of dense text; more is cut off

PDF = "application/pdf"
DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
TEXT_TYPES = {"text/plain", "text/csv", "text/markdown"}
EXTENSION_TYPES = {".pdf": PDF, ".docx": DOCX, ".txt": "text/plain", ".md": "text/markdown", ".csv": "text/csv"}
STATUSES = ("ok", "empty", "unsupported", "too_large", "failed")


@dataclass
class TextResult:
    text: str = ""
    pages: list[str] = field(default_factory=list)
    status: str = "ok"
    detail: str = ""
    language: str = ""  # not detected here; kept for the AI lane's ExtractedText shape (R-68)

    @property
    def ok(self) -> bool:
        return self.status == "ok"

    @property
    def error(self) -> str:
        """Plain words when the text could not be read ("" when it was)."""
        return "" if self.ok else (self.detail or "We could not read this file.")

    def as_dict(self) -> dict:
        return {"text": self.text, "pages": self.pages, "status": self.status, "detail": self.detail, "ok": self.ok, "error": self.error}


class _TimeUp(Exception):
    pass


@contextmanager
def _time_limit(seconds: int):
    """A wall-clock limit. Uses SIGALRM in the main thread; elsewhere the page loop checks the clock."""
    if threading.current_thread() is not threading.main_thread() or not hasattr(signal, "SIGALRM"):
        yield
        return

    def _stop(signum, frame):
        raise _TimeUp()

    previous = signal.signal(signal.SIGALRM, _stop)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)
        signal.signal(signal.SIGALRM, previous)


def _size_limit() -> int:
    from apps.media_library.validation import size_limits

    return size_limits()["document"]


def _read_bytes(file_or_path) -> bytes | None:
    """Reads at most the size limit plus one byte, so a huge file is spotted without loading it all."""
    limit = _size_limit()
    if isinstance(file_or_path, (str, Path)):
        path = Path(file_or_path)
        if path.stat().st_size > limit:
            return None
        return path.read_bytes()
    handle = file_or_path
    if hasattr(handle, "open") and getattr(handle, "closed", False):
        handle.open("rb")
    size = getattr(handle, "size", None)
    if size is not None and size > limit:
        return None
    if hasattr(handle, "seek"):
        handle.seek(0)
    data = handle.read(limit + 1)
    if isinstance(data, str):
        data = data.encode("utf-8")
    return None if len(data) > limit else data


def _finish(pages: list[str], detail: str = "") -> TextResult:
    pages = [page.strip() for page in pages]
    text = "\n\n".join(page for page in pages if page)[:MAX_TEXT_CHARS]
    if not text.strip():
        return TextResult(text="", pages=pages, status="empty", detail=detail or "No text found. It may be a scan or a picture.")
    return TextResult(text=text, pages=pages, status="ok", detail=detail)


def _pdf(data: bytes, started: float) -> TextResult:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    if reader.is_encrypted:
        try:
            if not reader.decrypt(""):
                return TextResult(status="unsupported", detail="The PDF has a password.")
        except Exception:  # noqa: BLE001
            return TextResult(status="unsupported", detail="The PDF has a password.")
    total = len(reader.pages)
    pages = []
    for index, page in enumerate(reader.pages):
        if index >= MAX_PAGES:
            break
        if time.monotonic() - started > TIME_LIMIT_SECONDS:
            raise _TimeUp()
        pages.append(page.extract_text() or "")
    detail = f"Only the first {MAX_PAGES} of {total} pages were read." if total > MAX_PAGES else ""
    return _finish(pages, detail)


def _docx(data: bytes) -> TextResult:
    import docx

    document = docx.Document(io.BytesIO(data))  # reads the XML parts only; macros and links are never run or opened
    lines = [paragraph.text for paragraph in document.paragraphs]
    for table in document.tables:
        for row in table.rows:
            lines.append(" | ".join(cell.text.strip() for cell in row.cells))
    # Word files have no fixed pages; the whole text is page 1.
    return _finish(["\n".join(lines)])


def _plain(data: bytes) -> TextResult:
    for encoding in ("utf-8-sig", "cp1252", "latin-1"):
        try:
            return _finish([data.decode(encoding)])
        except UnicodeDecodeError:
            continue
    return TextResult(status="failed", detail="The text could not be read.")


def extract_text(file_or_path, *, mime: str = "", mime_type: str = "", filename: str = "") -> TextResult:
    """mime (or mime_type, the AI lane's name) picks the reader; without it the file name's extension does."""
    mime = (mime or mime_type or "").split(";")[0].strip().lower()
    if mime in ("", "application/octet-stream"):
        name = filename or (str(file_or_path) if isinstance(file_or_path, (str, Path)) else getattr(file_or_path, "name", "") or "")
        mime = EXTENSION_TYPES.get(Path(name).suffix.lower(), mime)
    if mime not in (PDF, DOCX, *TEXT_TYPES):
        return TextResult(status="unsupported", detail="Text can be read from PDF, Word (.docx), plain text, Markdown and CSV files.")
    try:
        data = _read_bytes(file_or_path)
    except (OSError, ValueError) as exc:
        return TextResult(status="failed", detail=f"The file could not be opened: {exc.__class__.__name__}.")
    if data is None:
        return TextResult(status="too_large", detail=f"The file is larger than {_size_limit() // (1024 * 1024)} MB.")
    started = time.monotonic()
    try:
        with _time_limit(TIME_LIMIT_SECONDS):
            if mime == PDF:
                return _pdf(data, started)
            if mime == DOCX:
                return _docx(data)
            return _plain(data)
    except _TimeUp:
        return TextResult(status="failed", detail=f"Reading took longer than {TIME_LIMIT_SECONDS} seconds.")
    except Exception as exc:  # noqa: BLE001 - a broken file must never break the caller
        logger.info("text extraction failed: %s", exc.__class__.__name__)
        return TextResult(status="failed", detail="The file could not be read. It may be damaged.")


def extract_for_document(document, *, force: bool = False):
    """Fills the text of a SubmissionDocument's current version (made if missing). Returns the DocumentVersion."""
    from apps.documents.models import DocumentVersion

    version, _ = DocumentVersion.objects.get_or_create(
        document=document,
        version_number=document.version_number,
        defaults={"file": document.file.name if document.file else "", "external_url": document.external_url, "uploaded_by": document.uploaded_by},
    )
    if version.text_extracted_at and not force:
        return version
    if not document.file:
        result = TextResult(status="unsupported", detail="Links are not read.")
    else:
        mime = document.mime_type or EXTENSION_TYPES.get(Path(document.original_filename or document.file.name).suffix.lower(), "")
        with document.file.open("rb") as handle:
            result = extract_text(handle, mime=mime)
    version.extracted_text = result.text
    version.extracted_pages = result.pages
    version.text_status = result.status
    version.text_detail = result.detail[:300]
    version.text_extracted_at = timezone.now()
    version.save(update_fields=["extracted_text", "extracted_pages", "text_status", "text_detail", "text_extracted_at", "updated_at"])
    return version
