from django.urls import path

from apps.analytics.views import (
    AnalyticsBottlenecksView,
    ProgramFormResponseAnalyticsView,
    ProgramAnalyticsPipelineView,
    ProgramAnalyticsSummaryView,
    ReviewerPerformanceView,
)

urlpatterns = [
    path("programs/<uuid:program_id>/summary/", ProgramAnalyticsSummaryView.as_view(), name="analytics-program-summary"),
    path("programs/<uuid:program_id>/pipeline/", ProgramAnalyticsPipelineView.as_view(), name="analytics-program-pipeline"),
    path("programs/<uuid:program_id>/form-responses/", ProgramFormResponseAnalyticsView.as_view(), name="analytics-program-form-responses"),
    path("reviewer-performance/", ReviewerPerformanceView.as_view(), name="analytics-reviewer-performance"),
    path("bottlenecks/", AnalyticsBottlenecksView.as_view(), name="analytics-bottlenecks"),
]
