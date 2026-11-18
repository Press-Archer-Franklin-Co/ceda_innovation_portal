from django.urls import path

from apps.notifications.views import (
    NotificationListView,
    NotificationDeliveryStatusView,
    NotificationMarkReadView,
    NotificationMarkSingleReadView,
    NotificationPreferencesView,
    NotificationRetryView,
    NotificationUnreadCountView,
)

urlpatterns = [
    path("", NotificationListView.as_view(), name="notifications-list"),
    path("mark-read/", NotificationMarkReadView.as_view(), name="notifications-mark-read"),
    path("preferences/", NotificationPreferencesView.as_view(), name="notifications-preferences"),
    path("unread-count/", NotificationUnreadCountView.as_view(), name="notifications-unread-count"),
    path("<uuid:notification_id>/mark-read/", NotificationMarkSingleReadView.as_view(), name="notifications-mark-single-read"),
    path("delivery-status/", NotificationDeliveryStatusView.as_view(), name="notifications-delivery-status"),
    path("<uuid:notification_id>/retry/", NotificationRetryView.as_view(), name="notifications-retry"),
]
