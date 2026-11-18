from rest_framework import serializers

from apps.communications.models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "notification_type", "title", "body", "is_read", "created_at")


class NotificationMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    mark_all = serializers.BooleanField(default=False)


class SingleNotificationMarkReadSerializer(serializers.Serializer):
    pass
