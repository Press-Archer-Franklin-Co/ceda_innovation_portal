from rest_framework import generics

from apps.communications.serializers import CommunicationLogSerializer
from apps.core.api import api_success
from apps.core.permissions import IsOfficerAdminOrManagementReadOnly
from apps.operations.services import OperationsService


class OperationsDashboardView(generics.GenericAPIView):
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def get(self, request, *args, **kwargs):
        return api_success(data=OperationsService.dashboard())


class OperationsBottlenecksView(generics.GenericAPIView):
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def get(self, request, *args, **kwargs):
        return api_success(data=OperationsService.bottlenecks())


class OperationsWorkflowThroughputView(generics.GenericAPIView):
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def get(self, request, *args, **kwargs):
        return api_success(data=OperationsService.workflow_throughput())


class OperationsNotificationFailuresView(generics.ListAPIView):
    permission_classes = [IsOfficerAdminOrManagementReadOnly]
    serializer_class = CommunicationLogSerializer

    def get_queryset(self):
        return OperationsService.notification_failures().order_by("-updated_at")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)


class OperationsRemindersPreviewView(generics.GenericAPIView):
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def get(self, request, *args, **kwargs):
        return api_success(data=OperationsService.reminders_preview())
