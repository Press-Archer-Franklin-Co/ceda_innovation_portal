from django.urls import path

from apps.reports.views import CapabilityReportView, DashboardReportView, JudgingReportView, SubmissionsReportView, TurnaroundReportView

urlpatterns = [
    path("dashboard/", DashboardReportView.as_view(), name="reports-dashboard"),
    path("submissions/", SubmissionsReportView.as_view(), name="reports-submissions"),
    path("judging/", JudgingReportView.as_view(), name="reports-judging"),
    path("turnaround/", TurnaroundReportView.as_view(), name="reports-turnaround"),
    path("capability/", CapabilityReportView.as_view(), name="reports-capability"),
]
