import hashlib
import logging
import uuid

from django.db import transaction

from apps.audit.services import AuditService
from apps.documents.models import DocumentCategory, SubmissionDocument

logger = logging.getLogger(__name__)


class DocumentService:
    DEFAULT_CATEGORY_CODE = "submission_upload"
    DEFAULT_CATEGORY_NAME = "Submission Upload"

    @classmethod
    def default_category(cls):
        category, _ = DocumentCategory.objects.get_or_create(
            code=cls.DEFAULT_CATEGORY_CODE,
            defaults={"name": cls.DEFAULT_CATEGORY_NAME},
        )
        return category

    @staticmethod
    def grouped_documents(queryset):
        grouped = {}
        for item in queryset.order_by("field_key", "-version_number", "-created_at"):
            key = item.field_key or "_unmapped"
            grouped.setdefault(key, []).append(item)
        return grouped

    @staticmethod
    def _sha256_of_upload(upload) -> str:
        digest = hashlib.sha256()
        for chunk in upload.chunks():
            digest.update(chunk)
        upload.seek(0)
        return digest.hexdigest()

    @staticmethod
    @transaction.atomic
    def create_document(*, serializer, actor, submission=None, application_draft=None, upload, replace_document_id=None):
        field_key = serializer.validated_data.get("field_key", "")
        category = serializer.validated_data.get("category") or DocumentService.default_category()
        replace_target = None
        version_number = 1
        upload_group_id = uuid.uuid4()
        if replace_document_id:
            replace_target = SubmissionDocument.objects.select_for_update().get(id=replace_document_id)
            version_number = replace_target.version_number + 1
            upload_group_id = replace_target.upload_group_id

        document_id = uuid.uuid4()

        save_kwargs = dict(
            id=document_id,
            submission=submission,
            application_draft=application_draft,
            category=category,
            uploaded_by=actor,
            original_filename=getattr(upload, "name", ""),
            mime_type=getattr(upload, "content_type", ""),
            size_bytes=getattr(upload, "size", 0),
            version_number=version_number,
            upload_group_id=upload_group_id,
            is_latest=True,
            is_current=True,
            sha256=DocumentService._sha256_of_upload(upload) if upload is not None else "",
        )
        document = serializer.save(**save_kwargs)
        if replace_target:
            replace_target.is_latest = False
            replace_target.is_current = False
            replace_target.replaced_by = document
            replace_target.save(update_fields=["is_latest", "is_current", "replaced_by", "updated_at"])
            AuditService.log_action(
                actor=actor,
                action_type="document_replaced",
                target=submission or application_draft or document,
                metadata={
                    "old_document_id": str(replace_target.id),
                    "new_document_id": str(document.id),
                    "field_key": field_key,
                },
            )
        else:
            if field_key:
                SubmissionDocument.objects.filter(
                    field_key=field_key,
                    is_current=True,
                    application_draft=application_draft,
                    submission=submission,
                ).exclude(pk=document.pk).update(is_current=False, is_latest=False)
            AuditService.log_action(
                actor=actor,
                action_type="document_uploaded",
                target=submission or application_draft or document,
                metadata={
                    "document_id": str(document.id),
                    "field_key": field_key,
                },
            )
        return document
