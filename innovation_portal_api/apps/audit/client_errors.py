"""U11C (Figma 1.14): when a public page breaks, the browser reports it here with the reference it shows
the person ("ERR-7F3A2C"). It goes into the audit log, so staff can find it by searching for the reference."""

import re

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.permissions import IPRateThrottle

REFERENCE = re.compile(r"^ERR-[0-9A-F]{6}$")


class ClientErrorSerializer(serializers.Serializer):
    reference = serializers.RegexField(REFERENCE)
    path = serializers.CharField(max_length=300)
    message = serializers.CharField(max_length=500, allow_blank=True, required=False, default="")


class ClientErrorView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPRateThrottle]

    @extend_schema(
        tags=["Audit"],
        summary="Report a page that broke in the browser",
        description="Body: {reference: 'ERR-' + 6 hex characters, path, message}. Saved in the audit log as "
        "client_error with the reference as its target id, so staff can search for it.",
        request=ClientErrorSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        serializer = ClientErrorSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        AuditService.log_raw_action(
            actor=None,
            action_type="client_error",
            target_model="ClientError",
            target_id=data["reference"],
            metadata={"path": data["path"], "message": data["message"], "user_agent": request.META.get("HTTP_USER_AGENT", "")[:200]},
        )
        return api_success(data={"reference": data["reference"]}, message="Reported.", status_code=status.HTTP_201_CREATED)
