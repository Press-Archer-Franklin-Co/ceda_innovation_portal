from django.urls import path

from apps.analytics.views import (
    ChatReportView,
    ExportCreateView,
    ExportDetailView,
    ExportDownloadView,
    FunnelView,
    InclusionView,
    KpiView,
    PipelineView,
    SectorsView,
    SourcesView,
    SubmissionsSeriesView,
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
    path("kpis/", KpiView.as_view(), name="analytics-kpis"),
    path("submissions-series/", SubmissionsSeriesView.as_view(), name="analytics-submissions-series"),
    path("pipeline/", PipelineView.as_view(), name="analytics-pipeline"),
    path("funnel/", FunnelView.as_view(), name="analytics-funnel"),
    path("sources/", SourcesView.as_view(), name="analytics-sources"),
    path("sectors/", SectorsView.as_view(), name="analytics-sectors"),
    path("inclusion/", InclusionView.as_view(), name="analytics-inclusion"),
    path("chat/", ChatReportView.as_view(), name="analytics-chat"),
    path("exports/", ExportCreateView.as_view(), name="analytics-exports"),
    path("exports/<uuid:export_id>/", ExportDetailView.as_view(), name="analytics-export-detail"),
    path("exports/<uuid:export_id>/download/", ExportDownloadView.as_view(), name="analytics-export-download"),
]
