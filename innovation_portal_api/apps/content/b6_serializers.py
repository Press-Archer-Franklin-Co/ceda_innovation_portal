"""Serializers for B6 part 1: posts, partners, approvals, home page."""

from django.core.exceptions import ValidationError as DjangoValidationError
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.content.models import ContentItem, Partner
from apps.content.services import PostService, bilingual
from apps.media_library.models import MediaAsset
from apps.programs.models import Program

LANGS = ("en", "tn")


@extend_schema_field(
    {"type": "object", "properties": {"en": {"type": "string"}, "tn": {"type": "string"}}, "description": "Text in English and Setswana; a plain string is English."}
)
class BilingualAttrField(serializers.Field):
    """Reads/writes one translatable attribute as {"en", "tn"}: English in the column, Setswana in translations."""

    def __init__(self, attr, *, max_length=None, required_english=False, **kwargs):
        self.attr, self.max_length, self.required_english = attr, max_length, required_english
        kwargs["source"] = "*"
        super().__init__(**kwargs)

    def to_representation(self, obj):
        return bilingual(obj, self.attr)

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = {"en": data}
        if not isinstance(data, dict) or set(data) - set(LANGS) or any(v is not None and not isinstance(v, str) for v in data.values()):
            raise serializers.ValidationError('Enter text as {"en": "...", "tn": "..."} or a plain English string.')
        for lang, text in data.items():
            if self.max_length and text and len(text) > self.max_length:
                raise serializers.ValidationError(f"Text for {lang} must be at most {self.max_length} characters.")
        if self.required_english and "en" in data and not (data.get("en") or "").strip():
            raise serializers.ValidationError("English text is required.")
        return {f"__text__{self.attr}": data}


class PostSerializer(serializers.ModelSerializer):
    """Staff post editor (/api/content/posts/). Texts are {en, tn}."""

    title = BilingualAttrField("title", max_length=255, required_english=True)
    excerpt = BilingualAttrField("excerpt", max_length=500, required=False)
    body = BilingualAttrField("body", required=False)
    cover_id = serializers.PrimaryKeyRelatedField(source="cover", queryset=MediaAsset.objects.filter(kind__in=["image", "video"]), required=False, allow_null=True)
    cover = serializers.SerializerMethodField()
    shows_on = serializers.SerializerMethodField()
    is_new = serializers.BooleanField(read_only=True)
    is_pinned = serializers.BooleanField(read_only=True)
    approval = serializers.SerializerMethodField()
    tags = serializers.ListField(child=serializers.CharField(max_length=60), required=False)

    class Meta:
        model = ContentItem
        fields = (
            "id",
            "slug",
            "type",
            "category",
            "status",
            "title",
            "excerpt",
            "body",
            "cover_id",
            "cover",
            "tags",
            "read_time",
            "show_in_news_flash",
            "show_on_bulletin",
            "is_highlighted",
            "highlight_priority",
            "pinned_until",
            "mark_new_days",
            "event_starts_at",
            "event_place",
            "newsletter_issue",
            "publish_at",
            "unpublish_at",
            "published_at",
            "view_count",
            "shows_on",
            "is_new",
            "is_pinned",
            "approval",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "status", "category", "published_at", "view_count", "created_at", "updated_at")
        extra_kwargs = {"slug": {"required": False, "allow_null": True}}

    def get_cover(self, obj) -> dict | None:
        return PostService.cover(obj, self.context.get("request"))

    def get_shows_on(self, obj) -> list[str]:
        return PostService.shows_on(obj)

    def get_approval(self, obj) -> dict | None:
        from apps.content.services import ApprovalService

        approval = ApprovalService.open_for(obj).first() if obj.pk else None
        return ApprovalService.payload(approval) if approval else None

    def _apply_texts(self, instance, validated):
        texts = {}
        for key in list(validated):
            if key.startswith("__text__"):
                texts[key[len("__text__"):]] = validated.pop(key)
        translations = dict(instance.translations or {})
        for attr, value in texts.items():
            if "en" in value:
                setattr(instance, attr, value.get("en") or "")
            if "tn" in value:
                bucket = dict(translations.get("tn") or {})
                if value.get("tn"):
                    bucket[attr] = value["tn"]
                else:
                    bucket.pop(attr, None)
                translations["tn"] = bucket
        instance.translations = {lang: bucket for lang, bucket in translations.items() if bucket}

    def _save(self, instance, validated):
        self._apply_texts(instance, validated)
        for key, value in validated.items():
            setattr(instance, key, value)
        if "type" in validated:
            instance.category = {"result": "winners", "notice": "announcement"}.get(instance.type, instance.category or "announcement")
        try:
            instance.clean_post_fields()
            instance.save()
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.message_dict if hasattr(exc, "message_dict") else exc.messages)
        return instance

    def to_internal_value(self, data):
        validated = super().to_internal_value(data)
        # BilingualAttrField returns {"__text__attr": ...} under source "*", which DRF merges into validated data.
        return validated

    def create(self, validated_data):
        instance = ContentItem(author=self.context["request"].user, status="draft")
        return self._save(instance, validated_data)

    def update(self, instance, validated_data):
        return self._save(instance, validated_data)


class PinSerializer(serializers.Serializer):
    until = serializers.DateTimeField(allow_null=True, help_text="Pinned to the top of the bulletin board until then. null unpins.")


class SubmitSerializer(serializers.Serializer):
    publish_at = serializers.DateTimeField(required=False, allow_null=True, help_text="Publish at this time once approved. Default: as soon as it is approved.")


class DecisionSerializer(serializers.Serializer):
    comment = serializers.CharField(required=False, allow_blank=True, max_length=2000)


class PartnerSerializer(serializers.ModelSerializer):
    logo_id = serializers.PrimaryKeyRelatedField(source="logo", queryset=MediaAsset.objects.filter(kind="image"), required=False, allow_null=True)
    logo = serializers.SerializerMethodField()
    program_ids = serializers.PrimaryKeyRelatedField(source="programs", queryset=Program.objects.all(), many=True, required=False)

    class Meta:
        model = Partner
        fields = (
            "id",
            "name",
            "short_label",
            "logo_id",
            "logo",
            "url",
            "tier",
            "order",
            "show_on_home",
            "show_from",
            "show_until",
            "program_ids",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = ("id", "created_at", "updated_at")

    def get_logo(self, obj) -> dict | None:
        from apps.content.services import media_payload

        return media_payload(obj.logo, self.context.get("request"))

    def validate(self, attrs):
        show_from = attrs.get("show_from", getattr(self.instance, "show_from", None))
        show_until = attrs.get("show_until", getattr(self.instance, "show_until", None))
        if show_from and show_until and show_until <= show_from:
            raise serializers.ValidationError({"show_until": "Show-until must be after show-from."})
        return attrs


class HomeDraftSerializer(serializers.Serializer):
    sections = serializers.ListField(child=serializers.DictField(), help_text="[{id?, type, enabled, settings}] in order; the banner stays first.")
