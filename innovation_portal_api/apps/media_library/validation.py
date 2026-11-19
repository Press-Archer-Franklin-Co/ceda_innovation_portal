"""Work out what an uploaded file really is, and reject anything else.

The kind and MIME type come from the file extension and are confirmed against the
file's first bytes, so a renamed executable is refused. The browser-sent content
type is not trusted.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from django.conf import settings

MB = 1024 * 1024

DEFAULT_SIZE_LIMITS = {
    "image": 10 * MB,
    "document": 20 * MB,
    "audio": 10 * MB,
    "video": 50 * MB,
}
CAPTIONS_SIZE_LIMIT = 1 * MB

# extension -> (kind, mime type)
EXTENSIONS: dict[str, tuple[str, str]] = {
    ".jpg": ("image", "image/jpeg"),
    ".jpeg": ("image", "image/jpeg"),
    ".png": ("image", "image/png"),
    ".gif": ("image", "image/gif"),
    ".webp": ("image", "image/webp"),
    ".mp4": ("video", "video/mp4"),
    ".m4v": ("video", "video/mp4"),
    ".mov": ("video", "video/quicktime"),
    ".webm": ("video", "video/webm"),
    ".mp3": ("audio", "audio/mpeg"),
    ".m4a": ("audio", "audio/mp4"),
    ".aac": ("audio", "audio/aac"),
    ".ogg": ("audio", "audio/ogg"),
    ".oga": ("audio", "audio/ogg"),
    ".wav": ("audio", "audio/wav"),
    ".pdf": ("document", "application/pdf"),
    ".doc": ("document", "application/msword"),
    ".docx": ("document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    ".xls": ("document", "application/vnd.ms-excel"),
    ".xlsx": ("document", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    ".ppt": ("document", "application/vnd.ms-powerpoint"),
    ".pptx": ("document", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    ".odt": ("document", "application/vnd.oasis.opendocument.text"),
    ".txt": ("document", "text/plain"),
    ".csv": ("document", "text/csv"),
}

CAPTION_EXTENSIONS = {".vtt": "text/vtt", ".srt": "application/x-subrip"}


class MediaValidationError(ValueError):
    def __init__(self, message: str, code: str = "invalid"):
        super().__init__(message)
        self.code = code


@dataclass
class DetectedFile:
    kind: str
    mime_type: str
    extension: str


def size_limits() -> dict[str, int]:
    return {**DEFAULT_SIZE_LIMITS, **(getattr(settings, "MEDIA_UPLOAD_SIZE_LIMITS", {}) or {})}


def _head(upload, length: int = 64) -> bytes:
    upload.seek(0)
    head = upload.read(length)
    upload.seek(0)
    return head or b""


def _is_iso_media(head: bytes) -> bool:
    # MP4 / MOV / M4A: a box type at bytes 4-8.
    return head[4:8] in {b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"}


def _is_mpeg_audio(head: bytes) -> bool:
    if head.startswith(b"ID3"):
        return True
    return len(head) >= 2 and head[0] == 0xFF and (head[1] & 0xE0) == 0xE0


def _looks_like_text(upload) -> bool:
    upload.seek(0)
    sample = upload.read(8192) or b""
    upload.seek(0)
    if b"\x00" in sample:
        return False
    try:
        sample.decode("utf-8")
    except UnicodeDecodeError as exc:
        # A multi-byte character may be cut at the end of the sample.
        if exc.start < len(sample) - 4:
            return False
    return True


def _content_matches(extension: str, head: bytes, upload) -> bool:
    if extension in {".jpg", ".jpeg"}:
        return head.startswith(b"\xff\xd8\xff")
    if extension == ".png":
        return head.startswith(b"\x89PNG\r\n\x1a\n")
    if extension == ".gif":
        return head.startswith(b"GIF87a") or head.startswith(b"GIF89a")
    if extension == ".webp":
        return head.startswith(b"RIFF") and head[8:12] == b"WEBP"
    if extension in {".mp4", ".m4v", ".mov", ".m4a"}:
        return _is_iso_media(head)
    if extension == ".webm":
        return head.startswith(b"\x1a\x45\xdf\xa3")
    if extension in {".mp3", ".aac"}:
        return _is_mpeg_audio(head)
    if extension in {".ogg", ".oga"}:
        return head.startswith(b"OggS")
    if extension == ".wav":
        return head.startswith(b"RIFF") and head[8:12] == b"WAVE"
    if extension == ".pdf":
        return head.startswith(b"%PDF")
    if extension in {".docx", ".xlsx", ".pptx", ".odt"}:
        return head.startswith(b"PK\x03\x04")
    if extension in {".doc", ".xls", ".ppt"}:
        return head.startswith(b"\xd0\xcf\x11\xe0")
    if extension in {".txt", ".csv"}:
        return _looks_like_text(upload)
    return False


def detect_file(upload, *, expected_kind: str | None = None) -> DetectedFile:
    """Return the kind and MIME type of ``upload`` or raise ``MediaValidationError``."""
    name = getattr(upload, "name", "") or ""
    extension = Path(name).suffix.lower()
    if extension not in EXTENSIONS:
        allowed = ", ".join(sorted(EXTENSIONS))
        raise MediaValidationError(f"This file type is not allowed. Allowed types: {allowed}.", code="unsupported_type")
    kind, mime_type = EXTENSIONS[extension]
    # R-7: WebM holds video or sound. Chrome records voice notes as audio/webm, so a WebM
    # file the client calls audio (kind=audio or an audio/* type) is stored as audio.
    if extension == ".webm" and (expected_kind == "audio" or str(getattr(upload, "content_type", "") or "").startswith("audio/")):
        kind, mime_type = "audio", "audio/webm"
    if expected_kind and expected_kind != kind:
        raise MediaValidationError(f"Expected a {expected_kind} file but got a {kind} file.", code="kind_mismatch")
    if not _content_matches(extension, _head(upload), upload):
        raise MediaValidationError("The file content does not match its extension.", code="content_mismatch")
    limit = size_limits()[kind]
    size = getattr(upload, "size", 0) or 0
    if size > limit:
        raise MediaValidationError(
            f"{kind.title()} files can be at most {limit // MB} MB.",
            code="too_large",
        )
    if size == 0:
        raise MediaValidationError("The file is empty.", code="empty")
    return DetectedFile(kind=kind, mime_type=mime_type, extension=extension)


def validate_captions(upload) -> str:
    """Check a captions file (WebVTT or SRT) and return its MIME type."""
    extension = Path(getattr(upload, "name", "") or "").suffix.lower()
    if extension not in CAPTION_EXTENSIONS:
        raise MediaValidationError("Captions must be a .vtt or .srt file.", code="unsupported_captions")
    if (getattr(upload, "size", 0) or 0) > CAPTIONS_SIZE_LIMIT:
        raise MediaValidationError("Captions files can be at most 1 MB.", code="captions_too_large")
    if not _looks_like_text(upload):
        raise MediaValidationError("Captions must be a text file.", code="captions_not_text")
    if extension == ".vtt":
        head = _head(upload, 16).lstrip(b"\xef\xbb\xbf")
        if not head.startswith(b"WEBVTT"):
            raise MediaValidationError("A .vtt captions file must start with WEBVTT.", code="captions_invalid")
    return CAPTION_EXTENSIONS[extension]
