"""R-48 (3.39): one summary email a day, at 07:30, for people who turned on the daily summary."""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

MAX_LINES = 20


def summary_body(user, notifications) -> str:
    name = (user.first_name or "").strip() or "there"
    lines = [f"Hello {name},", "", f"Here is what came in since your last summary ({len(notifications)}):", ""]
    for item in notifications[:MAX_LINES]:
        lines.append(f"- {item.title}: {item.body}" if item.body else f"- {item.title}")
    if len(notifications) > MAX_LINES:
        lines.append(f"- and {len(notifications) - MAX_LINES} more in the portal.")
    lines += ["", "You can change this in Settings > Notifications."]
    return "\n".join(lines)


def send_daily_summaries(now=None) -> int:
    """Sends each person one email with their unread notifications since the last summary. Returns how many were sent."""
    from apps.communications.models import Notification, NotificationPreference
    from apps.communications.services import CommunicationService
    from apps.core.constants import CommunicationChannel

    now = now or timezone.now()
    sent = 0
    for preference in NotificationPreference.objects.filter(daily_summary=True, user__is_active=True).select_related("user"):
        user = preference.user
        since = preference.daily_summary_sent_at or (now - timedelta(days=1))
        items = list(Notification.objects.filter(recipient=user, is_read=False, created_at__gt=since, created_at__lte=now).order_by("-created_at"))
        preference.daily_summary_sent_at = now
        preference.save(update_fields=["daily_summary_sent_at", "updated_at"])
        if not items or not user.email:
            continue
        log = CommunicationService.log_communication(
            recipient=user, channel=CommunicationChannel.EMAIL, subject="Your daily summary from the CEDA Innovation Portal", body=summary_body(user, items)
        )
        CommunicationService._dispatch_or_enqueue(log)
        sent += 1
    return sent
