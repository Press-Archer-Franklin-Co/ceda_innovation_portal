from __future__ import annotations

from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.channels.models import ChannelConnection, Journey, JourneyNode, JourneySession
from apps.channels.nodes import NODE_TYPES
from apps.channels.selectors import ActivityReportSelector, ChannelConnectionSelector, JourneySelector, SessionSelector
from apps.channels.serializers import (
    ChannelConnectionCreateSerializer,
    ChannelConnectionSerializer,
    ChannelConnectionUpdateSerializer,
    ConnectionTestSerializer,
    JourneyDetailSerializer,
    JourneyListSerializer,
    JourneyNodeSerializer,
    JourneyNodesReplaceSerializer,
    JourneyNodeWriteSerializer,
    JourneySessionDetailSerializer,
    JourneySessionSerializer,
    JourneyVersionSerializer,
    JourneyWriteSerializer,
    SimulateRequestSerializer,
    SimulateResponseSerializer,
    ValidationResultSerializer,
)
from apps.channels.services import (
    ChannelConnectionService,
    ChannelStatus,
    JourneyService,
    SimulatorService,
    USSDWebhookService,
    WhatsAppWebhookService,
)
from apps.channels.throttles import ChannelAdminThrottle, ChannelPublicThrottle, ChannelTestThrottle, ChannelWebhookThrottle
from apps.core.api import api_success
from apps.core.permissions import HasCapability

TAGS = ["Channels (WhatsApp and USSD)"]
WEBHOOK_TAGS = ["Channels webhooks"]
MAX_PAGE_SIZE = 100


class _ChannelsAdminView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("channels.manage")]
    throttle_classes = [ChannelAdminThrottle]


def _page(request, queryset, serializer_class):
    try:
        page = max(1, int(request.query_params.get("page") or 1))
        size = min(MAX_PAGE_SIZE, max(1, int(request.query_params.get("page_size") or 25)))
    except ValueError:
        page, size = 1, 25
    count = queryset.count()
    rows = queryset[(page - 1) * size : page * size]
    return {"count": count, "page": page, "page_size": size, "results": serializer_class(rows, many=True).data}


# --- Overview ------------------------------------------------------------------------


@extend_schema(tags=TAGS, summary="Whether USSD and WhatsApp are live", description="Live means the switch is on and at least one connection is active. `waiting_for_provider` means no connection is active yet.")
class ChannelStatusView(_ChannelsAdminView):
    def get(self, request):
        return api_success(data=ChannelStatus.summary())


@extend_schema(tags=TAGS, summary="Public: which channels people can use", description="Only live channels, with their short codes or numbers. Contains no settings or secrets.")
class PublicChannelsView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ChannelPublicThrottle]

    def get(self, request):
        data = {}
        for channel in ("ussd", "whatsapp"):
            live = ChannelStatus.is_live(channel)
            addresses = []
            if live:
                addresses = sorted(
                    {c.address for c in ChannelConnection.objects.filter(connection__kind=channel, connection__is_active=True).exclude(address="")}
                )
            data[channel] = {"live": live, "addresses": addresses}
        return api_success(data=data)


@extend_schema(tags=TAGS, summary="Step types for the journey builder palette")
class NodeTypesView(_ChannelsAdminView):
    def get(self, request):
        return api_success(data=list(NODE_TYPES))


@extend_schema(tags=TAGS, summary="USSD presets and the providers for each channel")
class ProvidersView(_ChannelsAdminView):
    def get(self, request):
        from apps.platform_config.providers import providers_for
        from apps.platform_config.providers.ussd import BaseUSSDProvider

        return api_success(
            data={
                "ussd": [p.as_dict() for p in providers_for("ussd")],
                "whatsapp": [p.as_dict() for p in providers_for("whatsapp")],
                "ussd_presets": BaseUSSDProvider.presets(),
            }
        )


# --- Journeys ------------------------------------------------------------------------


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="List journeys", responses={200: JourneyListSerializer(many=True)}),
    post=extend_schema(tags=TAGS, summary="Create a journey", request=JourneyWriteSerializer, responses={201: JourneyDetailSerializer}),
)
class JourneyListCreateView(_ChannelsAdminView):
    serializer_class = JourneyWriteSerializer

    def get(self, request):
        queryset = JourneySelector.all()
        if request.query_params.get("channel"):
            queryset = queryset.filter(channel__in=[request.query_params["channel"], "both"])
        return api_success(data=JourneyListSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = JourneyWriteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        journey = JourneyService.create(actor=request.user, data={**serializer.validated_data, "nodes": request.data.get("nodes") or []})
        return api_success(data=JourneyDetailSerializer(journey).data, message="Journey created.", status_code=status.HTTP_201_CREATED)


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="A journey with its steps", responses={200: JourneyDetailSerializer}),
    patch=extend_schema(tags=TAGS, summary="Change a journey's name, channel, language or start step", request=JourneyWriteSerializer, responses={200: JourneyDetailSerializer}),
    delete=extend_schema(tags=TAGS, summary="Delete a journey", description="Refused while an active connection runs it.", responses={204: None}),
)
class JourneyDetailView(_ChannelsAdminView):
    serializer_class = JourneyWriteSerializer

    def get_object(self):
        return get_object_or_404(Journey.objects.prefetch_related("nodes"), pk=self.kwargs["pk"])

    def get(self, request, pk):
        return api_success(data=JourneyDetailSerializer(self.get_object()).data)

    def patch(self, request, pk):
        journey = self.get_object()
        serializer = JourneyWriteSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = {k: v for k, v in serializer.validated_data.items() if k != "nodes"}
        journey = JourneyService.update(journey=journey, actor=request.user, data=data)
        return api_success(data=JourneyDetailSerializer(self.get_object()).data, message="Saved.")

    def delete(self, request, pk):
        JourneyService.delete(journey=self.get_object(), actor=request.user)
        return api_success(data=None, message="Journey deleted.", status_code=status.HTTP_204_NO_CONTENT)


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="List a journey's steps", responses={200: JourneyNodeSerializer(many=True)}),
    post=extend_schema(tags=TAGS, summary="Add a step", request=JourneyNodeWriteSerializer, responses={201: JourneyNodeSerializer}),
    put=extend_schema(tags=TAGS, summary="Save the whole canvas", description="Replaces every step. Steps not in the list are removed.", request=JourneyNodesReplaceSerializer, responses={200: JourneyDetailSerializer}),
)
class JourneyNodesView(_ChannelsAdminView):
    serializer_class = JourneyNodeWriteSerializer

    def journey(self):
        return get_object_or_404(Journey, pk=self.kwargs["pk"])

    def get(self, request, pk):
        return api_success(data=JourneyNodeSerializer(self.journey().nodes.all(), many=True).data)

    def post(self, request, pk):
        JourneyNodeWriteSerializer(data=request.data).is_valid(raise_exception=True)
        node = JourneyService.add_node(journey=self.journey(), actor=request.user, data=request.data)
        return api_success(data=JourneyNodeSerializer(node).data, message="Step added.", status_code=status.HTTP_201_CREATED)

    def put(self, request, pk):
        JourneyNodesReplaceSerializer(data=request.data).is_valid(raise_exception=True)
        journey = JourneyService.replace_nodes(journey=self.journey(), actor=request.user, nodes=request.data.get("nodes"), start_key=request.data.get("start_key"))
        journey = Journey.objects.prefetch_related("nodes").get(pk=journey.pk)
        return api_success(data=JourneyDetailSerializer(journey).data, message="Saved.")


@extend_schema_view(
    patch=extend_schema(tags=TAGS, summary="Change a step", request=JourneyNodeWriteSerializer, responses={200: JourneyNodeSerializer}),
    delete=extend_schema(tags=TAGS, summary="Remove a step", responses={204: None}),
)
class JourneyNodeDetailView(_ChannelsAdminView):
    serializer_class = JourneyNodeWriteSerializer

    def get_object(self):
        return get_object_or_404(JourneyNode.objects.select_related("journey"), journey_id=self.kwargs["pk"], key=self.kwargs["key"])

    def patch(self, request, pk, key):
        JourneyNodeWriteSerializer(data=request.data, partial=True).is_valid(raise_exception=True)
        node = JourneyService.update_node(node=self.get_object(), actor=request.user, data=request.data)
        return api_success(data=JourneyNodeSerializer(node).data, message="Saved.")

    def delete(self, request, pk, key):
        JourneyService.delete_node(node=self.get_object(), actor=request.user)
        return api_success(data=None, message="Step removed.", status_code=status.HTTP_204_NO_CONTENT)


@extend_schema(tags=TAGS, summary="Check a journey before publishing", request=None, responses={200: ValidationResultSerializer})
class JourneyValidateView(_ChannelsAdminView):
    def post(self, request, pk):
        problems = JourneyService.validate(get_object_or_404(Journey, pk=pk))
        return api_success(data={"ok": not any(p["level"] == "error" for p in problems), "problems": problems})


@extend_schema(
    tags=TAGS,
    summary="Publish a journey",
    description="Freezes the steps as a new version. Refused with code `journey_has_problems` and the list of problems. Sessions already running keep their version.",
    request=None,
    responses={200: JourneyVersionSerializer, 400: OpenApiResponse(description="Problems to fix")},
)
class JourneyPublishView(_ChannelsAdminView):
    def post(self, request, pk):
        version = JourneyService.publish(journey=get_object_or_404(Journey, pk=pk), actor=request.user)
        return api_success(data=JourneyVersionSerializer(version).data, message=f"Published as version {version.number}.")


@extend_schema(tags=TAGS, summary="Published versions of a journey", responses={200: JourneyVersionSerializer(many=True)})
class JourneyVersionsView(_ChannelsAdminView):
    def get(self, request, pk):
        journey = get_object_or_404(Journey, pk=pk)
        return api_success(data=JourneyVersionSerializer(journey.versions.select_related("published_by").all(), many=True).data)


# --- Connections ---------------------------------------------------------------------

CONNECTION_KIND = OpenApiParameter("kind", str, required=False, enum=["ussd", "whatsapp"])


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="List USSD and WhatsApp connections", parameters=[CONNECTION_KIND], responses={200: ChannelConnectionSerializer(many=True)}),
    post=extend_schema(
        tags=TAGS,
        summary="Add a connection (for example a USSD operator from a preset)",
        description="Secrets are stored encrypted and never returned. A new connection is a draft until it is tested and activated.",
        request=ChannelConnectionCreateSerializer,
        responses={201: ChannelConnectionSerializer},
    ),
)
class ChannelConnectionListCreateView(_ChannelsAdminView):
    serializer_class = ChannelConnectionCreateSerializer

    def get(self, request):
        queryset = ChannelConnectionSelector.all(request.query_params.get("kind"))
        return api_success(data=ChannelConnectionSerializer(queryset, many=True).data)

    def post(self, request):
        serializer = ChannelConnectionCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        channel_connection, warnings = ChannelConnectionService.create(
            actor=request.user,
            kind=data["kind"],
            provider=data["provider"],
            name=data["name"],
            preset=data.get("preset") or "",
            config=data.get("config") or {},
            secrets=data.get("secrets") or {},
            address=data.get("address") or "",
            journey=data.get("journey"),
        )
        return api_success(data={**ChannelConnectionSerializer(channel_connection).data, "warnings": warnings}, message="Connection added.", status_code=status.HTTP_201_CREATED)


class _ConnectionView(_ChannelsAdminView):
    def get_object(self):
        return get_object_or_404(ChannelConnection.objects.select_related("connection", "journey"), pk=self.kwargs["pk"])


@extend_schema_view(
    get=extend_schema(tags=TAGS, summary="A connection", responses={200: ChannelConnectionSerializer}),
    patch=extend_schema(tags=TAGS, summary="Change a connection", description="Changing settings or secrets turns the connection off until it is tested again.", request=ChannelConnectionUpdateSerializer, responses={200: ChannelConnectionSerializer}),
    delete=extend_schema(tags=TAGS, summary="Delete a connection", responses={204: None}),
)
class ChannelConnectionDetailView(_ConnectionView):
    serializer_class = ChannelConnectionUpdateSerializer

    def get(self, request, pk):
        return api_success(data=ChannelConnectionSerializer(self.get_object()).data)

    def patch(self, request, pk):
        serializer = ChannelConnectionUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        if "secrets" in request.data:
            data["secrets"] = request.data["secrets"]
        channel_connection, warnings = ChannelConnectionService.update(channel_connection=self.get_object(), actor=request.user, data=data)
        return api_success(data={**ChannelConnectionSerializer(channel_connection).data, "warnings": warnings}, message="Saved.")

    def delete(self, request, pk):
        from apps.platform_config.services import IntegrationService

        IntegrationService.delete(connection=self.get_object().connection, actor=request.user)
        return api_success(data=None, message="Connection deleted.", status_code=status.HTTP_204_NO_CONTENT)


@extend_schema(
    tags=TAGS,
    summary="Test a connection",
    description="USSD: sends a fake first request through the field mapping and shows the exact reply the operator would receive. WhatsApp: checks the credentials and, with a phone number, sends a test message.",
    request=ConnectionTestSerializer,
)
class ChannelConnectionTestView(_ConnectionView):
    throttle_classes = [ChannelTestThrottle]
    serializer_class = ConnectionTestSerializer

    def post(self, request, pk):
        from apps.platform_config.services import IntegrationService

        serializer = ConnectionTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        channel_connection = self.get_object()
        inputs = {"phone": serializer.validated_data.get("phone")} if channel_connection.connection.kind == "whatsapp" else {}
        result = IntegrationService.run_test(connection=channel_connection.connection, actor=request.user, inputs=inputs)
        channel_connection.connection.refresh_from_db()
        return api_success(data={"result": result, "connection": ChannelConnectionSerializer(channel_connection).data})


@extend_schema(tags=TAGS, summary="Activate a connection", description="Needs a passing test in the last 24 hours and a published journey. Other USSD and WhatsApp connections stay active.", request=None, responses={200: ChannelConnectionSerializer})
class ChannelConnectionActivateView(_ConnectionView):
    def post(self, request, pk):
        channel_connection = ChannelConnectionService.activate(channel_connection=self.get_object(), actor=request.user)
        return api_success(data=ChannelConnectionSerializer(channel_connection).data, message="Connection active.")


@extend_schema(tags=TAGS, summary="Turn a connection off", request=None, responses={200: ChannelConnectionSerializer})
class ChannelConnectionDeactivateView(_ConnectionView):
    def post(self, request, pk):
        from apps.platform_config.services import IntegrationService

        channel_connection = self.get_object()
        IntegrationService.deactivate(connection=channel_connection.connection, actor=request.user)
        channel_connection.connection.refresh_from_db()
        return api_success(data=ChannelConnectionSerializer(channel_connection).data, message="Connection turned off.")


@extend_schema(tags=TAGS, summary="Make a new webhook address", description="The old address stops working at once. Send the new one to the provider.", request=None, responses={200: ChannelConnectionSerializer})
class ChannelConnectionRotateView(_ConnectionView):
    def post(self, request, pk):
        channel_connection = ChannelConnectionService.rotate_token(channel_connection=self.get_object(), actor=request.user)
        return api_success(data=ChannelConnectionSerializer(channel_connection).data, message="New webhook address made.")


# --- Sessions and report -------------------------------------------------------------

SESSION_FILTERS = [
    OpenApiParameter("channel", str, required=False, enum=["ussd", "whatsapp"]),
    OpenApiParameter("journey", OpenApiTypes.UUID, required=False),
    OpenApiParameter("connection", OpenApiTypes.UUID, required=False),
    OpenApiParameter("status", str, required=False),
    OpenApiParameter("from", OpenApiTypes.DATE, required=False),
    OpenApiParameter("to", OpenApiTypes.DATE, required=False),
    OpenApiParameter("include_simulations", bool, required=False),
]


@extend_schema(tags=TAGS, summary="Session log", description="Phone numbers are masked. Answers marked sensitive are never stored.", parameters=[*SESSION_FILTERS, OpenApiParameter("page", int, required=False), OpenApiParameter("page_size", int, required=False)], responses={200: JourneySessionSerializer(many=True)})
class SessionListView(_ChannelsAdminView):
    def get(self, request):
        return api_success(data=_page(request, SessionSelector.filtered(request.query_params).select_related("draft"), JourneySessionSerializer))


@extend_schema(tags=TAGS, summary="One session with its steps", responses={200: JourneySessionDetailSerializer})
class SessionDetailView(_ChannelsAdminView):
    def get(self, request, pk):
        session = get_object_or_404(JourneySession.objects.select_related("journey", "connection__connection", "version", "draft").prefetch_related("steps"), pk=pk)
        return api_success(data=JourneySessionDetailSerializer(session).data)


@extend_schema(tags=TAGS, summary="Activity report", description="Sessions per day, where people stop, ideas started and hand-overs. Simulator runs are left out unless asked for.", parameters=SESSION_FILTERS)
class ActivityReportView(_ChannelsAdminView):
    def get(self, request):
        return api_success(data=ActivityReportSelector.report(request.query_params))


# --- Simulator -----------------------------------------------------------------------


@extend_schema(
    tags=TAGS,
    summary="Run a journey on the phone simulator",
    description="Start with no session_id (or restart=true); then send each answer with the session_id. Works with no provider connected. `version` draft runs the unsaved-to-publish steps.",
    request=SimulateRequestSerializer,
    responses={200: SimulateResponseSerializer},
)
class SimulateView(_ChannelsAdminView):
    serializer_class = SimulateRequestSerializer

    def post(self, request):
        serializer = SimulateRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        session, screen = SimulatorService.run(
            actor=request.user,
            journey=data["journey"],
            channel=data["channel"],
            session_id=data.get("session_id"),
            text=data.get("input"),
            restart=data.get("restart", False),
            as_registered=data.get("as_registered", False),
            use_draft=data.get("version", "draft") == "draft",
        )
        session.refresh_from_db()
        draft = None
        if session.draft_id:
            draft = {"id": str(session.draft.id), "reference": session.draft.reference_number, "title": session.draft.title, "innovator_id": str(session.draft.innovator_id or "")}
        return api_success(
            data={
                "session_id": str(session.id),
                "channel": session.channel,
                "phone": session.phone,
                "registered": session.user_id is not None,
                "language": session.language,
                "screen": screen.as_dict(session.channel),
                "draft": draft,
                "conversation_id": session.conversation_id,
            }
        )


# --- Webhooks ------------------------------------------------------------------------


@extend_schema(
    tags=WEBHOOK_TAGS,
    summary="USSD operator webhook",
    description="The operator posts each USSD request here. The reply format is set on the connection. Requests that fail the connection's secret, basic auth or address check are refused and logged.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiResponse(response=OpenApiTypes.STR, description="CON/END text, JSON or XML"), 403: OpenApiResponse(description="Refused")},
)
class USSDWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ChannelWebhookThrottle]

    def post(self, request, token):
        reply = USSDWebhookService.handle(token=token, request=request)
        return HttpResponse(reply.body, content_type=reply.content_type)


@extend_schema(
    tags=WEBHOOK_TAGS,
    summary="WhatsApp webhook",
    description="GET answers Meta's verification handshake. POST receives messages; the signature or secret is checked and anything else is refused and logged. Replies are sent through the provider.",
    request=OpenApiTypes.OBJECT,
    responses={200: OpenApiResponse(description="Received"), 403: OpenApiResponse(description="Refused")},
)
class WhatsAppWebhookView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [ChannelWebhookThrottle]

    def get(self, request, token):
        challenge = WhatsAppWebhookService.handshake(token=token, request=request)
        return HttpResponse(challenge, content_type="text/plain")

    def post(self, request, token):
        raw_body = request._request.body  # read before parsing, for the signature check
        handled = WhatsAppWebhookService.handle(token=token, request=request, raw_body=raw_body)
        return api_success(data={"handled": handled}, message="Received.")
