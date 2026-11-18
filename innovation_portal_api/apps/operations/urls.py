from django.urls import path

from apps.operations.views import (
    OperationsBottlenecksView,
    OperationsDashboardView,
    OperationsNotificationFailuresView,
    OperationsRemindersPreviewView,
    OperationsWorkflowThroughputView,
)

urlpatterns = [
    path("dashboard/", OperationsDashboardView.as_view(), name="operations-dashboard"),
    path("bottlenecks/", OperationsBottlenecksView.as_view(), name="operations-bottlenecks"),
    path("workflow-throughput/", OperationsWorkflowThroughputView.as_view(), name="operations-workflow-throughput"),
    path("notification-failures/", OperationsNotificationFailuresView.as_view(), name="operations-notification-failures"),
    path("reminders-preview/", OperationsRemindersPreviewView.as_view(), name="operations-reminders-preview"),
]
