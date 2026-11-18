import os

from rest_framework import serializers

from apps.core.constants import DocumentType
from apps.documents.models import SubmissionDocument

_ALLOWED_EXTENSIONS = frozenset({
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".jpg", ".jpeg", ".png", ".gif",
    ".zip", ".csv", ".txt",
})

_MAGIC_CHECKS = (
    (b"%PDF", {".pdf"}),
    (b"PK\x03\x04", {".docx", ".xlsx", ".pptx", ".zip"}),
    (b"\xd0\xcf\x11\xe0", {".doc", ".xls", ".ppt"}),
    (b"\xff\xd8\xff", {".jpg", ".jpeg"}),
    (b"\x89PNG", {".png"}),
    (b"GIF8", {".gif"}),
)


class SubmissionDocumentSerializer(serializers.ModelSerializer):
    download_url = serializers.SerializerMethodField()
    availability = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionDocument
        fields = (
            "id",
            "submission",
            "application_draft",
            "category",
            "field_key",
            "document_type",
            "file",
            "external_url",
            "original_filename",
            "mime_type",
            "size_bytes",
            "uploaded_by",
            "version_number",
            "is_latest",
            "is_current",
            "is_active",
            "replaced_by",
            "upload_group_id",
            "metadata",
            "download_url",
            "availability",
        )
        read_only_fields = (
            "uploaded_by",
            "version_number",
            "is_latest",
            "is_current",
            "is_active",
            "replaced_by",
            "upload_group_id",
        )
        extra_kwargs = {
            "category": {"required": False, "allow_null": True},
            "file": {"write_only": True},
        }

    def get_download_url(self, obj):
        request = self.context.get("request")
        path = f"/api/documents/{obj.id}/download/"
        return request.build_absolute_uri(path) if request else path

    def get_availability(self, obj):
        if obj.document_type == DocumentType.URL:
            return "external"
        if obj.has_local_copy:
            return "available"
        return "missing"

    def validate_file(self, file):
        ext = os.path.splitext(file.name)[1].lower()
        if ext not in _ALLOWED_EXTENSIONS:
            raise serializers.ValidationError(
                f"Files of type '{ext or '(none)'}' are not permitted. "
                f"Allowed: {', '.join(sorted(_ALLOWED_EXTENSIONS))}"
            )
        header = file.read(8)
        file.seek(0)
        for magic, valid_exts in _MAGIC_CHECKS:
            if header.startswith(magic):
                if ext not in valid_exts:
                    raise serializers.ValidationError(
                        "File content does not match its declared extension."
                    )
                return file
        return file
