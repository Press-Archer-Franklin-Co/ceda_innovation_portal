from rest_framework import serializers

from apps.audit import presentation
from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name  = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()
    # U9 (3.29)
    area        = serializers.SerializerMethodField()
    area_label  = serializers.SerializerMethodField()
    action_label = serializers.SerializerMethodField()
    item        = serializers.SerializerMethodField()
    summary     = serializers.SerializerMethodField()
    changes     = serializers.SerializerMethodField()

    class Meta:
        model  = AuditLog
        fields = [
            "id", "created_at", "action_type",
            "actor", "actor_name", "actor_email",
            "target_model", "target_id",
            "before_state", "after_state", "metadata",
            "area", "area_label", "action_label", "item", "summary", "changes", "ip_address", "device",
        ]
        read_only_fields = fields

    def get_area(self, obj):
        return presentation.area_of(obj)

    def get_area_label(self, obj):
        return presentation.AREAS.get(presentation.area_of(obj), {}).get("label", "Other")

    def get_action_label(self, obj):
        return presentation.action_label(obj.action_type)

    def get_item(self, obj):
        return presentation.item_text(obj)

    def get_summary(self, obj):
        return presentation.summary(obj)

    def get_changes(self, obj):
        return presentation.changes(obj)

    def get_actor_name(self, obj):
        if not obj.actor:
            return "System"
        parts = [obj.actor.first_name, obj.actor.last_name]
        name  = " ".join(p for p in parts if p).strip()
        return name or obj.actor.email or str(obj.actor_id)

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None
