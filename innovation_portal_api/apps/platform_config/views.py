from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from apps.core.api import api_success
from apps.core.permissions import AuthRateThrottle, HasCapability, IPRateThrottle
from apps.platform_config.models import FeatureFlag, IntegrationConnection
from apps.platform_config.providers import providers_for
from apps.platform_config.selectors import FeatureFlagSelector, IntegrationHistorySelector, IntegrationRuntimeSelector
from apps.platform_config.serializers import (
    FeatureFlagSerializer,
    FeatureFlagUpdateSerializer,
    IntegrationConnectionSerializer,
    IntegrationHistorySerializer,
    IntegrationTestSerializer,
    IntegrationWriteSerializer,
    PublicConfigSerializer,
    SSOTrialCompleteSerializer,
)
from apps.platform_config.services import FeatureFlagService, IntegrationService, SMSStatusService, SSOTrialService
from apps.platform_config.throttles import PlatformAdminThrottle, PlatformTestThrottle

KIND_PARAMETER = OpenApiParameter("kind", str, description="Filter by kind: sso or sms.", required=False, enum=["sso", "sms"])
TAGS = ["Platform settings"]


class _AdminView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("settings.manage")]
    throttle_classes = [PlatformAdminThrottle]


# --- Feature switches ----------------------------------------------------------------


@extend_schema(tags=TAGS, summary="List feature switches", responses={200: FeatureFlagSerializer(many=True)})
class FeatureFlagListView(_AdminView):
    serializer_class = FeatureFlagSerializer

    def get(self, request):
        return api_success(data=FeatureFlagSerializer(FeatureFlagSelector.all(), many=True).data)


@extend_schema(
    tags=TAGS,
    summary="Switch a feature on or off",
    description="Refused with code `staff_lockout` if staff would be left without a working way to sign in, and with `coming_soon` for locked features.",
    request=FeatureFlagUpdateSerializer,
    responses={200: FeatureFlagSerializer},
)
class FeatureFlagDetailView(_AdminView):
    serializer_class = FeatureFlagUpdateSerializer

    def patch(self, request, key):
        get_object_or_404(FeatureFlag, key=key)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        flag = FeatureFlagService.set_enabled(key=key, enabled=serializer.validated_data["enabled"], actor=request.user)
        return api_success(data=FeatureFlagSerializer(flag).data, message="Saved.")


@extend_schema(
    tags=TAGS,
    summary="Public portal configuration",
    description="Feature switches that are safe to show, and which sign-in options to offer. Contains no secrets.",
    responses={200: PublicConfigSerializer},
)
class PublicConfigView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPRateThrottle]
    serializer_class = PublicConfigSerializer

    def get(self, request):
        return api_success(data=FeatureFlagSelector.public_config())


# --- Providers and connections -------------------------------------------------------


@extend_schema(tags=TAGS, summary="List integration providers and their settings forms", parameters=[KIND_PARAMETER])
class ProviderListView(_AdminView):
    def get(self, request):
        return api_success(data=[provider.as_dict() for provider in providers_for(request.query_params.get("kind"))])


@extend_schema(
    tags=TAGS,
    summary="Which connection the system is using",
    description="For each kind, whether the running system uses a saved connection (`database`), environment variables (`environment`) or nothing (`none`).",
)
class IntegrationRuntimeView(_AdminView):
    def get(self, request):
        return api_success(data={kind: IntegrationRuntimeSelector.status(kind) for kind in ("sso", "sms")})


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="List integration connections", parameters=[KIND_PARAMETER], responses={200: IntegrationConnectionSerializer(many=True)}),
    post=extend_schema(
        tags=TAGS,
        summary="Add an integration connection",
        description="Saved as a draft. Secrets are encrypted and never returned.",
        request=IntegrationWriteSerializer,
        responses={201: IntegrationConnectionSerializer},
    ),
)
class IntegrationListCreateView(_AdminView):
    serializer_class = IntegrationWriteSerializer

    def get(self, request):
        queryset = IntegrationConnection.objects.select_related("activated_by", "created_by", "updated_by")
        kind = request.query_params.get("kind")
        if kind:
            queryset = queryset.filter(kind=kind)
        return api_success(data=IntegrationConnectionSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = IntegrationWriteSerializer(data=request.data, context={"creating": True})
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        connection, warnings = IntegrationService.create(
            actor=request.user,
            kind=data.get("kind"),
            provider=data["provider"],
            name=data.get("name", ""),
            config=data.get("config"),
            secrets=data.get("secrets"),
        )
        return api_success(data=IntegrationConnectionSerializer(connection).data, message="Saved as a draft.", status_code=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="Get an integration connection", responses={200: IntegrationConnectionSerializer}),
    patch=extend_schema(
        tags=TAGS,
        summary="Change an integration connection",
        description='Any change to a setting or secret moves the status back to draft and switches the connection off. Secrets: "" keeps, null clears.',
        request=IntegrationWriteSerializer,
        responses={200: IntegrationConnectionSerializer},
    ),
    delete=extend_schema(tags=TAGS, summary="Delete an integration connection", responses={204: None}),
)
class IntegrationDetailView(_AdminView):
    serializer_class = IntegrationWriteSerializer

    def _get(self, pk):
        return get_object_or_404(IntegrationConnection.objects.select_related("activated_by", "created_by", "updated_by"), pk=pk)

    def get(self, request, pk):
        return api_success(data=IntegrationConnectionSerializer(self._get(pk)).data)

    def patch(self, request, pk):
        connection = self._get(pk)
        serializer = IntegrationWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        connection, _ = IntegrationService.update(connection=connection, actor=request.user, data=serializer.validated_data)
        return api_success(data=IntegrationConnectionSerializer(connection).data, message="Saved.")

    def delete(self, request, pk):
        IntegrationService.delete(connection=self._get(pk), actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=TAGS,
    summary="Test an integration connection",
    description="Runs the provider's checks and returns each step. For SMS, enter a phone number to also send a test message.",
    request=IntegrationTestSerializer,
)
class IntegrationTestView(_AdminView):
    serializer_class = IntegrationTestSerializer
    throttle_classes = [PlatformTestThrottle]

    def post(self, request, pk):
        connection = get_object_or_404(IntegrationConnection, pk=pk)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = IntegrationService.run_test(connection=connection, actor=request.user, inputs=serializer.validated_data)
        connection.refresh_from_db()
        return api_success(data={"result": result, "connection": IntegrationConnectionSerializer(connection).data})


@extend_schema(
    tags=TAGS,
    summary="Activate an integration connection",
    description="Only after a test passed in the last 24 hours. Switches off the connection of the same kind that was active.",
    request=None,
    responses={200: IntegrationConnectionSerializer},
)
class IntegrationActivateView(_AdminView):
    def post(self, request, pk):
        connection = IntegrationService.activate(connection=get_object_or_404(IntegrationConnection, pk=pk), actor=request.user)
        return api_success(data=IntegrationConnectionSerializer(connection).data, message="Connection is now active.")


@extend_schema(
    tags=TAGS,
    summary="Switch off an integration connection",
    description="Refused with code `staff_lockout` if this is the last working way for staff to sign in.",
    request=None,
    responses={200: IntegrationConnectionSerializer},
)
class IntegrationDeactivateView(_AdminView):
    def post(self, request, pk):
        connection = IntegrationService.deactivate(connection=get_object_or_404(IntegrationConnection, pk=pk), actor=request.user)
        return api_success(data=IntegrationConnectionSerializer(connection).data, message="Connection switched off.")


@extend_schema(tags=TAGS, summary="Recent changes and tests for a connection", responses={200: IntegrationHistorySerializer(many=True)})
class IntegrationHistoryView(_AdminView):
    def get(self, request, pk):
        connection = get_object_or_404(IntegrationConnection, pk=pk)
        return api_success(data=IntegrationHistorySerializer(IntegrationHistorySelector.for_connection(connection), many=True).data)


@extend_schema(
    tags=TAGS,
    summary="Start a trial sign-in",
    description="Returns a provider URL with a trial state. Finishing it shows the claims received and whether the allow lists accept the person. It never creates a user or a session.",
    request=None,
)
class SSOTrialStartView(_AdminView):
    throttle_classes = [PlatformTestThrottle]

    def post(self, request, pk):
        connection = get_object_or_404(IntegrationConnection, pk=pk)
        return api_success(data=SSOTrialService.start(connection=connection, actor=request.user))


@extend_schema(
    tags=TAGS,
    summary="Finish a trial sign-in",
    description="Called by the portal's sign-in callback page with the provider's code and the trial state. Returns claims and the allow-list result only.",
    request=SSOTrialCompleteSerializer,
)
class SSOTrialCompleteView(generics.GenericAPIView):
    # The one-time trial state, created by an administrator, is the authorisation here.
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]
    serializer_class = SSOTrialCompleteSerializer

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data=SSOTrialService.complete(**serializer.validated_data))


@extend_schema(
    tags=TAGS,
    summary="SMS delivery receipt webhook",
    description="Called by the SMS provider. Twilio requests are checked with Twilio's signature; others need the delivery receipt secret as `?token=`.",
    request=None,
    responses={200: OpenApiResponse(description="Receipt processed."), 403: OpenApiResponse(description="Signature or token did not match.")},
)
class SMSStatusWebhookView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPRateThrottle]

    def post(self, request, pk):
        connection = get_object_or_404(IntegrationConnection, pk=pk)
        updated = SMSStatusService.handle(connection=connection, request=request)
        return Response({"updated": updated}, status=status.HTTP_200_OK)
