from drf_spectacular.utils import OpenApiExample, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.communications.models import CommunicationLog
from apps.communications.serializers import CommunicationLogSerializer
from apps.communications.services import CommunicationService
from apps.core.api import api_success
from apps.communications.models import Notification
from apps.notifications.selectors import NotificationPreferenceSelector
from apps.notifications.serializers import NotificationMarkReadSerializer, NotificationPreferencesSerializer, NotificationSerializer
from apps.notifications.services import NotificationPreferenceService


class NotificationListView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationSerializer

    def get_queryset(self):
        from apps.notifications.serializers import CATEGORIES, category_filter

        queryset = Notification.objects.filter(recipient=self.request.user).order_by("-created_at")
        category = self.request.query_params.get("category")
        if category:
            if category not in CATEGORIES:
                from rest_framework.exceptions import ValidationError

                raise ValidationError({"category": f"Use one of: {', '.join(CATEGORIES)}."})
            queryset = queryset.filter(category_filter(category))
        return queryset

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)


class NotificationMarkReadView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationMarkReadSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        queryset = Notification.objects.filter(recipient=request.user)
        if serializer.validated_data.get("mark_all"):
            updated = queryset.update(is_read=True)
        else:
            ids = serializer.validated_data.get("ids", [])
            updated = queryset.filter(id__in=ids).update(is_read=True)
        return api_success(data={"updated": updated}, status_code=status.HTTP_200_OK)


class NotificationUnreadCountView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        count = Notification.objects.filter(recipient=request.user, is_read=False).count()
        return api_success(data={"unread_count": count})


class NotificationMarkSingleReadView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id, *args, **kwargs):
        updated = Notification.objects.filter(id=notification_id, recipient=request.user, is_read=False).update(is_read=True)
        if not updated:
            return Response({"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
        return api_success(data={"updated": updated}, status_code=status.HTTP_200_OK)


class NotificationDeliveryStatusView(generics.ListAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = CommunicationLogSerializer

    def get_queryset(self):
        return CommunicationLog.objects.filter(notification__recipient=self.request.user).order_by("-created_at")

    def list(self, request, *args, **kwargs):
        serializer = self.get_serializer(self.get_queryset(), many=True)
        return api_success(data=serializer.data)


class NotificationRetryView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, notification_id, *args, **kwargs):
        notification = Notification.objects.filter(id=notification_id, recipient=request.user).first()
        if not notification:
            return Response({"detail": "Notification not found."}, status=status.HTTP_404_NOT_FOUND)
        log = notification.delivery_logs.order_by("-created_at").first()
        if not log:
            return Response({"detail": "No outbound delivery exists for this notification."}, status=status.HTTP_400_BAD_REQUEST)
        CommunicationService.retry_log(str(log.id))
        return api_success(data={"notification_id": str(notification.id), "communication_log_id": str(log.id)})


@extend_schema_view(
    get=extend_schema(
        tags=["Notifications"],
        summary="Get my notification preferences",
        description="Returns, for each notification type, which channels (web, whatsapp, sms, email) are switched on.",
        responses={200: NotificationPreferencesSerializer},
    ),
    put=extend_schema(
        tags=["Notifications"],
        summary="Update my notification preferences",
        description="Switch channels on or off per notification type. Types and channels left out keep their current value.",
        request=NotificationPreferencesSerializer,
        responses={200: NotificationPreferencesSerializer},
        examples=[
            OpenApiExample(
                "Turn on WhatsApp for officer messages",
                value={"preferences": {"officer_message": {"whatsapp": True, "sms": False}}},
                request_only=True,
            )
        ],
    ),
)
class NotificationPreferencesView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = NotificationPreferencesSerializer

    def _payload(self, preferences):
        return NotificationPreferencesSerializer({"preferences": preferences}).data

    def get(self, request, *args, **kwargs):
        return api_success(data=self._payload(NotificationPreferenceSelector.for_user(request.user)))

    def put(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        preferences = NotificationPreferenceService.update_preferences(
            user=request.user,
            preferences=serializer.validated_data["preferences"],
        )
        return api_success(data=self._payload(preferences), message="Notification preferences saved.")
