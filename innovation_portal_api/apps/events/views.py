from rest_framework import generics, status
from rest_framework.response import Response

from apps.core.permissions import IsOfficerAdminOrManagementReadOnly
from apps.events.models import AttendanceRecord, CheckInLog, Event, EventSession, PresentationSlot
from apps.events.serializers import CheckInSerializer, EventSerializer, EventSessionSerializer, PresentationSlotSerializer


class EventListCreateView(generics.ListCreateAPIView):
    queryset = Event.objects.all()
    serializer_class = EventSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]


class EventSessionCreateView(generics.CreateAPIView):
    serializer_class = EventSessionSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def perform_create(self, serializer):
        serializer.save(event_id=self.kwargs["event_id"])


class PresentationSlotCreateView(generics.CreateAPIView):
    serializer_class = PresentationSlotSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def perform_create(self, serializer):
        serializer.save()


class EventCheckInView(generics.GenericAPIView):
    serializer_class = CheckInSerializer
    permission_classes = [IsOfficerAdminOrManagementReadOnly]

    def post(self, request, event_id):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        attendance = AttendanceRecord.objects.get(id=serializer.validated_data["attendance_id"], event_id=event_id)
        checkin = CheckInLog.objects.create(attendance=attendance, checked_in_by=request.user)
        return Response({"id": str(checkin.id)}, status=status.HTTP_201_CREATED)
