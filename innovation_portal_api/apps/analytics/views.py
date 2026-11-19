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
