from rest_framework import serializers

from apps.audit.models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    actor_name  = serializers.SerializerMethodField()
    actor_email = serializers.SerializerMethodField()

    class Meta:
        model  = AuditLog
        fields = [
            "id", "created_at", "action_type",
            "actor", "actor_name", "actor_email",
            "target_model", "target_id",
            "before_state", "after_state", "metadata",
        ]

    def get_actor_name(self, obj):
        if not obj.actor:
            return "System"
        parts = [obj.actor.first_name, obj.actor.last_name]
        name  = " ".join(p for p in parts if p).strip()
        return name or obj.actor.email or str(obj.actor_id)

    def get_actor_email(self, obj):
        return obj.actor.email if obj.actor else None
