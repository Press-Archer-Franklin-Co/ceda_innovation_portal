from rest_framework import serializers

from apps.support.models import EscalationRecord, FAQ, Guideline, InternalTask, SupportRequest


class FAQSerializer(serializers.ModelSerializer):
    class Meta:
        model = FAQ
        fields = ("id", "question", "answer", "ordering", "is_public")


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
