from django.urls import path

from apps.documents.views import (
    DraftDocumentListCreateView,
    SubmissionDocumentDetailView,
    SubmissionDocumentDownloadView,
    SubmissionDocumentListCreateView,
)

urlpatterns = [
    path("<uuid:pk>/download/", SubmissionDocumentDownloadView.as_view(), name="document-download"),
    path("<uuid:pk>/", SubmissionDocumentDetailView.as_view(), name="document-detail"),
    path("drafts/<uuid:draft_id>/documents/", DraftDocumentListCreateView.as_view(), name="draft-documents"),
    path("submissions/<uuid:submission_id>/documents/", SubmissionDocumentListCreateView.as_view(), name="submission-documents"),
]
