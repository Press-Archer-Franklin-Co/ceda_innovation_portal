from django.urls import path

from apps.audit.views import (
    AssignmentAuditLogListView,
    AuditLogListView,
    EvaluationAuditLogListView,
    NotificationAuditLogListView,
    SubmissionAuditLogListView,
    WorkflowAuditLogListView,
)

urlpatterns = [
    path("logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("workflows/", WorkflowAuditLogListView.as_view(), name="audit-workflows"),
    path("assignments/", AssignmentAuditLogListView.as_view(), name="audit-assignments"),
    path("evaluations/", EvaluationAuditLogListView.as_view(), name="audit-evaluations"),
    path("notifications/", NotificationAuditLogListView.as_view(), name="audit-notifications"),
    path("submissions/<uuid:submission_id>/audit/", SubmissionAuditLogListView.as_view(), name="submission-audit"),
]
