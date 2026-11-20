from rest_framework import serializers

from apps.support.models import FAQGroup, UnansweredQuestion, EscalationRecord, FAQ, Guideline, InternalTask, SupportRequest


class FAQGroupSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQGroup
        fields = ("id", "name", "translations", "ordering")

    def validate_translations(self, value):
        if not isinstance(value, dict) or set(value) - {"tn"} or set((value.get("tn") or {})) - {"name"}:
            raise serializers.ValidationError('Use {"tn": {"name": "..."}}.')
        return value


class FAQSerializer(serializers.ModelSerializer):
    """Old fields kept; B6 part 2 adds group, placements, program and Setswana."""

    group_name = serializers.CharField(source="group.name", read_only=True, default=None)

    class Meta:
        model = FAQ
        fields = ("id", "question", "answer", "ordering", "is_public", "group", "group_name", "placements", "program", "translations")
        extra_kwargs = {"group": {"required": False, "allow_null": True}, "program": {"required": False, "allow_null": True}}

    def validate_placements(self, value):
        if not isinstance(value, list) or any(item not in FAQ.PLACEMENTS for item in value):
            raise serializers.ValidationError(f"Use some of: {', '.join(FAQ.PLACEMENTS)}.")
        return list(dict.fromkeys(value))

    def validate_translations(self, value):
        if not isinstance(value, dict) or set(value) - {"tn"} or set((value.get("tn") or {})) - {"question", "answer"}:
            raise serializers.ValidationError('Use {"tn": {"question": "...", "answer": "..."}}.')
        return value


class PublicFAQSerializer(FAQSerializer):
    """The same fields, with question and answer in the asked language (English when missing)."""

    def to_representation(self, obj):
        data = super().to_representation(obj)
        lang = self.context.get("lang", "en")
        tn = (obj.translations or {}).get("tn") or {}
        if lang == "tn":
            data["question"] = tn.get("question") or obj.question
            data["answer"] = tn.get("answer") or obj.answer
            group_tn = ((obj.group.translations or {}).get("tn") or {}).get("name") if obj.group_id else None
            if group_tn:
                data["group_name"] = group_tn
        data.pop("translations", None)
        return data


class UnansweredQuestionSerializer(serializers.ModelSerializer):
    class Meta:
        model = UnansweredQuestion
        fields = ("id", "text", "source", "count", "last_asked_at", "resolved_by_faq")
        read_only_fields = ("id", "text", "source", "count", "last_asked_at")


class GuidelineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Guideline
        fields = ("id", "title", "content", "document_url", "audience", "is_public")


class SupportRequestSerializer(serializers.ModelSerializer):
    class Meta:
        model = SupportRequest
        fields = (
            "id",
            "request_type",
            "subject",
            "description",
            "email",
            "phone_number",
            "submission",
            "status",
            "resolution_notes",
            "created_by",
            "created_at",
        )
        read_only_fields = ("status", "resolution_notes", "created_by", "created_at")


class InternalTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = InternalTask
        fields = "__all__"


class EscalationRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = EscalationRecord
        fields = "__all__"
