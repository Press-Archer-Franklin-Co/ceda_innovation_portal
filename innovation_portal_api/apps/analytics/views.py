from rest_framework import generics

from apps.analytics.services import AnalyticsService
from apps.core.api import api_success
from apps.core.permissions import HasCapability
from apps.programs.models import Program


class ProgramAnalyticsSummaryView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("analytics.view")]

    def get(self, request, program_id, *args, **kwargs):
        program = Program.objects.get(id=program_id)
        return api_success(data=AnalyticsService.program_summary(program))


class ProgramAnalyticsPipelineView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("analytics.view")]

    def get(self, request, program_id, *args, **kwargs):
        program = Program.objects.get(id=program_id)
        return api_success(data=AnalyticsService.pipeline(program))


class ProgramFormResponseAnalyticsView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("analytics.view")]

    def get(self, request, program_id, *args, **kwargs):
        program = Program.objects.get(id=program_id)
        return api_success(data=AnalyticsService.form_response_analytics(program, params=request.query_params))


class ReviewerPerformanceView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("analytics.view")]

    def get(self, request, *args, **kwargs):
        return api_success(data=AnalyticsService.reviewer_performance())


class AnalyticsBottlenecksView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("analytics.view")]

    def get(self, request, *args, **kwargs):
        return api_success(data=AnalyticsService.bottlenecks())


# --- B7: dashboard and reports ------------------------------------------------------------------

from django.http import FileResponse  # noqa: E402
from django.shortcuts import get_object_or_404  # noqa: E402
from drf_spectacular.types import OpenApiTypes  # noqa: E402
from drf_spectacular.utils import OpenApiParameter, extend_schema  # noqa: E402
from rest_framework import serializers as drf_serializers  # noqa: E402
from rest_framework import status as http_status  # noqa: E402
from rest_framework.views import APIView  # noqa: E402

from apps.analytics import dashboard  # noqa: E402
from apps.core.api import api_success  # noqa: E402
from apps.core.permissions import HasCapability as _HasCapability  # noqa: E402

FILTER_PARAMS = [
    OpenApiParameter("from", OpenApiTypes.DATE),
    OpenApiParameter("to", OpenApiTypes.DATE),
    OpenApiParameter("program", OpenApiTypes.STR, description="Programme id or slug"),
    OpenApiParameter("sector", OpenApiTypes.STR, description="Sector id or slug"),
    OpenApiParameter("district", OpenApiTypes.STR, description="District id or slug"),
    OpenApiParameter("channel", OpenApiTypes.STR, enum=["web", "whatsapp", "ussd", "office"]),
]
B7_TAGS = ["Analytics"]
DASHBOARD_PERMISSION = [_HasCapability.of("dashboard.view")]


class _DashboardView(APIView):
    permission_classes = DASHBOARD_PERMISSION
    report = ""

    def get(self, request):
        filters = dashboard.parse_filters(request.query_params)
        data = dashboard.REPORTS[self.report](filters, request.user)
        return api_success(data={**data, "filters": filters.as_dict()})


@extend_schema(tags=B7_TAGS, summary="Headline numbers (3.1)", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class KpiView(_DashboardView):
    report = "kpis"


@extend_schema(tags=B7_TAGS, summary="Ideas submitted per week or month, zero-filled", parameters=[*FILTER_PARAMS, OpenApiParameter("interval", OpenApiTypes.STR, enum=["week", "month"])], responses=OpenApiTypes.OBJECT)
class SubmissionsSeriesView(_DashboardView):
    def get(self, request):
        filters = dashboard.parse_filters(request.query_params)
        data = dashboard.series(filters, request.query_params.get("interval", "week"))
        return api_success(data={**data, "filters": filters.as_dict()})


@extend_schema(tags=B7_TAGS, summary="Ideas per stage, with the bottleneck (most waiting over 7 days)", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class PipelineView(_DashboardView):
    report = "pipeline"


@extend_schema(tags=B7_TAGS, summary="Funnel: submitted, passed check, reviewed, panel, supported, funded", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class FunnelView(_DashboardView):
    report = "funnel"


@extend_schema(tags=B7_TAGS, summary="Ideas by channel and the top 5 districts", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class SourcesView(_DashboardView):
    report = "sources"


@extend_schema(tags=B7_TAGS, summary="Ideas per sector", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class SectorsView(_DashboardView):
    report = "sectors"


@extend_schema(tags=B7_TAGS, summary="Youth, women and rural reach", parameters=FILTER_PARAMS, responses=OpenApiTypes.OBJECT)
class InclusionView(_DashboardView):
    report = "inclusion"


class ExportRequestSerializer(drf_serializers.Serializer):
    report = drf_serializers.ChoiceField(choices=["kpis", "series", "pipeline", "funnel", "sources", "sectors", "inclusion", "all"])
    format = drf_serializers.ChoiceField(choices=["csv", "pdf"])
    filters = drf_serializers.DictField(required=False, help_text="{from, to, program, sector, district, channel}")


def _export_payload(export, request) -> dict:
    url = request.build_absolute_uri(f"/api/analytics/exports/{export.id}/download/") if export.status == "ready" else None
    return {"id": str(export.id), "report": export.report, "format": export.format, "status": export.status, "download_url": url, "error": export.error or None, "created_at": export.created_at.isoformat()}


class ExportCreateView(APIView):
    permission_classes = [_HasCapability.of("reports.export")]

    @extend_schema(tags=B7_TAGS, summary="Ask for a CSV or PDF of the numbers (made in the background)", request=ExportRequestSerializer, responses={202: OpenApiTypes.OBJECT})
    def post(self, request):
        from apps.analytics.exports import request_export

        serializer = ExportRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        export = request_export(user=request.user, report=data["report"], fmt=data["format"], filters=data.get("filters") or {})
        return api_success(data=_export_payload(export, request), message="Making your file.", status_code=http_status.HTTP_202_ACCEPTED)


class ExportDetailView(APIView):
    permission_classes = [_HasCapability.of("reports.export")]

    @extend_schema(tags=B7_TAGS, summary="Status of an export and its download link when ready", responses=OpenApiTypes.OBJECT)
    def get(self, request, export_id):
        from apps.analytics.models import AnalyticsExport

        export = get_object_or_404(AnalyticsExport, id=export_id, requested_by=request.user)
        return api_success(data=_export_payload(export, request))


class ExportDownloadView(APIView):
    permission_classes = [_HasCapability.of("reports.export")]

    @extend_schema(tags=B7_TAGS, summary="Download a finished export", responses={(200, "application/octet-stream"): OpenApiTypes.BINARY})
    def get(self, request, export_id):
        from apps.analytics.models import AnalyticsExport

        export = get_object_or_404(AnalyticsExport, id=export_id, requested_by=request.user, status=AnalyticsExport.Status.READY)
        content_type = "text/csv" if export.format == "csv" else "application/pdf"
        return FileResponse(export.file.open("rb"), as_attachment=True, filename=export.file.name.rsplit("/", 1)[-1], content_type=content_type)
