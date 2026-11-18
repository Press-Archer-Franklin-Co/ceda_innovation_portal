from apps.communications.models import NotificationPreference, NotificationTypePreference
from apps.core.constants import NotificationDeliveryChannel, NotificationType

CHANNEL_FIELDS = {
    NotificationDeliveryChannel.WEB: "web_enabled",
    NotificationDeliveryChannel.WHATSAPP: "whatsapp_enabled",
    NotificationDeliveryChannel.SMS: "sms_enabled",
    NotificationDeliveryChannel.EMAIL: "email_enabled",
}


class NotificationPreferenceSelector:
    @staticmethod
    def defaults_for(user) -> dict[str, bool]:
        """Channel defaults for a type with no saved row, taken from the older global preference."""
        legacy = NotificationPreference.objects.filter(user=user).first()
        return {
            NotificationDeliveryChannel.WEB.value: legacy.internal_enabled if legacy else True,
            NotificationDeliveryChannel.WHATSAPP.value: False,
            NotificationDeliveryChannel.SMS.value: legacy.sms_enabled if legacy else False,
            NotificationDeliveryChannel.EMAIL.value: legacy.email_enabled if legacy else True,
        }

    @staticmethod
    def for_user(user) -> dict[str, dict[str, bool]]:
        """Return ``{notification_type: {channel: bool}}`` for every notification type."""
        defaults = NotificationPreferenceSelector.defaults_for(user)
        saved = {row.notification_type: row for row in NotificationTypePreference.objects.filter(user=user)}
        result: dict[str, dict[str, bool]] = {}
        for notification_type in NotificationType.values:
            row = saved.get(notification_type)
            if row is None:
                result[notification_type] = dict(defaults)
            else:
                result[notification_type] = {channel.value: getattr(row, field) for channel, field in CHANNEL_FIELDS.items()}
        return result

    @staticmethod
    def is_enabled(user, notification_type: str, channel: str) -> bool:
        return bool(NotificationPreferenceSelector.for_user(user).get(notification_type, {}).get(channel, False))
