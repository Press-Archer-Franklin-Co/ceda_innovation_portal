from __future__ import annotations

from django.conf import settings
from rest_framework import serializers

from apps.channels.models import ChannelConnection, Journey, JourneyNode, JourneySession, JourneySessionStep, JourneyVersion
from apps.channels.selectors import SessionSelector
from apps.platform_config.crypto import decrypt_secrets
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.providers import get_provider_class


def _user_name(user) -> str:
    if user is None:
        return ""
    return (user.get_full_name() if hasattr(user, "get_full_name") else "") or getattr(user, "email", "") or ""


# --- Journeys ------------------------------------------------------------------------


class TextField(serializers.JSONField):
    """{"en": "...", "tn": "..."}"""


class JourneyNodeSerializer(serializers.ModelSerializer):
    next = serializers.CharField(source="next_key", required=False, allow_blank=True)

    class Meta:
        model = JourneyNode
        fields = ("id", "key", "type", "title", "text", "settings", "next", "position", "updated_at")
        read_only_fields = ("id", "updated_at")


class JourneyNodeWriteSerializer(serializers.Serializer):
    key = serializers.CharField(max_length=40, required=False)
    type = serializers.CharField(max_length=20, required=False)
    title = serializers.CharField(max_length=80, required=False, allow_blank=True)
    text = serializers.JSONField(required=False)
    settings = serializers.JSONField(required=False)
    next = serializers.CharField(max_length=40, required=False, allow_blank=True)
    position = serializers.JSONField(required=False)


class JourneyNodesReplaceSerializer(serializers.Serializer):
    nodes = JourneyNodeWriteSerializer(many=True)
    start_key = serializers.CharField(max_length=40, required=False, allow_blank=True)


class JourneyListSerializer(serializers.ModelSerializer):
    node_count = serializers.IntegerField(read_only=True)
    connection_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Journey
        fields = (
            "id", "name", "description", "channel", "status", "version", "default_language", "start_key",
            "has_unpublished_changes", "published_at", "updated_at", "node_count", "connection_count",
        )


class JourneyDetailSerializer(serializers.ModelSerializer):
    nodes = JourneyNodeSerializer(many=True, read_only=True)
    connections = serializers.SerializerMethodField()
    published_by_name = serializers.SerializerMethodField()

    class Meta:
        model = Journey
        fields = (
            "id", "name", "description", "channel", "status", "version", "default_language", "start_key",
            "has_unpublished_changes", "published_at", "published_by_name", "created_at", "updated_at", "nodes", "connections",
        )

    def get_connections(self, obj) -> list[dict]:
        return [
            {"id": str(c.id), "name": c.connection.name, "kind": c.connection.kind, "is_active": c.connection.is_active}
            for c in obj.connections.select_related("connection").all()
        ]

    def get_published_by_name(self, obj) -> str:
        return _user_name(obj.published_by)


class JourneyWriteSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120)
    description = serializers.CharField(max_length=300, required=False, allow_blank=True)
    channel = serializers.ChoiceField(choices=Journey.ChannelChoice.choices, required=False)
    default_language = serializers.ChoiceField(choices=(("en", "English"), ("tn", "Setswana")), required=False)
    start_key = serializers.CharField(max_length=40, required=False, allow_blank=True)
    nodes = JourneyNodeWriteSerializer(many=True, required=False)


class JourneyVersionSerializer(serializers.ModelSerializer):
    published_by_name = serializers.SerializerMethodField()
    node_count = serializers.SerializerMethodField()

    class Meta:
        model = JourneyVersion
        fields = ("id", "number", "created_at", "published_by_name", "warnings", "node_count", "graph")

    def get_published_by_name(self, obj) -> str:
        return _user_name(obj.published_by)

    def get_node_count(self, obj) -> int:
        return len((obj.graph or {}).get("nodes") or {})


class ProblemSerializer(serializers.Serializer):
    node = serializers.CharField()
    level = serializers.ChoiceField(choices=(("error", "error"), ("warning", "warning")))
    code = serializers.CharField()
    message = serializers.CharField()


class ValidationResultSerializer(serializers.Serializer):
    ok = serializers.BooleanField()
    problems = ProblemSerializer(many=True)


# --- Connections ---------------------------------------------------------------------


def webhook_url(channel_connection: ChannelConnection) -> str:
    base = (getattr(settings, "PUBLIC_BASE_URL", "") or "").rstrip("/")
    return f"{base}/api/channels/{channel_connection.connection.kind}/{channel_connection.webhook_token}/"


def console_status(connection: IntegrationConnection, provider_class) -> str:
    """waiting (details missing), not_tested, tested, failed, active, off."""
    if connection.is_active:
        return "active"
    if connection.status == IntegrationConnection.Status.FAILED:
        return "failed"
    if connection.status == IntegrationConnection.Status.TESTED:
        return "tested"
    if connection.status == IntegrationConnection.Status.DISABLED:
        return "off"
    if provider_class is None:
        return "waiting"
    secrets = decrypt_secrets(connection.secrets_encrypted)
    return "waiting" if provider_class.missing_required(connection.config or {}, secrets) else "not_tested"


def provider_instructions(channel_connection: ChannelConnection) -> dict:
    connection = channel_connection.connection
    config = connection.config or {}
    if connection.kind == "ussd":
        reply = {"text": "plain text starting with CON (keep open) or END (finish)", "json": "JSON", "xml": "XML"}.get(config.get("response_format") or "text", "plain text")
        request_format = "JSON body" if config.get("request_format") == "json" else "form fields"
        auth = {"header": f"send the shared secret in the {config.get('secret_header_name') or 'X-USSD-Secret'} header", "basic": "use basic auth"}.get(config.get("auth_mode") or "none", "")
        lines = [
            f"Send each USSD request to the address below by POST, as {request_format}.",
            f"Fields: session id in '{config.get('field_session_id', '')}', phone in '{config.get('field_phone', '')}', short code in '{config.get('field_short_code', '')}', typed text in '{config.get('field_text', '')}'.",
            f"We reply with {reply} ({config.get('content_type') or 'text/plain'}).",
        ]
        if auth:
            lines.append(f"Please {auth}.")
        return {"url": webhook_url(channel_connection), "method": "POST", "format": request_format, "lines": lines}
    lines = ["Send incoming WhatsApp messages to the address below by POST."]
    if connection.provider == "whatsapp_cloud":
        lines.append("Meta checks the address with a GET request first; use the verify token shown in the settings.")
    return {"url": webhook_url(channel_connection), "method": "GET and POST" if connection.provider == "whatsapp_cloud" else "POST", "format": "JSON", "lines": lines}


class ChannelConnectionSerializer(serializers.ModelSerializer):
    integration_id = serializers.UUIDField(source="connection.id", read_only=True)
    kind = serializers.CharField(source="connection.kind", read_only=True)
    provider = serializers.CharField(source="connection.provider", read_only=True)
    provider_label = serializers.SerializerMethodField()
    name = serializers.CharField(source="connection.name", read_only=True)
    is_active = serializers.BooleanField(source="connection.is_active", read_only=True)
    status = serializers.SerializerMethodField()
    config = serializers.SerializerMethodField()
    secrets = serializers.SerializerMethodField()
    journey = serializers.SerializerMethodField()
    webhook_url = serializers.SerializerMethodField()
    provider_instructions = serializers.SerializerMethodField()
    templates_missing = serializers.SerializerMethodField()
    last_test_result = serializers.JSONField(source="connection.last_test_result", read_only=True)
    last_tested_at = serializers.DateTimeField(source="connection.last_tested_at", read_only=True)
    activated_at = serializers.DateTimeField(source="connection.activated_at", read_only=True)

    class Meta:
        model = ChannelConnection
        fields = (
            "id", "integration_id", "kind", "provider", "provider_label", "name", "address", "is_active", "status",
            "config", "secrets", "journey", "webhook_url", "provider_instructions", "templates_missing",
            "last_test_result", "last_tested_at", "activated_at", "created_at", "updated_at",
        )

    def _provider_class(self, obj):
        return get_provider_class(obj.connection.provider)

    def get_provider_label(self, obj) -> str:
        provider_class = self._provider_class(obj)
        return provider_class.label if provider_class else obj.connection.provider

    def get_status(self, obj) -> str:
        return console_status(obj.connection, self._provider_class(obj))

    def get_config(self, obj) -> dict:
        return obj.connection.config or {}

    def get_secrets(self, obj) -> dict:
        from apps.platform_config.services import IntegrationService

        provider_class = self._provider_class(obj)
        if provider_class is None:
            return {}
        return IntegrationService.secret_summary(provider_class, decrypt_secrets(obj.connection.secrets_encrypted))

    def get_journey(self, obj) -> dict | None:
        if obj.journey is None:
            return None
        return {"id": str(obj.journey.id), "name": obj.journey.name, "version": obj.journey.version, "channel": obj.journey.channel}

    def get_webhook_url(self, obj) -> str:
        return webhook_url(obj)

    def get_provider_instructions(self, obj) -> dict:
        return provider_instructions(obj)

    def get_templates_missing(self, obj) -> list[str]:
        if obj.connection.kind != "whatsapp":
            return []
        provider_class = self._provider_class(obj)
        if provider_class is None or not hasattr(provider_class, "templates_missing"):
            return []
        return provider_class(obj.connection, config=obj.connection.config, secrets={}).templates_missing()


class ChannelConnectionCreateSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=(("ussd", "USSD"), ("whatsapp", "WhatsApp")))
    provider = serializers.CharField(max_length=60)
    name = serializers.CharField(max_length=120)
    preset = serializers.CharField(max_length=40, required=False, allow_blank=True)
    address = serializers.CharField(max_length=40, required=False, allow_blank=True)
    journey = serializers.PrimaryKeyRelatedField(queryset=Journey.objects.all(), required=False, allow_null=True)
    config = serializers.JSONField(required=False)
    secrets = serializers.JSONField(required=False, help_text="Write only. Never returned.")


class ChannelConnectionUpdateSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False)
    address = serializers.CharField(max_length=40, required=False, allow_blank=True)
    journey = serializers.PrimaryKeyRelatedField(queryset=Journey.objects.all(), required=False, allow_null=True)
    config = serializers.JSONField(required=False)
    secrets = serializers.JSONField(required=False, help_text="Write only. Empty keeps the saved value, null clears it.")


class ConnectionTestSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32, required=False, allow_blank=True, help_text="WhatsApp: a number to send a test message to.")


# --- Simulator -----------------------------------------------------------------------


class SimulatedAttachmentSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    content_type = serializers.CharField(max_length=120)
    size = serializers.IntegerField(min_value=0, max_value=200 * 1024 * 1024)


class SimulateRequestSerializer(serializers.Serializer):
    journey = serializers.PrimaryKeyRelatedField(queryset=Journey.objects.all())
    channel = serializers.ChoiceField(choices=(("ussd", "USSD"), ("whatsapp", "WhatsApp")))
    session_id = serializers.UUIDField(required=False, allow_null=True)
    input = serializers.CharField(required=False, allow_blank=True, max_length=500)
    restart = serializers.BooleanField(required=False, default=False)
    as_registered = serializers.BooleanField(required=False, default=False)
    version = serializers.ChoiceField(choices=(("draft", "Draft"), ("published", "Published")), required=False, default="draft")
    attachment = SimulatedAttachmentSerializer(required=False, allow_null=True, help_text="A pretend file for an Ask for a file step. Nothing is uploaded.")


class ScreenSerializer(serializers.Serializer):
    text = serializers.CharField()
    end = serializers.BooleanField()
    node_key = serializers.CharField()
    node_type = serializers.CharField()
    node_title = serializers.CharField(required=False)
    choices = serializers.ListField(child=serializers.DictField())
    expects = serializers.CharField()
    ussd_text = serializers.CharField(required=False)
    characters = serializers.IntegerField(required=False)
    whatsapp_layout = serializers.CharField(required=False)


class SimulateResponseSerializer(serializers.Serializer):
    session_id = serializers.UUIDField()
    channel = serializers.CharField()
    phone = serializers.CharField()
    registered = serializers.BooleanField()
    language = serializers.CharField()
    screen = ScreenSerializer()
    draft = serializers.DictField(allow_null=True)
    conversation_id = serializers.CharField(allow_blank=True)


# --- Sessions ------------------------------------------------------------------------


class JourneySessionStepSerializer(serializers.ModelSerializer):
    class Meta:
        model = JourneySessionStep
        fields = ("node_key", "node_type", "input", "provider_message_id", "attachment_count", "created_at")


class JourneySessionSerializer(serializers.ModelSerializer):
    journey_name = serializers.CharField(source="journey.name", read_only=True)
    connection_name = serializers.SerializerMethodField()
    version_number = serializers.IntegerField(source="version.number", read_only=True, allow_null=True)
    phone = serializers.SerializerMethodField()
    status = serializers.SerializerMethodField()
    draft_reference = serializers.SerializerMethodField()
    current_node_title = serializers.SerializerMethodField()

    class Meta:
        model = JourneySession
        fields = (
            "id", "channel", "journey", "journey_name", "connection", "connection_name", "version_number", "is_simulation",
            "phone", "language", "status", "current_node", "step_count", "started_at", "last_activity_at", "ended_at",
            "draft_reference", "conversation_id", "current_node_title",
        )

    def get_connection_name(self, obj) -> str:
        return obj.connection.connection.name if obj.connection_id else ""

    def get_phone(self, obj) -> str:
        from apps.core.phone import mask_phone

        return mask_phone(obj.phone) if obj.phone else ""

    def get_status(self, obj) -> str:
        return SessionSelector.effective_status(obj)

    def get_current_node_title(self, obj) -> str:
        """The name staff gave the screen the session is on or stopped at."""
        if not obj.current_node:
            return ""
        graph = (obj.version.graph if obj.version_id and obj.version else None) or {}
        node = (graph.get("nodes") or {}).get(obj.current_node)
        if node is None and obj.journey_id:
            found = obj.journey.nodes.filter(key=obj.current_node).values_list("title", flat=True).first()
            return found or obj.current_node
        return (node or {}).get("title") or obj.current_node

    def get_draft_reference(self, obj) -> str:
        return obj.draft.reference_number if obj.draft_id and obj.draft else ""


class JourneySessionDetailSerializer(JourneySessionSerializer):
    steps = JourneySessionStepSerializer(many=True, read_only=True)

    class Meta(JourneySessionSerializer.Meta):
        fields = JourneySessionSerializer.Meta.fields + ("steps",)


class ActivityReportSerializer(serializers.Serializer):
    period_from = serializers.DateField(source="from")
    to = serializers.DateField()
    totals = serializers.DictField()
    per_day = serializers.ListField(child=serializers.DictField())
    drop_off = serializers.ListField(child=serializers.DictField())
