from __future__ import annotations

import hashlib
import logging
from io import BytesIO
from pathlib import Path

from django.core.files.base import ContentFile
from django.db import transaction
from PIL import Image, ImageOps, UnidentifiedImageError

from apps.audit.services import AuditService
from apps.core.i18n import translated_default
from apps.media_library.models import MediaAsset
from apps.media_library.validation import MediaValidationError, detect_file, validate_captions

logger = logging.getLogger(__name__)

DEFAULT_MONOCHROME_COLOR = (0, 0, 0)


def parse_hex_color(value: str | None) -> tuple[int, int, int]:
    if not value:
        return DEFAULT_MONOCHROME_COLOR
    raw = value.strip().lstrip("#")
    if len(raw) == 3:
        raw = "".join(ch * 2 for ch in raw)
    if len(raw) != 6:
        raise MediaValidationError("Colour must be a hex value such as #000000.", code="invalid_color")
    try:
        return tuple(int(raw[i : i + 2], 16) for i in (0, 2, 4))  # type: ignore[return-value]
    except ValueError as exc:
        raise MediaValidationError("Colour must be a hex value such as #000000.", code="invalid_color") from exc


class ImageProcessing:
    @staticmethod
    def inspect(upload) -> tuple[int, int]:
        """Check the image decodes and return (width, height)."""
        upload.seek(0)
        try:
            with Image.open(upload) as image:
                image.verify()
            upload.seek(0)
            with Image.open(upload) as image:
                width, height = image.size
        except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError) as exc:
            raise MediaValidationError("The image could not be read.", code="invalid_image") from exc
        finally:
            upload.seek(0)
        return width, height

    @staticmethod
    def monochrome_png(upload, color: tuple[int, int, int] = DEFAULT_MONOCHROME_COLOR) -> bytes:
        """Return a one-colour PNG copy of a logo.

        Logos with transparency keep their shape (alpha channel). Logos on a solid
        background are turned into a silhouette where dark pixels become the colour
        and light pixels become transparent.
        """
        upload.seek(0)
        with Image.open(upload) as source:
            image = ImageOps.exif_transpose(source).convert("RGBA")
        upload.seek(0)
        alpha = image.getchannel("A")
        if alpha.getextrema()[0] < 255:
            mask = alpha
        else:
            mask = ImageOps.invert(image.convert("L"))
            # Treat near-white background as fully transparent.
            mask = mask.point(lambda value: 0 if value < 16 else value)
        result = Image.new("RGBA", image.size, (*color, 255))
        result.putalpha(mask)
        buffer = BytesIO()
        result.save(buffer, format="PNG", optimize=True)
        return buffer.getvalue()


class MediaService:
    @staticmethod
    def _sha256(upload) -> str:
        digest = hashlib.sha256()
        upload.seek(0)
        for chunk in upload.chunks():
            digest.update(chunk)
        upload.seek(0)
        return digest.hexdigest()

    @staticmethod
    @transaction.atomic
    def create_asset(
        *,
        actor,
        upload,
        expected_kind: str | None = None,
        alt_text: dict | None = None,
        captions=None,
        duration_seconds: float | None = None,
        make_monochrome: bool = False,
        monochrome_color: str | None = None,
    ) -> MediaAsset:
        detected = detect_file(upload, expected_kind=expected_kind)
        width = height = None
        if detected.kind == MediaAsset.Kind.IMAGE:
            width, height = ImageProcessing.inspect(upload)
        if make_monochrome and detected.kind != MediaAsset.Kind.IMAGE:
            raise MediaValidationError("A one-colour copy can only be made from an image.", code="monochrome_not_image")
        if captions is not None and detected.kind != MediaAsset.Kind.VIDEO:
            raise MediaValidationError("Captions can only be attached to a video.", code="captions_not_video")
        if captions is not None:
            validate_captions(captions)
        if duration_seconds is not None and detected.kind not in {MediaAsset.Kind.VIDEO, MediaAsset.Kind.AUDIO}:
            duration_seconds = None
        color = parse_hex_color(monochrome_color) if make_monochrome else None

        asset = MediaAsset(
            kind=detected.kind,
            original_filename=(getattr(upload, "name", "") or "")[:255],
            mime_type=detected.mime_type,
            size_bytes=getattr(upload, "size", 0) or 0,
            sha256=MediaService._sha256(upload),
            width=width,
            height=height,
            duration_seconds=duration_seconds,
            alt_text=alt_text or translated_default(),
            uploaded_by=actor,
        )
        asset.file.save(Path(asset.original_filename or f"upload{detected.extension}").name, upload, save=False)
        if captions is not None:
            asset.captions_file.save(Path(captions.name).name, captions, save=False)
        if make_monochrome:
            png = ImageProcessing.monochrome_png(upload, color)
            stem = Path(asset.original_filename).stem or "logo"
            asset.monochrome_file.save(f"{stem}-mono.png", ContentFile(png), save=False)
        asset.save()
        AuditService.log_action(
            actor=actor,
            action_type="media_uploaded",
            target=asset,
            metadata={
                "kind": asset.kind,
                "size_bytes": asset.size_bytes,
                "mime_type": asset.mime_type,
                "monochrome": bool(make_monochrome),
                "captions": captions is not None,
            },
        )
        return asset

    @staticmethod
    def delete_asset(*, asset: MediaAsset, actor) -> None:
        asset_id = str(asset.id)
        metadata = {"kind": asset.kind, "original_filename": asset.original_filename, "owner_id": str(asset.uploaded_by_id or "")}
        files = [asset.file, asset.monochrome_file, asset.captions_file]
        with transaction.atomic():
            AuditService.log_raw_action(
                actor=actor,
                action_type="media_deleted",
                target_model="MediaAsset",
                target_id=asset_id,
                metadata=metadata,
            )
            asset.delete()
        for field_file in files:
            if field_file:
                try:
                    field_file.storage.delete(field_file.name)
                except Exception:
                    logger.exception("Could not remove media file %s", field_file.name)
