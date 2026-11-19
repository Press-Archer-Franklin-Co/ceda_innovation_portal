import json as _json

from rest_framework import serializers

from apps.programs.access import ProgramAccessService

from .models import ContentItem, HackathonDetail, HackathonMedia, LeadershipCard, SiteSettings, WinnerSpotlight


class FlexibleJSONField(serializers.JSONField):
    """
    DRF's JSONField with binary=False returns incoming strings unchanged, which
    means multipart/form-data requests (where every value is a string) silently
    store e.g. '["AI"]' as a JSON string rather than the list ["AI"].

    This subclass parses string input with json.loads() first, so both
    application/json and multipart/form-data requests are handled correctly.
    """

    def to_internal_value(self, data):
        if isinstance(data, str):
            try:
                data = _json.loads(data)
            except (ValueError, TypeError):
                self.fail('invalid')
        return super().to_internal_value(data)


VIDEO_EXTENSIONS = {".mp4", ".webm", ".mov", ".ogg"}


def _is_video(file_field):
    """Return True if the stored file looks like a video based on its extension."""
    import os
    if not file_field:
        return False
    _, ext = os.path.splitext(file_field.name.lower())
    return ext in VIDEO_EXTENSIONS


def _media_url(file_field):
    if not file_field:
        return None
    return file_field.url


class ContentItemSerializer(serializers.ModelSerializer):
    author_name = serializers.SerializerMethodField()
    image_url = serializers.SerializerMethodField()
    cover_is_video = serializers.SerializerMethodField()
    tags = FlexibleJSONField(required=False, default=list)

    class Meta:
        model = ContentItem
        fields = [
            "id",
            "title",
            "excerpt",
            "body",
            "category",
            "status",
            "image",
            "image_url",
            "cover_is_video",
            "tags",
            "read_time",
            "is_highlighted",
            "highlight_priority",
            "published_at",
            "author",
            "author_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at", "author_name", "image_url", "cover_is_video"]

    def get_author_name(self, obj):
        if obj.author:
            return obj.author.full_name or obj.author.email
        return None

    def get_image_url(self, obj):
        return _media_url(obj.image)

    def get_cover_is_video(self, obj):
        return _is_video(obj.image)


class ContentItemListSerializer(serializers.ModelSerializer):
    """Lightweight serializer for list views."""

    image_url = serializers.SerializerMethodField()
    cover_is_video = serializers.SerializerMethodField()

    class Meta:
        model = ContentItem
        fields = [
            "id",
            "title",
            "excerpt",
            "category",
            "status",
            "image_url",
            "cover_is_video",
            "tags",
            "read_time",
            "is_highlighted",
            "highlight_priority",
            "published_at",
            "created_at",
        ]

    def get_image_url(self, obj):
        return _media_url(obj.image)

    def get_cover_is_video(self, obj):
        return _is_video(obj.image)


class HackathonMediaSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = HackathonMedia
        fields = ["id", "hackathon_detail", "media_type", "file", "file_url", "caption", "order", "created_at"]
        read_only_fields = ["id", "file_url", "created_at"]

    def get_file_url(self, obj):
        return _media_url(obj.file)


class HackathonDetailSerializer(serializers.ModelSerializer):
    media = HackathonMediaSerializer(many=True, read_only=True)
    banner_image_url = serializers.SerializerMethodField()
    program_title = serializers.SerializerMethodField()
    program_info = serializers.SerializerMethodField()
    marking_criteria = serializers.SerializerMethodField()
    prizes   = FlexibleJSONField(required=False, default=list)
    faq      = FlexibleJSONField(required=False, default=list)
    judges   = FlexibleJSONField(required=False, default=list)
    schedule = FlexibleJSONField(required=False, default=list)

    class Meta:
        model = HackathonDetail
        fields = [
            "id",
            "program",
            "program_title",
            "banner_image",
            "banner_image_url",
            "theme",
            "description",
            "rules",
            "eligibility",
            "prizes",
            "faq",
            "judges",
            "schedule",
            "is_published",
            "media",
            "program_info",
            "marking_criteria",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "banner_image_url", "program_title", "media", "program_info", "marking_criteria", "created_at", "updated_at"]

    def get_banner_image_url(self, obj):
        return _media_url(obj.banner_image)

    def get_program_title(self, obj):
        return str(obj.program)

    def get_program_info(self, obj):
        program = obj.program
        request = self.context.get("request")
        return {
            "type_code": program.program_type.code,
            "status": program.status,
            "audience": program.audience,
            "opens_at": program.submission_opens_at,
            "closes_at": program.submission_closes_at,
            "results_announced_at": program.results_announced_at,
            "entry": ProgramAccessService.entry_status(program, getattr(request, "user", None)),
        }

    def get_marking_criteria(self, obj):
        """Criteria judges score against, taken from the active workflow's scored stages."""
        from apps.evaluation.services import StageConfigService

        definition = obj.program.workflow_definitions.filter(is_active=True).order_by("-version").first()
        if not definition:
            return []
        stages = []
        for step in definition.steps.order_by("order").select_related("evaluation_config"):
            config = getattr(step, "evaluation_config", None)
            if not config:
                continue
            criteria = StageConfigService.effective_criteria(config)
            if criteria:
                stages.append({
                    "stage": step.name,
                    "criteria": [
                        {"name": c["name"], "description": c["description"], "max_score": c["max_score"], "weight": c["weight"]}
                        for c in sorted(criteria, key=lambda c: c["ordering"])
                    ],
                })
        return stages


class SiteSettingsSerializer(serializers.ModelSerializer):
    hero_video_url = serializers.SerializerMethodField()

    class Meta:
        model = SiteSettings
        fields = [
            "hero_video",
            "hero_video_url",
            "hero_video_muted",
            "prize_money_label",
            "solutions_deployed",
            "quote_rotation_seconds",
            "whatsapp_number",
            "ussd_code",
            "call_centre_number",
            "office_finder_url",
            "help_centre_url",
            "accessibility_url",
            "footer_links",
            "languages_enabled",
        ]
        read_only_fields = ["hero_video_url"]

    footer_links = FlexibleJSONField(required=False)
    languages_enabled = FlexibleJSONField(required=False)

    def get_hero_video_url(self, obj):
        return _media_url(obj.hero_video)

    def to_representation(self, obj):
        data = super().to_representation(obj)
        # Blank contact details come back as null so the shell hides them (R-13).
        for key in ("whatsapp_number", "ussd_code", "call_centre_number", "office_finder_url", "help_centre_url", "accessibility_url"):
            data[key] = data.get(key) or None
        data["languages_enabled"] = data.get("languages_enabled") or ["en", "tn"]
        return data

    def validate_footer_links(self, value):
        if not isinstance(value, list) or any(
            not isinstance(item, dict) or not str(item.get("label") or "").strip() or not str(item.get("url") or "").strip() for item in value
        ):
            raise serializers.ValidationError('Footer links are a list of {"label": "...", "url": "..."}.')
        return [{"label": str(item["label"])[:80], "url": str(item["url"])[:500]} for item in value][:20]

    def validate_languages_enabled(self, value):
        if not isinstance(value, list) or not value or any(lang not in ("en", "tn") for lang in value) or "en" not in value:
            raise serializers.ValidationError('Use a list of language codes from en and tn, including en.')
        return list(dict.fromkeys(value))


class LeadershipCardSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    created_by_name = serializers.SerializerMethodField()

    class Meta:
        model = LeadershipCard
        fields = [
            "id",
            "full_name",
            "job_title",
            "committee_role",
            "quote",
            "photo",
            "photo_url",
            "sort_order",
            "is_active",
            "start_at",
            "end_at",
            "created_by",
            "created_by_name",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "photo_url", "created_by", "created_by_name", "created_at", "updated_at"]

    def get_photo_url(self, obj):
        return _media_url(obj.photo)

    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.full_name or obj.created_by.email
        return None


class WinnerSpotlightSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    program_title = serializers.SerializerMethodField()
    position_display = serializers.CharField(source="get_position_display", read_only=True)
    tags = FlexibleJSONField(required=False, default=list)

    class Meta:
        model = WinnerSpotlight
        fields = [
            "id",
            "program",
            "program_title",
            "team_name",
            "project_name",
            "description",
            "position",
            "position_display",
            "members_count",
            "year",
            "tags",
            "photo",
            "photo_url",
            "submission",
            "prize_label",
            "prize_amount",
            "is_featured",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "photo_url", "program_title", "position_display", "submission", "created_at", "updated_at"]

    def get_photo_url(self, obj):
        return _media_url(obj.photo)

    def get_program_title(self, obj):
        return str(obj.program)
