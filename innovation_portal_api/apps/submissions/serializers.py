from rest_framework import serializers

from apps.core.constants import SubmissionFormFieldType
from apps.documents.models import SubmissionDocument
from apps.programs.serializers import ProgramSerializer
from apps.submissions.models import (
    ApplicationDraft,
    Submission,
    SubmissionInternalNote,
    SubmissionOutcome,
    SubmissionResponse,
    SubmissionStatusHistory,
)
from apps.workflow.serializers import WorkflowInstanceSerializer


class SubmissionResponseSerializer(serializers.ModelSerializer):
    field_label = serializers.SerializerMethodField()
    field_key = serializers.SerializerMethodField()
    field_type = serializers.SerializerMethodField()
    value = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionResponse
        fields = ("id", "form_field", "field_label", "field_key", "field_type", "form_version_snapshot", "value")

    def get_field_label(self, obj):
        label = obj.field_label_snapshot or getattr(obj.form_field, "label", "")
        key = self.get_field_key(obj)
        return self._normalized_label(key, label)

    def get_field_key(self, obj):
        raw = obj.field_key_snapshot or getattr(obj.form_field, "key", "")
        return self._normalized_key(raw)

    def get_field_type(self, obj):
        raw = self.get_field_key(obj)
        if raw == "birthday":
            return SubmissionFormFieldType.DATE
        return obj.field_type_snapshot or getattr(obj.form_field, "field_type", "")

    def get_value(self, obj):
        field_type = self.get_field_type(obj)
        if field_type != SubmissionFormFieldType.FILE:
            return obj.value

        field_key = self.get_field_key(obj)
        documents = SubmissionDocument.objects.filter(
            submission=obj.submission,
            is_active=True,
            is_current=True,
            field_key=field_key,
        ).order_by("-created_at")
        if not documents.exists():
            return obj.value
        payload = []
        for document in documents:
            payload.append(
                {
                    "id": str(document.id),
                    "document_id": str(document.id),
                    "field_key": document.field_key,
                    "original_filename": document.original_filename,
                    "mime_type": document.mime_type,
                    "size_bytes": document.size_bytes,
                    "file_url": "",
                    "external_url": document.external_url,
                }
            )
        return payload

    @staticmethod
    def _normalized_key(raw: str) -> str:
        mapping = {
            "email_address": "email",
            "linkedin_link": "linkedin_profile",
            "website_link": "website_portfolio",
            "age_group": "birthday",
        }
        return mapping.get(raw, raw)

    @staticmethod
    def _normalized_label(key: str, fallback: str) -> str:
        labels = {
            "email": "Email Address",
            "linkedin_profile": "LinkedIn Profile",
            "website_portfolio": "Website / Portfolio",
            "birthday": "Birthday",
            "id_passport_number": "ID / Passport Number",
            "person_type_other": "Person Type (Other)",
        }
        return labels.get(key, fallback)


class ApplicationDraftSerializer(serializers.ModelSerializer):
    program_detail = ProgramSerializer(source="program", read_only=True)

    class Meta:
        model = ApplicationDraft
        fields = (
            "id",
            "reference_number",
            "program",
            "program_detail",
            "submission_type",
            "innovator",
            "team",
            "title",
            "status",
            "version",
            "draft_data",
            "progress_metadata",
            "current_section_code",
            "submitted_submission",
            "submitted_at",
            "metadata",
            "channel",
        )
        read_only_fields = (
            "reference_number",
            "innovator",
            "channel",
            "status",
            "version",
            "progress_metadata",
            "submitted_submission",
            "submitted_at",
        )


class SubmissionSerializer(serializers.ModelSerializer):
    responses = SubmissionResponseSerializer(many=True, read_only=True)
    program_detail = ProgramSerializer(source="program", read_only=True)
    workflow = WorkflowInstanceSerializer(source="workflow_instance", read_only=True)
    innovator_detail = serializers.SerializerMethodField()

    class Meta:
        model = Submission
        fields = (
            "id",
            "reference_number",
            "program",
            "program_detail",
            "submission_type",
            "innovator",
            "innovator_detail",
            "team",
            "title",
            "current_status",
            "submitted_at",
            "screening_outcome",
            "final_decision",
            "locked_for_editing",
            "latest_version_number",
            "form_version_number",
            "metadata",
            "responses",
            "workflow",
            "channel",
        )
        read_only_fields = ("reference_number", "innovator", "current_status", "submitted_at", "locked_for_editing", "latest_version_number", "channel")

    def get_innovator_detail(self, obj):
        user = getattr(obj, "innovator", None)
        if not user:
            return None
        return {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "full_name": user.full_name,
        }

    def create(self, validated_data):
        from apps.submissions.services import SubmissionService

        return SubmissionService.create_draft(innovator=self.context["request"].user, **validated_data)


class SubmissionStatusHistorySerializer(serializers.ModelSerializer):
    changed_by_name = serializers.SerializerMethodField()

    def get_changed_by_name(self, obj):
        user = obj.changed_by
        if not user:
            return "System"
        if self.context.get("public"):
            return "CEDA Innovation Team"
        name = user.full_name.strip()
        return name if name else user.email

    class Meta:
        model = SubmissionStatusHistory
        fields = "__all__"


class SubmissionInternalNoteSerializer(serializers.ModelSerializer):
    author_detail = serializers.SerializerMethodField()

    class Meta:
        model = SubmissionInternalNote
        fields = ("id", "note", "author", "author_detail", "created_at")

    def get_author_detail(self, obj):
        user = obj.author
        if not user:
            return None
        full_name = getattr(user, "full_name", "").strip()
        return {
            "id": str(user.id),
            "full_name": full_name or f"{user.first_name} {user.last_name}".strip() or user.email,
            "email": user.email,
            "initials": "".join(p[0].upper() for p in (full_name or user.email).split()[:2]),
        }


class SubmissionOutcomeSerializer(serializers.ModelSerializer):
    decision_step_name = serializers.CharField(source="decision_step.name", read_only=True)
    decided_by_name = serializers.CharField(source="decided_by.full_name", read_only=True)

    class Meta:
        model = SubmissionOutcome
        fields = (
            "id",
            "submission",
            "program",
            "outcome_type",
            "decided_by",
            "decided_by_name",
            "decision_step",
            "decision_step_name",
            "decided_at",
            "score_snapshot",
            "ranking_position",
            "rationale",
            "is_current",
        )
