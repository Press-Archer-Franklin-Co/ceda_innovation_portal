from decimal import Decimal

from rest_framework import serializers

from apps.assistant.models import FEATURE_DEFAULTS, AssistantSettings, Audience, Feature, Introduction, KnowledgeDocument, KnowledgeEntry, Language, ManualPage, ManualScreenshot

def _lang_field(default=None):
    """Answer language. Left out, the answer is in the person's language (A2)."""
    if default:
        return serializers.ChoiceField(choices=(("en", "English"), ("tn", "Setswana")), default=default)
    return serializers.ChoiceField(choices=(("en", "English"), ("tn", "Setswana")), required=False)


class DraftCheckSerializer(serializers.Serializer):
    draft_id = serializers.UUIDField()
    step = serializers.SlugField(max_length=100, help_text="The step (section) code being checked.")
    answers = serializers.DictField(required=False, default=dict, help_text="Unsaved answers on this step, keyed by field key. They win over the saved draft.")
    lang = _lang_field()


class HelpQuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=1000, trim_whitespace=True)
    lang = _lang_field()
    page_path = serializers.CharField(max_length=255, required=False, allow_blank=True, default="")
    handoff = serializers.BooleanField(default=False, help_text="True when the person pressed Talk to a person: the question goes straight to the staff inbox.")
    contact_name = serializers.CharField(max_length=120, required=False, allow_blank=True, default="")
    contact_phone = serializers.CharField(max_length=32, required=False, allow_blank=True, default="")
    contact_email = serializers.EmailField(required=False, allow_blank=True, default="")


class LangQuerySerializer(serializers.Serializer):
    lang = _lang_field()
    refresh = serializers.BooleanField(default=False)


class SuggestIntroductionSerializer(serializers.Serializer):
    other_submission = serializers.UUIDField()
    kind = serializers.ChoiceField(choices=Introduction.Kind.choices, default=Introduction.Kind.COMPLEMENTARY)
    reason = serializers.CharField(max_length=600, help_text="Why they could work together. Both innovators see it; do not name the other person.")


class AnswerIntroductionSerializer(serializers.Serializer):
    agree = serializers.BooleanField()


class IntroductionStaffSerializer(serializers.ModelSerializer):
    class Meta:
        model = Introduction
        fields = ("id", "first_submission", "second_submission", "kind", "reason", "status", "first_answer", "second_answer", "created_at")


class KnowledgeEntrySerializer(serializers.ModelSerializer):
    audience = serializers.ChoiceField(choices=Audience.choices, default=Audience.EVERYONE)
    language = serializers.ChoiceField(choices=Language.choices, default=Language.ANY)

    class Meta:
        model = KnowledgeEntry
        fields = ("id", "title", "audience", "language", "text", "is_active", "ordering", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")


class ScreenshotSerializer(serializers.ModelSerializer):
    url = serializers.SerializerMethodField()
    width = serializers.IntegerField(source="asset.width", read_only=True)
    height = serializers.IntegerField(source="asset.height", read_only=True)

    class Meta:
        model = ManualScreenshot
        fields = ("id", "page", "asset", "url", "width", "height", "caption", "ordering", "created_at")
        read_only_fields = fields

    def get_url(self, obj) -> str:
        if not obj.asset.file:
            return ""
        request = self.context.get("request")
        return request.build_absolute_uri(obj.asset.file.url) if request else obj.asset.file.url


class ManualPageSerializer(serializers.ModelSerializer):
    audience = serializers.ChoiceField(choices=Audience.choices, default=Audience.EVERYONE)
    language = serializers.ChoiceField(choices=Language.choices, default=Language.ANY)
    screenshots = ScreenshotSerializer(many=True, read_only=True)

    class Meta:
        model = ManualPage
        fields = ("id", "title", "audience", "language", "text", "portal_path", "is_active", "ordering", "screenshots", "created_at", "updated_at")
        read_only_fields = ("id", "screenshots", "created_at", "updated_at")


def _caption(value):
    if value in (None, ""):
        return {}
    if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
        raise serializers.ValidationError('Enter {"en": "...", "tn": "..."}.')
    return {k: v.strip()[:300] for k, v in value.items() if k in ("en", "tn")}


class ScreenshotUploadSerializer(serializers.Serializer):
    file = serializers.ImageField()
    caption_en = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    caption_tn = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    ordering = serializers.IntegerField(required=False, min_value=0)


class ScreenshotUpdateSerializer(serializers.Serializer):
    caption = serializers.JSONField(required=False, validators=[_caption])
    ordering = serializers.IntegerField(required=False, min_value=0)


class ReorderSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), allow_empty=False, max_length=500)


class RouteSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=(("anthropic", "Claude"), ("openai", "OpenAI"), ("openai_compatible", "Other service")), required=False)
    connection = serializers.UUIDField(required=False, allow_null=True)
    model = serializers.CharField(max_length=80, required=False, allow_blank=True)


class SettingsSerializer(serializers.Serializer):
    helper_on = serializers.BooleanField(required=False, help_text="The ai_helper feature switch.")
    keys_in_use = serializers.ChoiceField(choices=AssistantSettings.Keys.choices, required=False)
    routes = serializers.DictField(child=RouteSerializer(allow_null=True), required=False, help_text="Feature key to {provider, connection, model}; null clears it.")
    features = serializers.DictField(child=serializers.BooleanField(), required=False, help_text="Feature key to on or off.")
    monthly_limit_usd = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=Decimal("0"), required=False)
    send_names = serializers.BooleanField(required=False)
    guests_can_use_guide = serializers.BooleanField(required=False)

    def validate_routes(self, value):
        unknown = sorted(set(value) - set(FEATURE_DEFAULTS))
        if unknown:
            raise serializers.ValidationError(f"Unknown features: {', '.join(unknown)}.")
        return {key: (dict(route) if route else None) for key, route in value.items()}

    def validate_features(self, value):
        unknown = sorted(set(value) - set(FEATURE_DEFAULTS))
        if unknown:
            raise serializers.ValidationError(f"Unknown features: {', '.join(unknown)}.")
        return value

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError("Send at least one setting.")
        return attrs


class DocumentReviewSerializer(serializers.Serializer):
    lang = _lang_field()


class KnowledgeDocumentSerializer(serializers.ModelSerializer):
    kind = serializers.ChoiceField(choices=KnowledgeDocument.Kind.choices, required=False)
    audience = serializers.ChoiceField(choices=Audience.choices, required=False)
    language = serializers.ChoiceField(choices=KnowledgeDocument.Language.choices, required=False)
    file_name = serializers.CharField(source="asset.original_filename", read_only=True)
    size_bytes = serializers.IntegerField(source="asset.size_bytes", read_only=True)
    chunk_count = serializers.SerializerMethodField()

    class Meta:
        model = KnowledgeDocument
        fields = ("id", "title", "kind", "audience", "language", "is_active", "status", "error", "file_name", "size_bytes", "chunk_count", "created_at", "updated_at")
        read_only_fields = ("id", "status", "error", "file_name", "size_bytes", "chunk_count", "created_at", "updated_at")

    def get_chunk_count(self, obj) -> int:
        return obj.chunks.count()


class KnowledgeDocumentUploadSerializer(serializers.Serializer):
    file = serializers.FileField()
    title = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
    kind = serializers.ChoiceField(choices=KnowledgeDocument.Kind.choices, default=KnowledgeDocument.Kind.GUIDELINE)
    audience = serializers.ChoiceField(choices=Audience.choices, default=Audience.EVERYONE)
    language = serializers.ChoiceField(choices=KnowledgeDocument.Language.choices, default=KnowledgeDocument.Language.EN)


class TryItSerializer(serializers.Serializer):
    feature = serializers.ChoiceField(choices=((Feature.DRAFT_CHECK.value, "Innovator guidance"), (Feature.HINTS.value, "Officer hints"), (Feature.HELP.value, "Help with the portal")))
    text = serializers.CharField(max_length=8000)
    guidance = serializers.CharField(max_length=4000, required=False, allow_blank=True, default="", help_text="Unsaved guidance to try. It is not stored.")
    lang = _lang_field('en')


class UsageQuerySerializer(serializers.Serializer):
    days = serializers.IntegerField(min_value=1, max_value=366, default=30)
