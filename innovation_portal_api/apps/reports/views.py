from rest_framework.response import Response
from rest_framework.views import APIView

from apps.reports.selectors import ReportSelector


class DashboardReportView(APIView):
    def get(self, request):
        return Response(ReportSelector.dashboard())


class SubmissionsReportView(APIView):
    def get(self, request):
        return Response(ReportSelector.submissions_report())


class JudgingReportView(APIView):
    def get(self, request):
        return Response(ReportSelector.judging_report())


class TurnaroundReportView(APIView):
    def get(self, request):
        return Response(ReportSelector.turnaround_report())


class CapabilityReportView(APIView):
    def get(self, request):
        return Response(ReportSelector.capability_report())
