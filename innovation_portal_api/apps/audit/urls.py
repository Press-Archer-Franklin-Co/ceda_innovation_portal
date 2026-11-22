from django.urls import path

from apps.audit.client_errors import ClientErrorView
from apps.audit.views import (
    AssignmentAuditLogListView,
    AuditLogExportView,
    AuditLogListView,
    EvaluationAuditLogListView,
    NotificationAuditLogListView,
    SubmissionAuditLogListView,
    WorkflowAuditLogListView,
)

urlpatterns = [
    path("client-errors/", ClientErrorView.as_view(), name="audit-client-errors"),
    path("logs/", AuditLogListView.as_view(), name="audit-logs"),
    path("logs/export/", AuditLogExportView.as_view(), name="audit-logs-export"),
    path("workflows/", WorkflowAuditLogListView.as_view(), name="audit-workflows"),
    path("assignments/", AssignmentAuditLogListView.as_view(), name="audit-assignments"),
    path("evaluations/", EvaluationAuditLogListView.as_view(), name="audit-evaluations"),
    path("notifications/", NotificationAuditLogListView.as_view(), name="audit-notifications"),
    path("submissions/<uuid:submission_id>/audit/", SubmissionAuditLogListView.as_view(), name="submission-audit"),
]
