from rest_framework import serializers

from apps.core.constants import SubmissionFormFieldType
from apps.documents.models import SubmissionDocument
from apps.programs.models import Program
from apps.programs.serializers import ProgramSerializer
from apps.submissions.models import (
    ApplicationDraft,
    Submission,
    SubmissionInternalNote,
    SubmissionOutcome,
    SubmissionResponse,
    SubmissionStatusHistory,
)
from apps.reference.models import Sector
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
    # Optional: a draft without a programme goes to the general ideas programme.
    program = serializers.PrimaryKeyRelatedField(queryset=Program.objects.all(), required=False)
    submission_type = serializers.ChoiceField(choices=ApplicationDraft._meta.get_field("submission_type").choices, required=False)
    sector = serializers.PrimaryKeyRelatedField(queryset=Sector.objects.filter(active=True), required=False, allow_null=True)
    percent_complete = serializers.SerializerMethodField()
    guest_phone_verified = serializers.SerializerMethodField()
    form_id = serializers.SerializerMethodField(help_text="The programme's form; load GET /api/forms/{form_id}/published/.")
    form_version_id = serializers.SerializerMethodField(help_text="The latest published version of that form (null if never published).")
    send_now_allowed = serializers.SerializerMethodField(
        help_text="True when this idea may be sent before every required question is answered (a General ideas quick start "
        "while \"Send ideas with just the basics\" is on, R-23). The form then offers \"Send now, finish later\"."
    )

    class Meta:
        model = ApplicationDraft
        fields = (
            "id",
            "reference_number",
            "program",
            "program_detail",
            "submission_type",
            "sector",
            "is_general_idea",
            "percent_complete",
            "guest_phone_verified",
            "form_id",
            "form_version_id",
            "send_now_allowed",
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
            "is_general_idea",
        )

    def get_percent_complete(self, obj) -> int:
        return int((obj.progress_metadata or {}).get("percent_complete") or 0)

    def get_guest_phone_verified(self, obj) -> bool:
        return bool(obj.guest_phone_verified_at)

    def get_form_id(self, obj) -> str | None:
        form_id = getattr(obj.program, "form_id", None) if obj.program_id else None
        return str(form_id) if form_id else None

    def get_send_now_allowed(self, obj) -> bool:
        from apps.submissions.draft_services import ApplicationDraftService

        return obj.status == ApplicationDraft.STATUS_DRAFT and ApplicationDraftService.allows_basics_only(obj)

    def get_form_version_id(self, obj) -> str | None:
        form = obj.program.form if obj.program_id else None
        version = form.latest_version if form else None
        return str(version.id) if version else None


class QuickStartSerializer(serializers.Serializer):
    title = serializers.CharField(max_length=255, trim_whitespace=True)
    sector = serializers.PrimaryKeyRelatedField(
        queryset=Sector.objects.filter(active=True), required=False, allow_null=True,
        help_text="Leave out or send null for \"not sure\"; officers set it later (R-21).",
    )
    program_id = serializers.UUIDField(required=False, allow_null=True)


class QuickStartResponseSerializer(serializers.Serializer):
    draft_id = serializers.UUIDField()
    resume_token = serializers.CharField()
    expires_in = serializers.IntegerField(help_text="Seconds until the resume token stops working.")


class DraftSubmitSerializer(serializers.Serializer):
    # Not required here so that the service can check programme access first and
    # then answer with the consent_required code.
    consent = serializers.BooleanField(required=False, default=False)
    create_account = serializers.BooleanField(required=False, default=True)
    name = serializers.CharField(required=False, allow_blank=True, max_length=255, help_text="Full name. first_name and last_name win when sent.")
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    district = serializers.CharField(required=False, allow_blank=True, max_length=80, help_text="Reference district id or slug (R-22).")
    email = serializers.EmailField(required=False, allow_blank=True, help_text="Optional: also gets the confirmation copy (R-22).")

    def validate_district(self, value):
        from apps.reference.models import District

        value = (value or "").strip()
        if not value:
            return None
        district = District.objects.filter(active=True, slug=value).first()
        if district is None:
            try:
                district = District.objects.filter(active=True, id=value).first()
            except Exception:  # not a UUID
                district = None
        if district is None:
            raise serializers.ValidationError("Choose a district from the list.")
        return district

    def validate_email(self, value):
        return (value or "").strip().lower()


class DraftStepSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.JSONField(), allow_empty=True)


class DraftPhoneVerifySerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.RegexField(r"^\d{4,8}$", error_messages={"invalid": "Enter the code from the text message."})

    def validate_phone(self, value):
        from apps.core.phone import try_normalize_phone

        normalized = try_normalize_phone(value)
        if not normalized:
            raise serializers.ValidationError("Enter a valid phone number.")
        return normalized


class SimilarIdeasRequestSerializer(serializers.Serializer):
    text = serializers.CharField(min_length=3, max_length=2000)
    sector = serializers.PrimaryKeyRelatedField(queryset=Sector.objects.filter(active=True), required=False, allow_null=True)


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
            "sector",
            "is_guest",
            "guest_name",
            "guest_phone",
        )
        read_only_fields = ("reference_number", "innovator", "current_status", "submitted_at", "locked_for_editing", "latest_version_number", "channel", "sector", "is_guest", "guest_name", "guest_phone")

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
