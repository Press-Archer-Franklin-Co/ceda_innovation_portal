from rest_framework import serializers

from apps.reference.models import Sector
from apps.core.constants import ProgramStatus

from apps.programs.condition_services import FormConditionService
from apps.programs.access import ProgramAccessService
from apps.programs.models import (
    ChallengeJudge,
    FieldValidationRule,
    FormSection,
    Program,
    ProgramStage,
    ProgramType,
    SubmissionForm,
    SubmissionFormField,
    SubmissionFormFieldOption,
    TermsAndConditions,
)


class TermsAndConditionsSerializer(serializers.ModelSerializer):
    document_link = serializers.SerializerMethodField()

    class Meta:
        model = TermsAndConditions
        fields = ("id", "title", "content", "document_url", "pdf_file", "document_link", "active")
        extra_kwargs = {"pdf_file": {"required": False}}

    def get_document_link(self, obj):
        return obj.get_document_link()


class TermsAndConditionsWriteSerializer(serializers.ModelSerializer):
    class Meta:
        model = TermsAndConditions
        fields = ("id", "title", "content", "document_url", "pdf_file", "active")


class ProgramTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramType
        fields = ("id", "code", "name", "description")


class ProgramStageSerializer(serializers.ModelSerializer):
    class Meta:
        model = ProgramStage
        fields = ("id", "name", "code", "ordering", "is_active", "explanation", "usual_duration")


class SubmissionFormFieldOptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = SubmissionFormFieldOption
        fields = ("id", "label", "value", "ordering")


class FieldValidationRuleSerializer(serializers.ModelSerializer):
    class Meta:
        model = FieldValidationRule
        fields = ("id", "rule_type", "rule_value", "error_message", "is_active")


class SubmissionFormFieldSerializer(serializers.ModelSerializer):
    options = SubmissionFormFieldOptionSerializer(many=True, read_only=True)
    field_rules = FieldValidationRuleSerializer(many=True, read_only=True)

    class Meta:
        model = SubmissionFormField
        fields = (
            "id",
            "section",
            "label",
            "key",
            "field_type",
            "help_text",
            "placeholder",
            "link_url",
            "example_value",
            "default_value",
            "required",
            "validation_rules",
            "visible_if",
            "required_if",
            "enabled_if",
            "media_config",
            "ordering",
            "is_active",
            "options",
            "field_rules",
        )

    def validate(self, attrs):
        for key in ("visible_if", "required_if", "enabled_if"):
            FormConditionService.validate_schema(attrs.get(key), path=key)
        return super().validate(attrs)


class FormSectionSerializer(serializers.ModelSerializer):
    fields = SubmissionFormFieldSerializer(many=True, read_only=True)

    class Meta:
        model = FormSection
        fields = ("id", "title", "code", "description", "ordering", "is_active", "fields")


class SubmissionFormSerializer(serializers.ModelSerializer):
    sections = FormSectionSerializer(many=True, read_only=True)
    fields = SubmissionFormFieldSerializer(many=True, read_only=True)

    class Meta:
        model = SubmissionForm
        fields = ("id", "title", "code", "description", "version", "active", "sections", "fields")


class ProgramSerializer(serializers.ModelSerializer):
    program_type = ProgramTypeSerializer(read_only=True)
    program_type_id = serializers.UUIDField(write_only=True)
    terms_and_conditions = TermsAndConditionsSerializer(read_only=True)
    terms_and_conditions_id = serializers.UUIDField(write_only=True, required=False, allow_null=True)
    availability = serializers.SerializerMethodField()
    active_workflow_definition = serializers.SerializerMethodField()
    workflow_definitions = serializers.SerializerMethodField()
    entry = serializers.SerializerMethodField()
    marking_criteria_title = serializers.CharField(source="marking_criteria.title", read_only=True, default=None)
    sectors = serializers.PrimaryKeyRelatedField(many=True, queryset=Sector.objects.filter(active=True), required=False)

    class Meta:
        model = Program
        fields = (
            "id",
            "title",
            "slug",
            "description",
            "program_type",
            "program_type_id",
            "status",
            "opening_date",
            "closing_date",
            "screening_start",
            "screening_end",
            "judging_start",
            "judging_end",
            "event_date",
            "owner",
            "max_team_size",
            "is_public",
            "allow_team_submission",
            "allow_individual_submission",
            "terms_and_conditions",
            "terms_and_conditions_id",
            "published_at",
            "opens_at",
            "closes_at",
            "evaluation_opens_at",
            "evaluation_closes_at",
            "results_publish_at",
            "audience",
            "max_entries_per_person",
            "marking_criteria",
            "marking_criteria_title",
            "results_announced_at",
            "results_hold_reason",
            "entry",
            "availability",
            "active_workflow_definition",
            "workflow_definitions",
            "is_general_intake",
            "sectors",
            "next_panel_at",
        )
        read_only_fields = ("owner", "status", "published_at", "slug", "results_announced_at", "results_hold_reason", "is_general_intake")

    def create(self, validated_data):
        program_type_id = validated_data.pop("program_type_id")
        validated_data["program_type"] = ProgramType.objects.get(id=program_type_id)
        validated_data["owner"] = self.context["request"].user
        terms_id = validated_data.pop("terms_and_conditions_id", None)
        if terms_id:
            validated_data["terms_and_conditions"] = TermsAndConditions.objects.get(id=terms_id)
        return super().create(validated_data)

    def update(self, instance, validated_data):
        program_type_id = validated_data.pop("program_type_id", None)
        if program_type_id:
            instance.program_type = ProgramType.objects.get(id=program_type_id)
        terms_id = validated_data.pop("terms_and_conditions_id", ...)
        if terms_id is not ...:
            instance.terms_and_conditions = (
                TermsAndConditions.objects.get(id=terms_id) if terms_id else None
            )
        return super().update(instance, validated_data)

    def get_availability(self, obj):
        return obj.availability_summary()

    def get_entry(self, obj):
        """Whether the requesting user may enter this challenge right now."""
        if not obj.is_innovation_challenge:
            return None
        request = self.context.get("request")
        return ProgramAccessService.entry_status(obj, getattr(request, "user", None))

    def _workflow_summary(self, definition):
        return {
            "id": str(definition.id),
            "name": definition.name,
            "code": definition.code,
            "status": definition.status,
            "version": definition.version,
            "is_active": definition.is_active,
            "is_current": definition.is_current,
        }

    def get_active_workflow_definition(self, obj):
        definition = obj.workflow_definitions.filter(is_active=True).order_by("-version").first()
        return self._workflow_summary(definition) if definition else None

    def get_workflow_definitions(self, obj):
        definitions = obj.workflow_definitions.order_by("-version")
        return [self._workflow_summary(definition) for definition in definitions]


class ProgramStatusUpdateSerializer(serializers.Serializer):
    status = serializers.ChoiceField(choices=ProgramStatus.choices)


class ChallengeJudgeSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()

    class Meta:
        model = ChallengeJudge
        fields = ("id", "name", "email", "status", "invited_at", "accepted_at", "last_reminded_at", "progress")
        read_only_fields = ("id", "status", "invited_at", "accepted_at", "last_reminded_at", "progress")

    def validate_email(self, value):
        value = value.strip().lower()
        program = self.context.get("program")
        if program and program.challenge_judges.filter(email=value).exists():
            raise serializers.ValidationError("This person is already a judge for this challenge.")
        return value

    def get_status(self, obj):
        if obj.accepted_at:
            return "accepted"
        return "invited" if obj.invited_at else "not_invited"

    def get_progress(self, obj):
        from apps.programs.challenge_judging import ChallengeJudgingService

        return ChallengeJudgingService.progress(obj)
