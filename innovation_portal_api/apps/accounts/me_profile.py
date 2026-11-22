"""R-48 (3.39) and R-51 (2.9): a person changes their own name, phone, language and photo."""

from __future__ import annotations

import io
import uuid

from django.core.files.base import ContentFile
from PIL import Image, ImageOps, UnidentifiedImageError
from rest_framework import serializers
from rest_framework.exceptions import ValidationError

from apps.audit.services import AuditService

PHOTO_MAX_BYTES = 5 * 1024 * 1024
PHOTO_SIDE = 512
FIELDS = ("first_name", "last_name", "phone_number", "preferred_language")


class MeUpdateSerializer(serializers.Serializer):
    first_name = serializers.CharField(max_length=150, required=False)
    last_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    phone_number = serializers.RegexField(r"^\+?[0-9 ]{7,20}$", max_length=30, required=False, allow_blank=True, help_text="For WhatsApp alerts.")
    preferred_language = serializers.ChoiceField(choices=("en", "tn"), required=False)

    def validate_first_name(self, value):
        if not value.strip():
            raise serializers.ValidationError("Write your first name.")
        return value.strip()


def _state(user) -> dict:
    return {name: getattr(user, name) for name in FIELDS}


def update_me(user, data: dict) -> None:
    before = _state(user)
    changed = [name for name in FIELDS if name in data and getattr(user, name) != data[name]]
    if "phone_number" in changed:
        user.phone_verified = False
        changed.append("phone_verified")
    for name in changed:
        if name != "phone_verified":
            setattr(user, name, data[name])
    if changed:
        user.save(update_fields=[*changed, "updated_at"] if hasattr(user, "updated_at") else changed)
        AuditService.log_action(actor=user, action_type="account_profile_updated", target=user, before_state=before, after_state=_state(user))


def set_photo(user, upload) -> None:
    if upload is None:
        raise ValidationError({"file": "Choose a photo."})
    if upload.size > PHOTO_MAX_BYTES:
        raise ValidationError({"file": "The photo must be 5 MB or smaller."})
    try:
        image = Image.open(upload)
        image.load()
    except (UnidentifiedImageError, OSError, ValueError):
        raise ValidationError({"file": "This is not a photo we can read. Use a JPG or PNG."}) from None
    # Turn it the right way up, crop to a square and save a fresh JPEG, which drops the camera's hidden data.
    image = ImageOps.fit(ImageOps.exif_transpose(image).convert("RGB"), (PHOTO_SIDE, PHOTO_SIDE))
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=85)
    old = user.photo.name if user.photo else ""
    user.photo.save(f"{uuid.uuid4().hex}.jpg", ContentFile(buffer.getvalue()), save=True)
    if old:
        user.photo.storage.delete(old)
    AuditService.log_action(actor=user, action_type="account_photo_changed", target=user)


def remove_photo(user) -> None:
    if user.photo:
        user.photo.delete(save=True)
        AuditService.log_action(actor=user, action_type="account_photo_removed", target=user)


def photo_url(user, request=None) -> str | None:
    if not user.photo:
        return None
    url = user.photo.url
    return request.build_absolute_uri(url) if request is not None else url
