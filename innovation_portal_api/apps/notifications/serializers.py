from rest_framework import serializers

from apps.communications.models import Notification
from apps.core.constants import NotificationDeliveryChannel, NotificationType


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ("id", "notification_type", "title", "body", "is_read", "created_at")


class NotificationMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    mark_all = serializers.BooleanField(default=False)


class SingleNotificationMarkReadSerializer(serializers.Serializer):
    pass


class NotificationPreferencesSerializer(serializers.Serializer):
    """``{"preferences": {"<type>": {"web": bool, "whatsapp": bool, "sms": bool, "email": bool}}}``.

    On PUT, types and channels that are left out keep their current value.
    """

    preferences = serializers.DictField(
        child=serializers.DictField(child=serializers.BooleanField()),
        allow_empty=False,
    )
    notification_types = serializers.SerializerMethodField(read_only=True)
    channels = serializers.SerializerMethodField(read_only=True)

    def get_notification_types(self, obj):
        return [{"code": value, "label": label} for value, label in NotificationType.choices]

    def get_channels(self, obj):
        return [{"code": value, "label": label} for value, label in NotificationDeliveryChannel.choices]

    def validate_preferences(self, value):
        errors = {}
        valid_channels = set(NotificationDeliveryChannel.values)
        for notification_type, channels in value.items():
            if notification_type not in NotificationType.values:
                errors[notification_type] = ["Unknown notification type."]
                continue
            unknown = sorted(set(channels) - valid_channels)
            if unknown:
                errors[notification_type] = [f"Unknown channel(s): {', '.join(unknown)}."]
        if errors:
            raise serializers.ValidationError(errors)
        return value
