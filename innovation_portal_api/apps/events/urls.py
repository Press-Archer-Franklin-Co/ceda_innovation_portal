from django.urls import path

from apps.events.views import EventCheckInView, EventListCreateView, EventSessionCreateView, PresentationSlotCreateView

urlpatterns = [
    path("", EventListCreateView.as_view(), name="events"),
    path("<uuid:event_id>/sessions/", EventSessionCreateView.as_view(), name="event-sessions"),
    path("<uuid:event_id>/slots/", PresentationSlotCreateView.as_view(), name="event-slots"),
    path("<uuid:event_id>/check-in/", EventCheckInView.as_view(), name="event-check-in"),
]
