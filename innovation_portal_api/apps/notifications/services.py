from apps.communications.models import Notification
from apps.communications.services import CommunicationService
from apps.core.constants import CommunicationChannel


class NotificationService:
    @staticmethod
    def notify(*, user, notification_type: str, message: str, title: str = "", send_email: bool = False):
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
