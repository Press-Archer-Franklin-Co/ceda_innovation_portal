from django.urls import path

from apps.tracking.views import SubmissionTrackingView

urlpatterns = [
    path("<str:reference_number>/", SubmissionTrackingView.as_view(), name="submission-tracking"),
]
