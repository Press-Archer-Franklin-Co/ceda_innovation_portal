from django.db import transaction

from apps.audit.services import AuditService
from apps.communications.models import Notification, NotificationTypePreference
from apps.communications.services import CommunicationService
from apps.core.constants import CommunicationChannel
from apps.notifications.selectors import CHANNEL_FIELDS, NotificationPreferenceSelector


class NotificationService:
    @staticmethod
    def notify(*, user, notification_type: str, message: str, title: str = "", send_email: bool = False):
        if user is None:
            # Guest submissions have no account to notify; they get text messages instead.
            return None
        notification = Notification.objects.filter(
            recipient=user,
            notification_type=notification_type,
            title=title or notification_type.replace("_", " ").title(),
            body=message,
            is_read=False,
        ).order_by("-created_at").first()
        if not notification:
            notification = Notification.objects.create(
                recipient=user,
                notification_type=notification_type,
                title=title or notification_type.replace("_", " ").title(),
                body=message,
            )
        if send_email and user.email:
            log = CommunicationService.log_communication(
                recipient=user,
                notification=notification,
                channel=CommunicationChannel.EMAIL,
                body=message,
                subject=notification.title,
                sent_by=None,
            )
            CommunicationService._dispatch_or_enqueue(log)
        return notification


class NotificationPreferenceService:
    @staticmethod
    @transaction.atomic
    def update_preferences(*, user, preferences: dict[str, dict[str, bool]]) -> dict[str, dict[str, bool]]:
        """Save channel switches per notification type. Types and channels left out keep their value."""
        current = NotificationPreferenceSelector.for_user(user)
        before = {key: dict(value) for key, value in current.items()}
        for notification_type, channels in preferences.items():
            merged = {**current[notification_type], **channels}
            NotificationTypePreference.objects.update_or_create(
                user=user,
                notification_type=notification_type,
                defaults={CHANNEL_FIELDS[channel]: merged[channel.value] for channel in CHANNEL_FIELDS},
            )
        after = NotificationPreferenceSelector.for_user(user)
        AuditService.log_action(
            actor=user,
            action_type="notification_preferences_updated",
            target=user,
            before_state={"preferences": before},
            after_state={"preferences": after},
        )
        return after
