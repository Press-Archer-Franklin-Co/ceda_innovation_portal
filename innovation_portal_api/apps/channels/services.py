"""C2 writes: journeys, publishing, channel connections, sessions, webhooks, simulator."""

from __future__ import annotations

import logging
import random
import re

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError

from apps.audit.services import AuditService
from apps.channels.engine import JourneyRunner, Screen, build_graph_from_nodes
from apps.channels.models import Channel, ChannelConnection, Journey, JourneyNode, JourneySession, JourneySessionStep, JourneyVersion
from apps.channels.nodes import TYPE_KEYS, check_graph, errors_only
from apps.core.phone import InvalidPhoneNumber, mask_phone, normalize_phone
from apps.platform_config.flags import is_enabled
from apps.platform_config.models import IntegrationConnection

logger = logging.getLogger(__name__)
security_logger = logging.getLogger("security.webhook")

FEATURE_FOR_CHANNEL = {Channel.USSD: "ussd", Channel.WHATSAPP: "whatsapp_messages"}
WHATSAPP_TIMEOUT_SECONDS = 24 * 3600
DEFAULT_USSD_TIMEOUT_SECONDS = 60
SIMULATOR_TIMEOUT_SECONDS = 30 * 60
NOT_AVAILABLE = {
    "en": "This service is not available yet. Please try again later.",
    "tn": "Tirelo e ga e ise e nne teng. Tsweetswee leka gape moragonyana.",  # TODO tn-review
}


def _audit(actor, action: str, target_model: str, target_id, **metadata) -> None:
    AuditService.log_raw_action(actor=actor, action_type=action, target_model=target_model, target_id=str(target_id), metadata=metadata)


def reject_webhook(*, channel: str, token: str, reason: str, request) -> None:
    """Log a refused webhook (never the body, the phone number or the secret) and refuse it."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    address = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
    security_logger.warning(
        "security.webhook_rejected channel=%s token=%s… reason=%s address=%s agent=%s",
        channel,
        (token or "")[:6],
        reason,
        address,
        (request.META.get("HTTP_USER_AGENT") or "")[:120],
    )
    raise PermissionDenied({"code": "webhook_rejected", "detail": "This request could not be verified."})


# --------------------------------------------------------------------------------------
# Is a channel live?
# --------------------------------------------------------------------------------------


class ChannelStatus:
    @staticmethod
    def has_active_connection(channel: str) -> bool:
        return IntegrationConnection.objects.filter(kind=channel, is_active=True).exists()

    @staticmethod
    def is_live(channel: str) -> bool:
        """On only when the switch is on and at least one connection is active."""
        return is_enabled(FEATURE_FOR_CHANNEL[channel]) and ChannelStatus.has_active_connection(channel)

    @staticmethod
    def summary() -> dict:
        result = {}
        for channel in (Channel.USSD, Channel.WHATSAPP):
            switch_on = is_enabled(FEATURE_FOR_CHANNEL[channel])
            active = ChannelStatus.has_active_connection(channel)
            if switch_on and active:
                state = "live"
            elif not active:
                state = "waiting_for_provider"
            else:
                state = "switched_off"
            result[str(channel)] = {"switch_on": switch_on, "has_active_connection": active, "live": switch_on and active, "state": state}
        result["live_chat"] = ChannelStatus.live_chat()
        return result

    @staticmethod
    def live_chat() -> dict:
        """The website live chat (C1), for the Channels overview. Officers online is None when unknown."""
        switch_on = is_enabled("live_chat")
        try:
            from apps.conversations.live import online_user_ids

            online = len(online_user_ids())
        except Exception:  # C1 not installed, or its cache is unavailable
            online = None
        return {"switch_on": switch_on, "live": switch_on, "state": "live" if switch_on else "switched_off", "officers_online": online}


# --------------------------------------------------------------------------------------
# Journeys and nodes
# --------------------------------------------------------------------------------------

NODE_KEY_PATTERN = re.compile(r"^[a-z0-9][a-z0-9_-]{0,39}$")


def _clean_text(value) -> dict:
    if value in (None, ""):
        return {}
    if isinstance(value, str):
        return {"en": value}
    if not isinstance(value, dict):
        raise ValidationError({"text": ["Send text as {\"en\": \"...\", \"tn\": \"...\"}."]})
    return {lang: str(value.get(lang) or "") for lang in ("en", "tn") if value.get(lang) not in (None, "")}


class JourneyService:
    JOURNEY_FIELDS = ("name", "description", "channel", "default_language", "start_key")

    @staticmethod
    def _touch(journey: Journey, actor) -> None:
        journey.has_unpublished_changes = True
        journey.updated_by = actor
        journey.save(update_fields=["has_unpublished_changes", "updated_by", "updated_at"])

    @staticmethod
    @transaction.atomic
    def create(*, actor, data: dict) -> Journey:
        journey = Journey.objects.create(
            name=data["name"],
            description=data.get("description", ""),
            channel=data.get("channel") or Journey.ChannelChoice.BOTH,
            default_language=data.get("default_language") or "en",
            created_by=actor,
            updated_by=actor,
        )
        nodes = data.get("nodes")
        if nodes:
            JourneyService.replace_nodes(journey=journey, actor=actor, nodes=nodes, start_key=data.get("start_key"), audit=False)
        _audit(actor, "channel_journey_created", "Journey", journey.id, name=journey.name, channel=journey.channel)
        return journey

    @staticmethod
    @transaction.atomic
    def update(*, journey: Journey, actor, data: dict) -> Journey:
        changed = []
        for name in JourneyService.JOURNEY_FIELDS:
            if name in data and getattr(journey, name) != data[name]:
                setattr(journey, name, data[name])
                changed.append(name)
        if not changed:
            return journey
        journey.updated_by = actor
        journey.has_unpublished_changes = True
        journey.save(update_fields=[*changed, "updated_by", "has_unpublished_changes", "updated_at"])
        _audit(actor, "channel_journey_updated", "Journey", journey.id, changed=changed)
        return journey

    @staticmethod
    @transaction.atomic
    def delete(*, journey: Journey, actor) -> None:
        if ChannelConnection.objects.filter(journey=journey, connection__is_active=True).exists():
            raise ValidationError({"code": "journey_in_use", "detail": "An active connection runs this journey. Choose another journey for it first."})
        _audit(actor, "channel_journey_deleted", "Journey", journey.id, name=journey.name)
        journey.delete()

    @staticmethod
    def _clean_node(data: dict, *, partial: bool = False) -> dict:
        cleaned = {}
        if "key" in data or not partial:
            key = str(data.get("key") or "").strip().lower()
            if not NODE_KEY_PATTERN.match(key):
                raise ValidationError({"key": ["Use up to 40 lower-case letters, numbers, - or _."]})
            cleaned["key"] = key
        if "type" in data or not partial:
            if data.get("type") not in TYPE_KEYS:
                raise ValidationError({"type": [f"Choose one of: {', '.join(sorted(TYPE_KEYS))}."]})
            cleaned["type"] = data["type"]
        if "text" in data:
            cleaned["text"] = _clean_text(data["text"])
        if "settings" in data:
            if not isinstance(data["settings"] or {}, dict):
                raise ValidationError({"settings": ["Send settings as an object."]})
            cleaned["settings"] = data["settings"] or {}
        if "position" in data:
            position = data["position"] or {}
            try:
                cleaned["position"] = {"x": float(position.get("x", 0)), "y": float(position.get("y", 0))}
            except (TypeError, ValueError, AttributeError) as exc:
                raise ValidationError({"position": ["Send position as {\"x\": 0, \"y\": 0}."]}) from exc
        for name, size in (("title", 80), ("next_key", 40)):
            if name in data:
                cleaned[name] = str(data[name] or "")[:size]
        if "next" in data and "next_key" not in data:
            cleaned["next_key"] = str(data["next"] or "")[:40]
        return cleaned

    @staticmethod
    @transaction.atomic
    def replace_nodes(*, journey: Journey, actor, nodes: list, start_key: str | None = None, audit: bool = True) -> Journey:
        """Save the whole canvas at once (the builder's Save)."""
        if not isinstance(nodes, list):
            raise ValidationError({"nodes": ["Send a list of steps."]})
        cleaned = [JourneyService._clean_node(item) for item in nodes]
        keys = [item["key"] for item in cleaned]
        if len(keys) != len(set(keys)):
            raise ValidationError({"nodes": ["Two steps have the same key."]})
        journey.nodes.exclude(key__in=keys).delete()
        existing = {node.key: node for node in journey.nodes.all()}
        for item in cleaned:
            node = existing.get(item["key"]) or JourneyNode(journey=journey, key=item["key"])
            for name, value in item.items():
                setattr(node, name, value)
            node.save()
        if start_key is not None:
            journey.start_key = start_key
        elif journey.start_key not in keys:
            journey.start_key = keys[0] if keys else ""
        journey.save(update_fields=["start_key", "updated_at"])
        JourneyService._touch(journey, actor)
        if audit:
            _audit(actor, "channel_journey_nodes_saved", "Journey", journey.id, nodes=len(keys))
        return journey

    @staticmethod
    @transaction.atomic
    def add_node(*, journey: Journey, actor, data: dict) -> JourneyNode:
        cleaned = JourneyService._clean_node(data)
        if journey.nodes.filter(key=cleaned["key"]).exists():
            raise ValidationError({"key": ["Another step already uses this key."]})
        node = JourneyNode.objects.create(journey=journey, **cleaned)
        if not journey.start_key:
            journey.start_key = node.key
            journey.save(update_fields=["start_key", "updated_at"])
        JourneyService._touch(journey, actor)
        _audit(actor, "channel_journey_node_added", "Journey", journey.id, node=node.key, type=node.type)
        return node

    @staticmethod
    @transaction.atomic
    def update_node(*, node: JourneyNode, actor, data: dict) -> JourneyNode:
        cleaned = JourneyService._clean_node(data, partial=True)
        if "key" in cleaned and cleaned["key"] != node.key:
            raise ValidationError({"key": ["A step's key cannot change. Add a new step instead."]})
        for name, value in cleaned.items():
            setattr(node, name, value)
        node.save()
        JourneyService._touch(node.journey, actor)
        _audit(actor, "channel_journey_node_updated", "Journey", node.journey_id, node=node.key, changed=sorted(cleaned))
        return node

    @staticmethod
    @transaction.atomic
    def delete_node(*, node: JourneyNode, actor) -> None:
        journey = node.journey
        key = node.key
        node.delete()
        if journey.start_key == key:
            journey.start_key = ""
            journey.save(update_fields=["start_key", "updated_at"])
        JourneyService._touch(journey, actor)
        _audit(actor, "channel_journey_node_deleted", "Journey", journey.id, node=key)

    @staticmethod
    def validate(journey: Journey) -> list[dict]:
        return check_graph(build_graph_from_nodes(journey), journey.channel)

    @staticmethod
    @transaction.atomic
    def publish(*, journey: Journey, actor) -> JourneyVersion:
        journey = Journey.objects.select_for_update().get(pk=journey.pk)
        graph = build_graph_from_nodes(journey)
        problems = check_graph(graph, journey.channel)
        errors = errors_only(problems)
        if errors:
            raise ValidationError({"code": "journey_has_problems", "detail": "Fix these before publishing.", "problems": problems})
        number = journey.version + 1
        version = JourneyVersion.objects.create(
            journey=journey, number=number, graph=graph, published_by=actor, warnings=[p for p in problems if p["level"] == "warning"]
        )
        journey.version = number
        journey.status = Journey.Status.PUBLISHED
        journey.has_unpublished_changes = False
        journey.published_at = timezone.now()
        journey.published_by = actor
        journey.save(update_fields=["version", "status", "has_unpublished_changes", "published_at", "published_by", "updated_at"])
        _audit(actor, "channel_journey_published", "Journey", journey.id, version=number, warnings=len(version.warnings))
        return version


# --------------------------------------------------------------------------------------
# Channel connections (USSD operators, WhatsApp numbers)
# --------------------------------------------------------------------------------------


class ChannelConnectionService:
    @staticmethod
    def _check_journey(journey: Journey | None, kind: str) -> None:
        if journey is not None and not journey.runs_on(kind):
            raise ValidationError({"journey": [f"This journey is not set up for {kind}."]})

    @staticmethod
    @transaction.atomic
    def create(*, actor, kind: str, provider: str, name: str, preset: str = "", config: dict | None = None, secrets: dict | None = None, address: str = "", journey: Journey | None = None):
        from apps.platform_config.providers import get_provider_class
        from apps.platform_config.providers.ussd import PRESETS
        from apps.platform_config.services import IntegrationService

        if kind not in (Channel.USSD, Channel.WHATSAPP):
            raise ValidationError({"kind": ["Choose ussd or whatsapp."]})
        provider_class = get_provider_class(provider)
        if provider_class is None or provider_class.kind != kind:
            raise ValidationError({"provider": [f"`{provider}` is not a {kind} provider."]})
        ChannelConnectionService._check_journey(journey, kind)
        merged: dict = {}
        if preset:
            if kind != Channel.USSD or preset not in PRESETS:
                raise ValidationError({"preset": ["Unknown preset."]})
            field_names = set(provider_class.field_map())
            merged.update({k: v for k, v in PRESETS[preset]["config"].items() if k in field_names})
        if hasattr(provider_class, "generated_config"):
            merged.update(provider_class.generated_config())
        merged.update(config or {})
        connection, warnings = IntegrationService.create(actor=actor, kind=kind, provider=provider, name=name, config=merged, secrets=secrets)
        channel_connection, _ = ChannelConnection.objects.get_or_create(connection=connection)
        channel_connection.address = (address or "")[:40]
        channel_connection.journey = journey
        channel_connection.save(update_fields=["address", "journey", "updated_at"])
        _audit(actor, "channel_connection_created", "ChannelConnection", channel_connection.id, kind=kind, provider=provider, preset=preset, journey=str(journey.id) if journey else "")
        return channel_connection, warnings

    @staticmethod
    @transaction.atomic
    def update(*, channel_connection: ChannelConnection, actor, data: dict):
        from apps.platform_config.services import IntegrationService

        warnings: list[str] = []
        integration_data = {key: data[key] for key in ("name", "config", "secrets") if key in data}
        if integration_data:
            _, warnings = IntegrationService.update(connection=channel_connection.connection, actor=actor, data=integration_data)
        changed = []
        if "address" in data and data["address"] != channel_connection.address:
            channel_connection.address = (data["address"] or "")[:40]
            changed.append("address")
        if "journey" in data and data["journey"] != channel_connection.journey:
            ChannelConnectionService._check_journey(data["journey"], channel_connection.connection.kind)
            channel_connection.journey = data["journey"]
            changed.append("journey")
        if changed:
            channel_connection.save(update_fields=[*changed, "updated_at"])
            _audit(actor, "channel_connection_updated", "ChannelConnection", channel_connection.id, changed=changed)
        channel_connection.connection.refresh_from_db()
        return channel_connection, warnings

    @staticmethod
    @transaction.atomic
    def rotate_token(*, channel_connection: ChannelConnection, actor) -> ChannelConnection:
        from apps.channels.models import new_webhook_token

        channel_connection.webhook_token = new_webhook_token()
        channel_connection.save(update_fields=["webhook_token", "updated_at"])
        _audit(actor, "channel_connection_webhook_rotated", "ChannelConnection", channel_connection.id)
        return channel_connection

    @staticmethod
    def activate(*, channel_connection: ChannelConnection, actor):
        from apps.platform_config.services import IntegrationService

        journey = channel_connection.journey
        if journey is None:
            raise ValidationError({"code": "activation_blocked", "detail": "Choose the journey this connection runs first."})
        if journey.version == 0:
            raise ValidationError({"code": "activation_blocked", "detail": "Publish the journey first."})
        IntegrationService.activate(connection=channel_connection.connection, actor=actor)
        channel_connection.connection.refresh_from_db()
        return channel_connection


# --------------------------------------------------------------------------------------
# Sessions
# --------------------------------------------------------------------------------------


class SessionService:
    @staticmethod
    def timeout_seconds(channel: str, channel_connection: ChannelConnection | None, simulation: bool) -> int:
        if simulation:
            return SIMULATOR_TIMEOUT_SECONDS
        if channel == Channel.WHATSAPP:
            return WHATSAPP_TIMEOUT_SECONDS
        configured = (channel_connection.connection.config or {}).get("session_timeout") if channel_connection else None
        try:
            return max(10, int(configured)) if configured else DEFAULT_USSD_TIMEOUT_SECONDS
        except (TypeError, ValueError):
            return DEFAULT_USSD_TIMEOUT_SECONDS

    @staticmethod
    def find_active(*, channel: str, external_id: str, channel_connection=None, simulation=False) -> JourneySession | None:
        queryset = JourneySession.objects.select_for_update(of=("self",)).filter(channel=channel, external_id=external_id, status=JourneySession.Status.ACTIVE, is_simulation=simulation)
        if channel_connection is not None:
            queryset = queryset.filter(connection=channel_connection)
        session = queryset.select_related("journey", "version", "user").order_by("-started_at").first()
        if session is None:
            return None
        limit = SessionService.timeout_seconds(channel, channel_connection, simulation)
        if session.last_activity_at < timezone.now() - timezone.timedelta(seconds=limit):
            session.status = JourneySession.Status.TIMED_OUT
            session.ended_at = timezone.now()
            session.save(update_fields=["status", "ended_at", "updated_at"])
            return None
        return session

    @staticmethod
    def graph_for(session: JourneySession) -> dict:
        if session.version_id:
            return session.version.graph
        return build_graph_from_nodes(session.journey)

    @staticmethod
    def start(*, channel: str, journey: Journey, external_id: str, phone: str, channel_connection=None, simulation=False, use_draft=False, user=None):
        from apps.channels.actions import find_user_by_phone

        version = None if use_draft else journey.latest_version
        if version is None and not use_draft:
            raise ValidationError({"code": "journey_not_published", "detail": "Publish the journey first."})
        if user is None and phone and not simulation:
            user = find_user_by_phone(phone)
        now = timezone.now()
        session = JourneySession.objects.create(
            channel=channel,
            connection=channel_connection,
            journey=journey,
            version=version,
            is_simulation=simulation,
            external_id=external_id[:120],
            phone=phone[:32],
            user=user,
            language=journey.default_language or "en",
            last_activity_at=now,
            last_inbound_at=now if channel == Channel.WHATSAPP else None,
        )
        graph = SessionService.graph_for(session)
        runner = SessionService._runner(session, graph)
        screen = runner.start()
        SessionService._save(session, runner, screen)
        return session, screen

    @staticmethod
    def _runner(session: JourneySession, graph: dict) -> JourneyRunner:
        return JourneyRunner(
            graph,
            session.state,
            channel=session.channel,
            phone=session.phone,
            user=session.user,
            session_id=str(session.id),
            simulation=session.is_simulation,
        )

    @staticmethod
    def answer(*, session: JourneySession, text: str) -> Screen:
        graph = SessionService.graph_for(session)
        runner = SessionService._runner(session, graph)
        screen = runner.answer(text)
        if session.channel == Channel.WHATSAPP:
            session.last_inbound_at = timezone.now()
        SessionService._save(session, runner, screen)
        return screen

    @staticmethod
    def _save(session: JourneySession, runner: JourneyRunner, screen: Screen) -> None:
        now = timezone.now()
        session.state = runner.state
        session.language = runner.lang
        session.current_node = screen.node_key or ""
        session.last_activity_at = now
        if runner.user is not None and session.user_id is None:
            session.user = runner.user
        if runner.effects.get("draft_id"):
            session.draft_id = runner.effects["draft_id"]
        if runner.effects.get("conversation_id"):
            session.conversation_id = runner.effects["conversation_id"][:64]
        if screen.end:
            session.status = JourneySession.Status.HANDED_OVER if screen.outcome == "handed_over" else JourneySession.Status.COMPLETED
            session.ended_at = now
        session.step_count += len(runner.logged_steps)
        session.save()
        JourneySessionStep.objects.bulk_create(
            [JourneySessionStep(session=session, node_key=key[:40], node_type=kind[:20], input=value[:300]) for key, kind, value in runner.logged_steps]
        )

    @staticmethod
    def cancel(session: JourneySession) -> None:
        if session.status == JourneySession.Status.ACTIVE:
            session.status = JourneySession.Status.ABANDONED
            session.ended_at = timezone.now()
            session.save(update_fields=["status", "ended_at", "updated_at"])


# --------------------------------------------------------------------------------------
# Webhooks
# --------------------------------------------------------------------------------------


def _connection_for_token(token: str, kind: str) -> ChannelConnection | None:
    return (
        ChannelConnection.objects.select_related("connection", "journey")
        .filter(webhook_token=token, connection__kind=kind)
        .first()
    )


def _provider(channel_connection: ChannelConnection):
    from apps.platform_config.selectors import IntegrationRuntimeSelector

    return IntegrationRuntimeSelector.provider_for(channel_connection.connection)


def _phone(value: str) -> str:
    try:
        return normalize_phone(value)
    except InvalidPhoneNumber:
        return (value or "")[:32]


class USSDWebhookService:
    @staticmethod
    def handle(*, token: str, request):
        """Return a ``USSDReply``. Raises PermissionDenied (logged) or NotFound."""
        channel_connection = _connection_for_token(token, Channel.USSD)
        if channel_connection is None:
            reject_webhook(channel="ussd", token=token, reason="unknown_token", request=request)
        provider = _provider(channel_connection)
        if provider is None:
            raise NotFound()
        from apps.platform_config.providers.ussd import WebhookRejected

        forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
        address = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
        try:
            provider.authenticate(headers=request.headers, remote_ip=address)
        except WebhookRejected as exc:
            reject_webhook(channel="ussd", token=token, reason=str(exc), request=request)
        live = channel_connection.connection.is_active and is_enabled("ussd")
        journey = channel_connection.journey
        if not live or journey is None or journey.version == 0:
            return provider.not_available()
        data = request.data if hasattr(request.data, "get") else {}
        if not data:
            data = request.query_params
        parsed = provider.parse({key: data.get(key) for key in data.keys()} if not isinstance(data, dict) else data)
        if not parsed.session_id:
            return provider.format_reply("Sorry, something went wrong. Please dial again.", end=True)
        phone = _phone(parsed.phone)
        mode = provider.config.get("text_mode") or "cumulative"
        try:
            with transaction.atomic():
                session = SessionService.find_active(channel=Channel.USSD, external_id=parsed.session_id, channel_connection=channel_connection)
                if session is None:
                    session, screen = SessionService.start(
                        channel=Channel.USSD, journey=journey, external_id=parsed.session_id, phone=phone, channel_connection=channel_connection
                    )
                    _, consumed = provider.new_input(parsed.text, None, mode)
                    session.state["ussd_consumed"] = consumed
                    session.save(update_fields=["state", "updated_at"])
                else:
                    typed, consumed = provider.new_input(parsed.text, session.state.get("ussd_consumed", ""), mode)
                    session.state["ussd_consumed"] = consumed
                    screen = SessionService.answer(session=session, text=typed or "")
        except Exception:
            logger.exception("USSD session failed on connection %s", channel_connection.id)
            return provider.format_reply("Sorry, something went wrong. Please try again later.", end=True)
        return provider.format_reply(screen.ussd_text(), end=screen.end)


class WhatsAppWebhookService:
    @staticmethod
    def handshake(*, token: str, request) -> str:
        channel_connection = _connection_for_token(token, Channel.WHATSAPP)
        if channel_connection is None:
            reject_webhook(channel="whatsapp", token=token, reason="unknown_token", request=request)
        provider = _provider(channel_connection)
        challenge = provider.verify_handshake(request.query_params) if provider else None
        if challenge is None:
            reject_webhook(channel="whatsapp", token=token, reason="bad_verify_token", request=request)
        return challenge

    @staticmethod
    def handle(*, token: str, request, raw_body: bytes) -> int:
        """Check the signature, run each message through the journey and send the reply.
        Returns how many messages were handled."""
        from apps.platform_config.providers.whatsapp import WebhookRejected

        channel_connection = _connection_for_token(token, Channel.WHATSAPP)
        if channel_connection is None:
            reject_webhook(channel="whatsapp", token=token, reason="unknown_token", request=request)
        provider = _provider(channel_connection)
        if provider is None:
            raise NotFound()
        data = request.data if isinstance(request.data, dict) else {key: request.data.get(key) for key in request.data.keys()}
        try:
            provider.authenticate(raw_body=raw_body, headers=request.headers, url=request.build_absolute_uri(), data=data)
        except WebhookRejected as exc:
            reject_webhook(channel="whatsapp", token=token, reason=str(exc), request=request)
        messages = provider.parse_inbound(data)
        live = channel_connection.connection.is_active and is_enabled("whatsapp_messages")
        journey = channel_connection.journey
        handled = 0
        for message in messages:
            phone = _phone(message.phone)
            if not live or journey is None or journey.version == 0:
                WhatsAppOutbound.send_screen(provider, phone, Screen(text=NOT_AVAILABLE["en"], end=True))
                continue
            try:
                with transaction.atomic():
                    session = SessionService.find_active(channel=Channel.WHATSAPP, external_id=phone, channel_connection=channel_connection)
                    if session is None:
                        session, screen = SessionService.start(channel=Channel.WHATSAPP, journey=journey, external_id=phone, phone=phone, channel_connection=channel_connection)
                    else:
                        screen = SessionService.answer(session=session, text=message.text)
            except Exception:
                logger.exception("WhatsApp session failed on connection %s", channel_connection.id)
                screen = Screen(text="Sorry, something went wrong. Please try again later.", end=True)
            WhatsAppOutbound.send_screen(provider, phone, screen)
            handled += 1
        return handled


class WhatsAppOutbound:
    @staticmethod
    def send_screen(provider, phone: str, screen: Screen) -> None:
        from apps.platform_config.providers.whatsapp import Choice, OutboundReply

        reply = OutboundReply(text=screen.text, choices=[Choice(c.id, c.title) for c in screen.choices])
        try:
            result = provider.send_reply(phone, reply)
            if not result.ok:
                logger.warning("WhatsApp reply to %s was not accepted: %s", mask_phone(phone), (result.error or "")[:200])
        except Exception:
            logger.exception("WhatsApp reply to %s failed", mask_phone(phone))

    @staticmethod
    def last_inbound_at(phone: str):
        session = JourneySession.objects.filter(channel=Channel.WHATSAPP, phone=phone, is_simulation=False, last_inbound_at__isnull=False).order_by("-last_inbound_at").first()
        return session.last_inbound_at if session else None

    @staticmethod
    def send(*, to: str, body: str, message_type: str = "staff_reply"):
        """Send a message from staff or the system on WhatsApp (C1 calls this through
        ``MessageSenderRegistry.deliver``). Returns a ``DeliveryResult``, or None when no
        WhatsApp connection is active. Within 24 hours of the person's last message the
        text is sent as it is; after that only the approved template for ``message_type``."""
        from apps.communications.senders import DeliveryResult

        session = JourneySession.objects.filter(channel=Channel.WHATSAPP, phone=to, is_simulation=False, connection__connection__is_active=True).select_related("connection__connection").order_by("-last_activity_at").first()
        channel_connection = session.connection if session else ChannelConnection.objects.filter(connection__kind=Channel.WHATSAPP, connection__is_active=True).select_related("connection").first()
        if channel_connection is None:
            return None
        provider = _provider(channel_connection)
        if provider is None:
            return None
        last = WhatsAppOutbound.last_inbound_at(to)
        within_window = bool(last and last > timezone.now() - timezone.timedelta(seconds=WHATSAPP_TIMEOUT_SECONDS))
        try:
            if within_window:
                result = provider.send_text(to, body)
            else:
                template = (provider.config.get("templates") or {}).get(message_type)
                if not template:
                    return DeliveryResult("skipped", provider=provider.key, reason=f"Outside the 24 hour window and no '{message_type}' template is set.")
                result = provider.send_template(to, template, provider.config.get("template_language") or "en", [body[:1000]])
        except Exception as exc:
            logger.exception("WhatsApp provider %s failed", provider.key)
            return DeliveryResult("failed", provider=provider.key, reason=f"Provider error: {exc.__class__.__name__}")
        if result.ok:
            return DeliveryResult("sent", provider=provider.key, message_id=result.message_id, provider_status=result.provider_status)
        return DeliveryResult("failed", provider=provider.key, reason=(result.error or "")[:500])


# --------------------------------------------------------------------------------------
# Phone simulator
# --------------------------------------------------------------------------------------


class SimulatorService:
    @staticmethod
    def fake_phone() -> str:
        return "+2677" + "".join(random.choice("0123456789") for _ in range(7))

    @staticmethod
    def run(*, actor, journey: Journey, channel: str, session_id=None, text: str | None = None, restart: bool = False, as_registered: bool = False, use_draft: bool = True) -> tuple[JourneySession, Screen]:
        if not journey.runs_on(channel):
            raise ValidationError({"channel": [f"This journey is not set up for {channel}."]})
        with transaction.atomic():
            session = None
            if session_id and not restart:
                session = (
                    JourneySession.objects.select_for_update(of=("self",))
                    .select_related("journey", "version", "user")
                    .filter(id=session_id, is_simulation=True, journey=journey, status=JourneySession.Status.ACTIVE)
                    .first()
                )
            if session_id and restart:
                old = JourneySession.objects.filter(id=session_id, is_simulation=True).first()
                if old:
                    SessionService.cancel(old)
            if session is None:
                if as_registered:
                    user, phone = actor, (actor.phone_number or SimulatorService.fake_phone())
                else:
                    user, phone = None, SimulatorService.fake_phone()
                session, screen = SessionService.start(
                    channel=channel,
                    journey=journey,
                    external_id=f"sim-{actor.id}-{timezone.now().timestamp()}",
                    phone=phone,
                    simulation=True,
                    use_draft=use_draft,
                    user=user,
                )
                return session, screen
            screen = SessionService.answer(session=session, text=text or "")
            return session, screen
