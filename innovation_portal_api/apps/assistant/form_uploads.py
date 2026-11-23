"""R-83: files uploaded on the idea form, for document review and the draft check.

File and media questions upload through the media library, so the answer holds a MediaAsset reference
({id, filename, kind, url}), not a SubmissionDocument. FormUpload gives such an asset the few attributes the review
code reads, so one review path serves both kinds.

Access: an asset is reviewable only when its id is in the answers of a draft or idea this person may see. Being the
uploader is not enough. Anything else is a 404, never a 403.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from django.db.models import TextField
from django.db.models.functions import Cast


@dataclass
class FormUpload:
    """A MediaAsset from the form answers, shaped like a SubmissionDocument for the review code."""

    asset: object

    @property
    def pk(self):
        return self.asset.pk

    @property
    def file(self):
        return self.asset.file

    @property
    def original_filename(self) -> str:
        return self.asset.original_filename or str(self.asset.file.name).rsplit("/", 1)[-1]

    @property
    def mime_type(self) -> str:
        return self.asset.mime_type or ""

    @property
    def sha256(self) -> str:
        return self.asset.sha256 or ""

    @property
    def updated_at(self):
        return self.asset.updated_at

    version_number = 1
    is_form_upload = True


def asset_ids(value) -> list[str]:
    """MediaAsset ids in an answer or a whole answers object, in order, each once."""
    found: list[str] = []

    def walk(item):
        if isinstance(item, dict):
            ident = item.get("id")
            if ident and any(key in item for key in ("url", "filename", "kind", "mime_type")):
                try:
                    found.append(str(uuid.UUID(str(ident))))
                except (ValueError, TypeError):
                    pass
            for child in item.values():
                if isinstance(child, (dict, list)):
                    walk(child)
        elif isinstance(item, list):
            for child in item:
                walk(child)

    walk(value)
    return list(dict.fromkeys(found))


def _uploads(ids) -> list[FormUpload]:
    from apps.media_library.models import MediaAsset

    assets = {str(asset.pk): asset for asset in MediaAsset.objects.filter(pk__in=ids).exclude(file="")}
    return [FormUpload(assets[ident]) for ident in ids if ident in assets]


def draft_uploads(draft) -> list[FormUpload]:
    return _uploads(asset_ids(draft.draft_data or {}))


def submission_uploads(submission) -> list[FormUpload]:
    values = [response.value for response in submission.responses.all()]
    return _uploads(asset_ids(values))


def _mentions(queryset, field: str, ident: str):
    """Rows whose JSON ``field`` mentions this id (a text search, checked exactly afterwards)."""
    return queryset.annotate(_text=Cast(field, TextField())).filter(_text__contains=ident)


def upload_for(user, asset_id, *, draft_token: str | None = None):
    """(FormUpload, role) when this person may see a draft or idea whose answers hold the asset, else None."""
    from apps.media_library.models import MediaAsset
    from apps.submissions.intake import DraftTokenService
    from apps.submissions.models import ApplicationDraft, Submission, SubmissionResponse
    from apps.submissions.selectors import SubmissionSelector

    try:
        ident = str(uuid.UUID(str(asset_id)))
    except (ValueError, TypeError):
        return None
    asset = MediaAsset.objects.filter(pk=ident).exclude(file="").first()
    if asset is None:
        return None
    upload = FormUpload(asset)

    def held(draft) -> bool:
        return ident in asset_ids(draft.draft_data or {})

    if user.is_authenticated and any(held(draft) for draft in _mentions(ApplicationDraft.objects.filter(innovator=user), "draft_data", ident)):
        return upload, "owner"
    draft_id = DraftTokenService.draft_id(draft_token) if draft_token else None
    if draft_id:
        try:
            draft = DraftTokenService.guest_draft(draft_token, draft_id)
        except Exception:  # noqa: BLE001 - a bad or old token is simply no access
            draft = None
        if draft is not None and held(draft):
            return upload, "owner"
    if not user.is_authenticated:
        return None
    responses = _mentions(SubmissionResponse.objects.all(), "value", ident)
    submission_ids = {response.submission_id for response in responses if ident in asset_ids(response.value)}
    if not submission_ids:
        return None
    if Submission.objects.filter(pk__in=submission_ids, innovator=user).exists():
        return upload, "owner"
    if SubmissionSelector.for_user(user).filter(pk__in=submission_ids).exists():
        return upload, "staff"
    return None
