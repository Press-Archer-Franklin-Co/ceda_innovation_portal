"""Serializers for the standalone form endpoints (/api/forms/, B4)."""

from rest_framework import serializers

from apps.programs.form_schema import bilingual
from apps.programs.models import FormVersion, Program, SubmissionForm


class LinkedProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = ("id", "title", "status")


class FormListItemSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="title")
    name_i18n = serializers.SerializerMethodField(help_text='{"en": "...", "tn": "..."}')
    linked_programs = serializers.SerializerMethodField()
    question_count = serializers.IntegerField(read_only=True)
    step_count = serializers.IntegerField(read_only=True)
    answer_count = serializers.IntegerField(read_only=True)
    latest_version = serializers.SerializerMethodField()
    layout_preview = serializers.SerializerMethodField(help_text='Widths of the first 4 rows, e.g. [["half", "half"], ["full"]].')
    general_ideas = serializers.SerializerMethodField(help_text="True for the form General ideas uses (the general idea form, prompt 31).")

    class Meta:
        model = SubmissionForm
        fields = (
            "id",
            "name",
            "name_i18n",
            "code",
            "status",
            "languages",
            "is_template",
            "template_meta",
            "linked_programs",
            "question_count",
            "step_count",
            "answer_count",
            "version",
            "latest_version",
            "layout_preview",
            "general_ideas",
            "created_at",
            "updated_at",
        )

    def get_name_i18n(self, obj) -> dict:
        return bilingual(obj, "title")

    def get_linked_programs(self, obj) -> list[dict]:
        return LinkedProgramSerializer(sorted(obj.programs.all(), key=lambda item: item.created_at), many=True).data

    def get_latest_version(self, obj) -> dict | None:
        versions = sorted(obj.versions.all(), key=lambda item: item.number, reverse=True)
        return FormVersionSummarySerializer(versions[0]).data if versions else None

    def get_general_ideas(self, obj) -> bool:
        return any(program.is_general_intake for program in obj.programs.all())

    def get_layout_preview(self, obj) -> list:
        from apps.programs.form_builder import FormLibraryService

        return FormLibraryService.layout_preview(obj)


class FormTemplateSerializer(FormListItemSerializer):
    estimated_minutes = serializers.SerializerMethodField()
    works_on_ussd = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()

    class Meta(FormListItemSerializer.Meta):
        fields = ("id", "name", "name_i18n", "description", "question_count", "step_count", "estimated_minutes", "works_on_ussd", "languages", "layout_preview")

    def get_estimated_minutes(self, obj) -> int | None:
        return (obj.template_meta or {}).get("estimated_minutes")

    def get_works_on_ussd(self, obj) -> bool:
        return bool((obj.template_meta or {}).get("works_on_ussd"))

    def get_description(self, obj) -> str:
        return (obj.template_meta or {}).get("description") or obj.description


class FormVersionSummarySerializer(serializers.ModelSerializer):
    published_by = serializers.SerializerMethodField()

    class Meta:
        model = FormVersion
        fields = ("id", "number", "published_at", "published_by")

    def get_published_by(self, obj) -> str | None:
        user = obj.published_by
        return (user.full_name or user.email) if user else None


class FormCreateSerializer(serializers.Serializer):
    START_CHOICES = ("template", "scratch", "copy")

    start = serializers.ChoiceField(choices=START_CHOICES)
    source_id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(max_length=255)
    program_id = serializers.UUIDField(required=False, allow_null=True)
    languages = serializers.ListField(child=serializers.ChoiceField(choices=("en", "tn")), required=False, allow_empty=False)

    def validate(self, attrs):
        start = attrs["start"]
        source = None
        if start in {"template", "copy"}:
            if not attrs.get("source_id"):
                raise serializers.ValidationError({"source_id": f"Choose the form to start from when start is {start}."})
            source = SubmissionForm.objects.filter(id=attrs["source_id"]).first()
            if source is None:
                raise serializers.ValidationError({"source_id": "Form not found."})
            if start == "template" and not source.is_template:
                raise serializers.ValidationError({"source_id": "This form is not a template."})
        attrs["source"] = source
        program = None
        if attrs.get("program_id"):
            program = Program.objects.filter(id=attrs["program_id"]).first()
            if program is None:
                raise serializers.ValidationError({"program_id": "Programme not found."})
        attrs["program"] = program
        if attrs.get("languages") and "en" not in attrs["languages"]:
            raise serializers.ValidationError({"languages": "English is always one of the languages."})
        return attrs


class FormUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)
    languages = serializers.ListField(child=serializers.ChoiceField(choices=("en", "tn")), required=False, allow_empty=False)
    status = serializers.ChoiceField(choices=(SubmissionForm.Status.LIVE, SubmissionForm.Status.CLOSED), required=False, help_text="Open (live) or close a published form. Use archive/ to archive.")

    def validate_languages(self, value):
        if "en" not in value:
            raise serializers.ValidationError("English is always one of the languages.")
        return list(dict.fromkeys(value))


class TranslationRowWriteSerializer(serializers.Serializer):
    key = serializers.CharField()
    en = serializers.CharField(required=False, allow_blank=True)
    tn = serializers.CharField(required=False, allow_blank=True)


class TranslationsWriteSerializer(serializers.Serializer):
    rows = TranslationRowWriteSerializer(many=True, allow_empty=False)


class TranslationSuggestSerializer(serializers.Serializer):
    keys = serializers.ListField(child=serializers.CharField(), required=False, help_text="Only these rows. Default: every row missing Setswana.")


class TranslationReviewRequestSerializer(serializers.Serializer):
    role = serializers.CharField(max_length=50, help_text="Everyone with this role is notified: a built-in or custom role code (S2).")
    note = serializers.CharField(required=False, allow_blank=True, max_length=1000)


    def validate_role(self, value):
        from apps.accounts.models import Role

        if not Role.objects.filter(code=value, is_active=True).exists():
            raise serializers.ValidationError("Choose an active role.")
        return value

class AttachFormSerializer(serializers.Serializer):
    form_id = serializers.UUIDField()


class DuplicateFormSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255, required=False)


# Documentation-only shapes for the nested form document (see apps/programs/form_schema.py).
class _TextSerializer(serializers.Serializer):
    en = serializers.CharField(allow_blank=True)
    tn = serializers.CharField(allow_blank=True)


class _OptionDocSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    value = serializers.CharField()
    label = _TextSerializer()
    description = _TextSerializer(required=False, help_text="Optional second line on radio cards.")


class _RuleDocSerializer(serializers.Serializer):
    rule_type = serializers.CharField()
    rule_value = serializers.CharField()
    error_message = serializers.CharField(allow_blank=True)


class _FieldDocSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    key = serializers.CharField()
    type = serializers.CharField()
    label = _TextSerializer()
    help_text = _TextSerializer()
    placeholder = _TextSerializer()
    required = serializers.BooleanField()
    is_challenge_question = serializers.BooleanField(required=False, help_text="Shows the Challenge question badge.")
    width = serializers.ChoiceField(choices=("quarter", "half", "three_quarter", "full"))
    is_active = serializers.BooleanField()
    link_url = serializers.CharField(allow_blank=True)
    visible_if = serializers.JSONField(help_text='{"all": [{"field": "has_company", "op": "equals", "value": "yes"}]}; ops: equals, not_equals, in, is_empty, is_not_empty; "any" for OR')
    required_if = serializers.JSONField()
    enabled_if = serializers.JSONField()
    validation_rules = serializers.JSONField()
    media_config = serializers.JSONField()
    default_value = serializers.JSONField()
    example_value = serializers.JSONField()
    options = _OptionDocSerializer(many=True)
    rules = _RuleDocSerializer(many=True)


class _RowDocSerializer(serializers.Serializer):
    row = serializers.IntegerField(read_only=True)
    fields = _FieldDocSerializer(many=True)


class _StepDocSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False)
    code = serializers.CharField()
    title = _TextSerializer()
    description = _TextSerializer()
    tips = _TextSerializer(many=True, required=False, help_text='"Tips for this step"')
    is_active = serializers.BooleanField()
    rows = _RowDocSerializer(many=True)


class FormDocumentSerializer(serializers.Serializer):
    """The whole form as one document. GET returns it; PUT takes the same shape."""

    id = serializers.UUIDField(read_only=True)
    name = _TextSerializer()
    description = _TextSerializer()
    languages = serializers.ListField(child=serializers.CharField())
    steps = _StepDocSerializer(many=True)
    loose_fields = _FieldDocSerializer(many=True, required=False, help_text="Older questions that are not in any step.")
