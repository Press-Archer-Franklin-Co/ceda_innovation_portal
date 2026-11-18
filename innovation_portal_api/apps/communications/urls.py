from django.urls import path

from apps.communications.views import CommunicationLogListView, SendCommunicationView, SubmissionCommunicationListView

urlpatterns = [
    path("send/", SendCommunicationView.as_view(), name="send-communication"),
    path("logs/", CommunicationLogListView.as_view(), name="communication-logs"),
    path("submissions/<uuid:submission_id>/communications/", SubmissionCommunicationListView.as_view(), name="submission-communications"),
]
