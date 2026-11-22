"""U7: the cut-out innovator photo in the home page banner.

Owner's call (21 Nov 2026): no automatic background removal. Staff upload a PNG whose
background is already transparent; this module only checks it, trims the transparent
edges and makes the sizes the website uses. No background-removal library, no outside API.
"""
from __future__ import annotations

import io
import uuid

from django.core.files.base import ContentFile
from django.core.files.storage import default_storage
from PIL import Image, UnidentifiedImageError
from rest_framework.exceptions import ValidationError

MAX_BYTES = 10 * 1024 * 1024
MIN_HEIGHT = 1200
HEIGHTS = (480, 800, 1200)
SIZES = ("small", "medium", "large")
DEFAULT_SIZE = "medium"
HAS_BACKGROUND = "This photo still has a background. Please upload a PNG with the background removed."


def _refuse(code: str, detail: str):
    raise ValidationError({"file": {"code": code, "detail": detail}})


def _open_png(upload) -> Image.Image:
    if upload is None:
        _refuse("required", "Choose a PNG photo to upload.")
    if upload.size > MAX_BYTES:
        _refuse("too_large", "The photo is larger than 10 MB. Please upload a smaller PNG.")
    try:
        image = Image.open(upload)
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        _refuse("not_png", "Upload a PNG photo.")
    if image.format != "PNG":
        _refuse("not_png", "Upload a PNG photo. Other formats cannot have a transparent background.")
    return image


def check_transparent(image: Image.Image) -> Image.Image:
    """The image as RGBA if it has an alpha channel and four fully transparent corners."""
    has_alpha = image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)
    if not has_alpha:
        _refuse("has_background", HAS_BACKGROUND)
    rgba = image.convert("RGBA")
    width, height = rgba.size
    corners = ((0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1))
    if any(rgba.getpixel(point)[3] != 0 for point in corners):
        _refuse("has_background", HAS_BACKGROUND)
    return rgba


def prepare(upload) -> tuple[Image.Image, bytes]:
    """Check an upload. Returns the trimmed RGBA image and the original bytes."""
    image = _open_png(upload)
    if image.height < MIN_HEIGHT:
        _refuse("too_small", f"The photo must be at least {MIN_HEIGHT} px tall. This one is {image.height} px.")
    rgba = check_transparent(image)
    box = rgba.getchannel("A").getbbox()
    if box is None:
        _refuse("empty", "The photo is completely transparent.")
    trimmed = rgba.crop(box)
    upload.seek(0)
    return trimmed, upload.read()


def _save(path: str, data: bytes) -> str:
    return default_storage.save(path, ContentFile(data))


def make_variants(trimmed: Image.Image, folder: str) -> list[dict]:
    variants = []
    for target in HEIGHTS:
        height = min(target, trimmed.height)
        width = max(1, round(trimmed.width * height / trimmed.height))
        resized = trimmed if height == trimmed.height else trimmed.resize((width, height), Image.LANCZOS)
        webp = io.BytesIO()
        resized.save(webp, format="WEBP", quality=86, method=4)
        png = io.BytesIO()
        resized.save(png, format="PNG")
        variants.append(
            {
                "height": height,
                "width": width,
                "webp": _save(f"{folder}/{target}.webp", webp.getvalue()),
                "png": _save(f"{folder}/{target}.png", png.getvalue()),
            }
        )
    return variants


def create(upload, *, actor) -> "HeroPhoto":  # noqa: F821
    from apps.content.models import HeroPhoto

    trimmed, original = prepare(upload)
    photo_id = uuid.uuid4()
    folder = f"hero_photos/{photo_id}"
    variants = make_variants(trimmed, folder)
    photo = HeroPhoto(
        id=photo_id,
        filename=(getattr(upload, "name", "") or "")[:255],
        size_bytes=len(original),
        width=trimmed.width,
        height=trimmed.height,
        variants=variants,
        uploaded_by=actor,
    )
    photo.original.save(f"{photo_id}.png", ContentFile(original), save=False)
    photo.save()
    return photo


def _url(path: str, request=None) -> str:
    # Relative on purpose: the public home page is cached for everyone, and the site is
    # reached through more than one host name (localhost, the demo domain).
    return default_storage.url(path)


def payload(photo, *, size: str = DEFAULT_SIZE, alt: dict | None = None, request=None) -> dict:
    """What the website needs: WebP srcset (widths), a PNG fallback, the intrinsic size, alt text."""
    variants = sorted(photo.variants or [], key=lambda item: item["height"])
    if not variants:
        return {}
    middle = next((item for item in variants if item["height"] >= 800), variants[-1])
    largest = variants[-1]
    alt = alt or {}
    return {
        "id": str(photo.id),
        "src": _url(middle["webp"], request),
        "srcset": ", ".join(f"{_url(item['webp'], request)} {item['width']}w" for item in variants),
        "png_src": _url(largest["png"], request),
        "width": largest["width"],
        "height": largest["height"],
        "alt_en": (alt.get("en") or "").strip(),
        "alt_tn": (alt.get("tn") or "").strip(),
        "size": size if size in SIZES else DEFAULT_SIZE,
    }


def staff_payload(photo, request=None) -> dict:
    """For the Hero photo block: the file name and size line, and the thumbnail."""
    data = payload(photo, request=request)
    data.update({"filename": photo.filename, "size_bytes": photo.size_bytes, "transparent": True})
    return data
