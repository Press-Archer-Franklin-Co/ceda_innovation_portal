"""C1 endpoints. Staff: /api/inbox/ (conversations.reply) and /api/live-chat/settings/ (settings.manage).
Public: /api/help-chat/. Everything here is 404 while the live_chat switch is off."""

from __future__ import annotations

import logging
import uuid

from django.http import Http404
from django.shortcuts import get_object_or_404
from django.utils.dateparse import parse_datetime
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework.views import APIView

from apps.audit.services import AuditService
from apps.conversations import inbox, live, services
from apps.conversations.models import Conversation, ConversationMessage, LiveChatSettings
from apps.core.api import api_success
from apps.core.permissions import HasCapability
from apps.platform_config.flags import feature_required

TAGS = ["Inbox (C1)"]
PUBLIC_TAGS = ["Help chat (C1)"]
LIVE = feature_required("live_chat")


def _iso(value):
    return value.isoformat() if value else None


def _short(user) -> str:
    from apps.communications.messaging import short_name

    return short_name(user)


def message_payload(message: ConversationMessage, *, for_staff: bool, request=None) -> dict:
    if message.author_role == ConversationMessage.Author.STAFF:
        author = {"name": _short(message.author) if message.author_id else "CEDA", "role": "staff"}
    elif message.author_role == ConversationMessage.Author.PERSON:
        author = {"name": (message.conversation.display_name or "The person") if for_staff else "You", "role": "person"}
    elif message.author_role == ConversationMessage.Author.BOT:
        author = {"name": "AI helper" if message.conversation.handed_over_by == "ai" else "CEDA assistant", "role": "bot"}
    else:
        author = {"name": "CEDA Innovation", "role": "system"}
    seen = None
    if for_staff and message.author_role == ConversationMessage.Author.STAFF and message.read_by_person_at:
        seen = {"at": _iso(message.read_by_person_at)}
    if not for_staff and message.author_role == ConversationMessage.Author.PERSON and message.read_by_staff_at:
        seen = {"name": _short(message.read_by_staff) if message.read_by_staff_id else "CEDA", "at": _iso(message.read_by_staff_at)}
    data = {
        "id": str(message.id),
        "author_role": message.author_role,
        "author": author,
        "body": message.body,
        "attachments": [{"id": str(asset.id), "kind": asset.kind, "url": (request.build_absolute_uri(asset.file.url) if request else asset.file.url) if asset.file else None} for asset in message.attachments.all()],
        "created_at": _iso(message.created_at),
        "seen_by": seen,
    }
    if for_staff:
        data["is_internal"] = message.is_internal
        data["delivery"] = message.delivery
    return data


def _messages(conversation, request, *, for_staff: bool) -> dict:
    rows = conversation.messages.select_related("author", "read_by_staff", "conversation__contact_user").prefetch_related("attachments")
    if not for_staff:
        rows = rows.filter(is_internal=False)
    after = request.query_params.get("after") or ""
    if after:
        try:
            cursor = conversation.messages.get(id=uuid.UUID(after)).created_at
        except (ValueError, ConversationMessage.DoesNotExist):
            cursor = parse_datetime(after.replace(" ", "+"))
            if cursor is None:
                raise ValidationError({"after": "Use a message id or an ISO time."}) from None
        rows = rows.filter(created_at__gt=cursor)
    items = [message_payload(message, for_staff=for_staff, request=request) for message in rows]
    # When the other side last read this chat, so a client polling with ?after= can show "Seen" on messages it
    # already has: staff see when the person read, the person sees when staff read.
    from django.db.models import Max

    sent = conversation.messages.filter(is_internal=False, author_role=ConversationMessage.Author.STAFF if for_staff else ConversationMessage.Author.PERSON)
    seen_at = sent.aggregate(at=Max("read_by_person_at" if for_staff else "read_by_staff_at"))["at"]
    return {
        "results": items,
        "last_id": items[-1]["id"] if items else (after or None),
        "typing": live.typing("conversation", conversation.id, "person" if for_staff else "staff"),
        "typing_supported": True,
        "seen_at": _iso(seen_at),
    }


def conversation_detail(conversation) -> dict:
    from apps.core.phone import mask_phone

    user = conversation.contact_user
    ideas = []
    if user is not None:
        ideas = [{"id": str(item.id), "title": item.title, "reference": item.reference_number, "status": item.current_status} for item in user.submissions.filter(submitted_at__isnull=False).order_by("-submitted_at")[:5]]
    district = getattr(getattr(user, "innovator_profile", None), "district", None) if user else None
    row = inbox.conversation_row(conversation)
    return {
        **row,
        "language": conversation.language,
        "started_at": _iso(conversation.created_at),
        "reason": conversation.reason,
        "team_note": conversation.team_note,
        "closed_at": _iso(conversation.closed_at),
        "closed_reason": conversation.closed_reason,
        "satisfaction": conversation.satisfaction,
        "person": {
            "name": conversation.display_name,
            "phone": mask_phone(conversation.contact_phone) if conversation.contact_phone else "",
            "email": conversation.contact_email,
            "district": (district.name.get("en") if isinstance(district.name, dict) else str(district)) if district else "",
            "language": conversation.language,
            "user_id": str(user.id) if user else None,
            "ideas": ideas,
        },
        "support_request_id": str(conversation.support_request_id) if conversation.support_request_id else None,
        "task_id": str(conversation.internal_task_id) if conversation.internal_task_id else None,
    }


# Staff -------------------------------------------------------------------------------------------------------------


class StaffBase(APIView):
    permission_classes = [LIVE, HasCapability.of("conversations.reply")]

    def conversation(self, request, pk) -> Conversation:
        conversation = services.visible_conversations(request.user).filter(id=pk).first()
        if conversation is None:
            raise Http404
        return conversation


class InboxView(StaffBase):
    @extend_schema(
        tags=TAGS,
        summary="Inbox list (3.30)",
        description="{count, page, page_size, results: [{type: idea|conversation, id, channel, who: {name, phone, initials}, subject, preview, last_at, "
        "waiting_since, assignee, unread, status, handed_over_by, submission}], now}. Ideas show while the applicant wrote last. Poll every 10 seconds.",
        parameters=[
            OpenApiParameter("tab", OpenApiTypes.STR, enum=list(inbox.TABS)),
            OpenApiParameter("status", OpenApiTypes.STR, enum=list(Conversation.Status.values)),
            OpenApiParameter("channel", OpenApiTypes.STR, enum=list(inbox.CHANNELS)),
            OpenApiParameter("program", OpenApiTypes.UUID),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        live.mark_online(request.user)
        return api_success(data=inbox.inbox(request.user, request.query_params))


class InboxUnreadView(StaffBase):
    @extend_schema(tags=TAGS, summary="Inbox badge", description="{unread, unassigned}", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        live.mark_online(request.user)
        return api_success(data=inbox.unread_count(request.user))


class InboxPeopleView(StaffBase):
    @extend_schema(tags=TAGS, summary="People who take chats (Assign picker)", description="[{id, name, open, max_open, backup, online}]", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from django.db.models import Count, Q

        config = LiveChatSettings.load()
        limits = services.answerer_limits(config)
        online = live.online_user_ids()
        people = services.chat_takers(config).annotate(open=Count("assigned_conversations", filter=Q(assigned_conversations__status__in=services.OPEN)))
        return api_success(
            data=[
                {
                    "id": str(user.id),
                    "name": user.full_name or user.email,
                    "open": user.open,
                    "max_open": limits.get(str(user.id), {}).get("max_open", 5),
                    "backup": limits.get(str(user.id), {}).get("backup", False),
                    "online": str(user.id) in online,
                }
                for user in people.order_by("first_name", "last_name")
            ]
        )


class InboxSavedRepliesView(StaffBase):
    @extend_schema(
        tags=TAGS,
        summary="Saved replies officers can insert (3.28 ⑤, 3.30 ③)",
        description="[{id, title, body}] with body in the asked language (?lang=en|tn), English when Setswana is empty.",
        parameters=[OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        lang = "tn" if request.query_params.get("lang") == "tn" else "en"
        replies = []
        for item in LiveChatSettings.load().saved_replies or []:
            body = item.get("body") or {}
            text = (body.get(lang) or "").strip() or (body.get("en") or "").strip()
            if text:
                replies.append({"id": item.get("id") or "", "title": item.get("title") or text[:40], "body": text})
        return api_success(data=replies)


class ConversationView(StaffBase):
    @extend_schema(
        tags=TAGS,
        summary="One conversation with its messages",
        description="{conversation: {... person: {name, phone, email, district, language, ideas}, team_note}, messages: {results, last_id, typing}}. "
        "?after=<last_id> returns only newer messages; poll every 3 seconds. Opening it marks the person's messages as read.",
        parameters=[OpenApiParameter("after", OpenApiTypes.STR)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, pk):
        conversation = self.conversation(request, pk)
        services.mark_read(conversation, by_staff=True, user=request.user)
        live.mark_online(request.user)
        return api_success(data={"conversation": conversation_detail(conversation), "messages": _messages(conversation, request, for_staff=True)})

    @extend_schema(tags=TAGS, summary="Change the note for the team", request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def patch(self, request, pk):
        conversation = self.conversation(request, pk)
        if "team_note" not in request.data:
            raise ValidationError({"team_note": "Send team_note."})
        conversation.team_note = str(request.data.get("team_note") or "")[:2000]
        conversation.save(update_fields=["team_note", "updated_at"])
        return api_success(data=conversation_detail(conversation))


class TextSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=4000, allow_blank=True, required=False, default="")
    attachments = serializers.ListField(child=serializers.UUIDField(), required=False, max_length=5)


def _assets(ids, user):
    if not ids:
        return None
    from apps.communications.messaging import MessagingService

    return MessagingService._check_attachments(ids, user)


class ConversationActionView(StaffBase):
    """POST /api/inbox/conversations/{id}/<action>/: reply, note, take, assign, close, reopen, convert, typing."""

    ACTIONS = ("reply", "note", "take", "assign", "close", "reopen", "convert", "typing")

    @extend_schema(
        tags=TAGS,
        summary="Act on a conversation",
        description="reply {body, attachments?}: goes back on the person's channel (web, WhatsApp; USSD is a call-back). note {body}: staff only. "
        "take. assign {user_id}. close {reason}. reopen. convert {into: support_request|task, title?, due_date?}. typing (10 seconds, nothing saved).",
        request=OpenApiTypes.OBJECT,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, pk, action):
        if action not in self.ACTIONS:
            raise Http404
        conversation = self.conversation(request, pk)
        data = request.data
        if action == "typing":
            live.set_typing("conversation", conversation.id, "staff", _short(request.user))
            return api_success(data={"typing": True})
        if action in ("reply", "note"):
            serializer = TextSerializer(data=data)
            serializer.is_valid(raise_exception=True)
            if action == "reply":
                message = services.reply(conversation, serializer.validated_data["body"], actor=request.user, attachments=_assets(serializer.validated_data.get("attachments"), request.user))
            else:
                message = services.note(conversation, serializer.validated_data["body"], actor=request.user)
            return api_success(data=message_payload(message, for_staff=True, request=request), status_code=status.HTTP_201_CREATED)
        if action == "take":
            services.take(conversation, actor=request.user)
        elif action == "assign":
            from apps.accounts.models import User

            user = User.objects.filter(id=data.get("user_id"), is_active=True).first() if data.get("user_id") else None
            if user is None:
                raise ValidationError({"user_id": "Pick a person."})
            services.assign(conversation, user=user, actor=request.user)
        elif action == "close":
            services.close(conversation, reason=str(data.get("reason") or ""), actor=request.user)
        elif action == "reopen":
            services.reopen(conversation, actor=request.user)
        else:
            due = serializers.DateField(required=False, allow_null=True).run_validation(data.get("due_date")) if data.get("due_date") else None
            created = services.convert(conversation, into=str(data.get("into") or ""), actor=request.user, title=str(data.get("title") or ""), due_date=due)
            return api_success(data={**conversation_detail(conversation), "created_id": str(created.id)}, status_code=status.HTTP_201_CREATED)
        conversation.refresh_from_db()
        return api_success(data=conversation_detail(conversation))


# Settings (3.28) ---------------------------------------------------------------------------------------------------


class WindowSerializer(serializers.Serializer):
    opens = serializers.RegexField(r"^([01]\d|2[0-3]):[0-5]\d$")
    closes = serializers.RegexField(r"^([01]\d|2[0-3]):[0-5]\d$")

    def validate(self, attrs):
        if attrs["closes"] <= attrs["opens"]:
            raise serializers.ValidationError("Closing time must be after opening time.")
        return attrs


class AnswererSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=("person", "team"), default="person")
    id = serializers.UUIDField()
    max_open = serializers.IntegerField(min_value=1, max_value=50, default=5)
    backup = serializers.BooleanField(default=False)


class TextPairSerializer(serializers.Serializer):
    en = serializers.CharField(max_length=500)
    tn = serializers.CharField(max_length=500, allow_blank=True, default="")


class SavedReplySerializer(serializers.Serializer):
    id = serializers.CharField(max_length=40, required=False, allow_blank=True)
    title = serializers.CharField(max_length=120)
    body = TextPairSerializer()


class LiveChatSettingsSerializer(serializers.Serializer):
    enabled = serializers.BooleanField(required=False, help_text="The live_chat switch.")
    hours = serializers.DictField(child=WindowSerializer(many=True), required=False)
    holidays = serializers.ListField(child=serializers.DateField(), required=False)
    answerers = AnswererSerializer(many=True, required=False)
    roles = serializers.ListField(child=serializers.CharField(max_length=50), required=False)
    share_out = serializers.ChoiceField(choices=("pick", "take_turns"), required=False)
    welcome = TextPairSerializer(required=False)
    away = TextPairSerializer(required=False)
    handoff_on_ask_human = serializers.BooleanField(required=False)
    handoff_on_ai_unsure = serializers.BooleanField(required=False)
    whatsapp_follow_up_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)
    escalate_after_minutes = serializers.IntegerField(min_value=1, max_value=1440, required=False, allow_null=True)
    ask_rating = serializers.BooleanField(required=False)
    allow_guests = serializers.BooleanField(required=False)
    saved_replies = SavedReplySerializer(many=True, required=False)

    def validate_hours(self, value):
        unknown = set(value) - set(services.DAYS)
        if unknown:
            raise serializers.ValidationError(f"Days are: {', '.join(services.DAYS)}.")
        return {day: value.get(day, []) for day in services.DAYS}

    def validate_roles(self, value):
        from apps.accounts.models import Role

        known = set(Role.objects.filter(code__in=value, is_active=True).values_list("code", flat=True))
        missing = [code for code in value if code not in known]
        if missing:
            raise serializers.ValidationError(f"Unknown roles: {', '.join(missing)}.")
        return value


def settings_payload(config: LiveChatSettings) -> dict:
    from apps.platform_config.flags import is_enabled

    return {
        "enabled": is_enabled("live_chat"),
        "hours": config.hours,
        "holidays": config.holidays,
        "answerers": config.answerers,
        "roles": config.roles,
        "share_out": config.share_out,
        "welcome": config.welcome,
        "away": config.away,
        "handoff_on_ask_human": config.handoff_on_ask_human,
        "handoff_on_ai_unsure": config.handoff_on_ai_unsure,
        "whatsapp_follow_up_minutes": config.whatsapp_follow_up_minutes,
        "escalate_after_minutes": config.escalate_after_minutes,
        "ask_rating": config.ask_rating,
        "allow_guests": config.allow_guests,
        "saved_replies": config.saved_replies,
        "open_now": services.is_open(config),
    }


class LiveChatSettingsView(APIView):
    permission_classes = [HasCapability.of("settings.manage")]

    @extend_schema(tags=TAGS, summary="Live chat settings (3.28)", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=settings_payload(LiveChatSettings.load()))

    @extend_schema(tags=TAGS, summary="Change live chat settings (3.28)", description="Any of the fields. enabled turns the live_chat switch on or off.", request=LiveChatSettingsSerializer, responses=OpenApiTypes.OBJECT)
    def put(self, request):
        serializer = LiveChatSettingsSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        config = LiveChatSettings.load()
        before = settings_payload(config)
        if "enabled" in data:
            from apps.platform_config.flags import clear_flag_cache
            from apps.platform_config.models import FeatureFlag

            FeatureFlag.objects.filter(key="live_chat").update(enabled=data.pop("enabled"))
            clear_flag_cache()
        if "holidays" in data:
            data["holidays"] = [day.isoformat() for day in data["holidays"]]
        if "answerers" in data:
            data["answerers"] = [{**item, "id": str(item["id"])} for item in data["answerers"]]
        if "saved_replies" in data:
            data["saved_replies"] = [{**item, "id": item.get("id") or uuid.uuid4().hex[:12]} for item in data["saved_replies"]]
        for name, value in data.items():
            setattr(config, name, value)
        config.updated_by = request.user
        config.save()
        after = settings_payload(config)
        AuditService.log_action(actor=request.user, action_type="live_chat_settings_updated", target=config, before_state=before, after_state=after)
        return api_success(data=after, message="Saved.")


# Public help chat --------------------------------------------------------------------------------------------------


class HelpChatThrottle(AnonRateThrottle):
    scope = "help_chat"


class HelpChatUserThrottle(UserRateThrottle):
    scope = "help_chat"


class HelpChatStartSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=2000)
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)
    language = serializers.ChoiceField(choices=("en", "tn"), required=False, default="en")
    subject = serializers.CharField(max_length=200, required=False, allow_blank=True)


def _lang(request) -> str:
    lang = (request.query_params.get("lang") or "en").lower()
    return lang if lang in ("en", "tn") else "en"


def _own(request, pk) -> Conversation:
    """The person's own web chat: their account, or the token the start call gave a guest (X-Chat-Token)."""
    conversation = Conversation.objects.filter(id=pk, channel__in=[Conversation.Channel.WEB, Conversation.Channel.AI]).select_related("contact_user").first()
    if conversation is None:
        raise Http404
    token = request.headers.get("X-Chat-Token") or ""
    if request.user.is_authenticated and conversation.contact_user_id == request.user.id:
        return conversation
    if conversation.contact_user_id is None and token and token == conversation.access_token:
        return conversation
    raise Http404


class HelpChatStatusView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(tags=PUBLIC_TAGS, summary="Is live chat on and open? (help bubble)", description="{enabled, open_now, staff_online, allow_guests, welcome, away, ask_rating, hours: {mon..sun: [{opens, closes}]}, holidays: [upcoming dates], timezone}. Hours and messages only: never who answers or saved replies.", parameters=[OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=services.public_status(_lang(request)))


class HelpChatStartView(APIView):
    permission_classes = [AllowAny, LIVE]
    throttle_classes = [HelpChatThrottle, HelpChatUserThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="Start a help chat",
        description="Signed in: just message. Guests (when allowed): name and email too. Answers {conversation, token, messages}. Guests send the token back as "
        "X-Chat-Token. Outside opening hours the away message comes back as the first reply.",
        request=HelpChatStartSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        serializer = HelpChatStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        config = LiveChatSettings.load()
        user = request.user if request.user.is_authenticated else None
        if user is None:
            if not config.allow_guests:
                raise ValidationError({"detail": {"code": "sign_in", "detail": "Sign in to chat with us."}})
            if not (data.get("name") or "").strip() or not data.get("email"):
                raise ValidationError({"name": "Tell us your name and email so we can reply."})
        contact = {"user_id": str(user.id)} if user else {"name": data["name"].strip(), "email": data["email"]}
        conversation = services.open_handoff(channel="web", contact=contact, subject=data.get("subject") or data["message"][:80], transcript=[], language=data.get("language") or "en")
        services.person_message(conversation, data["message"], user=user)
        return api_success(
            data={
                "conversation": {"id": str(conversation.id), "status": conversation.status},
                "token": conversation.access_token if user is None else None,
                "messages": _messages(conversation, request, for_staff=False),
            },
            status_code=status.HTTP_201_CREATED,
        )


class HelpChatMineView(APIView):
    permission_classes = [IsAuthenticated, LIVE]

    @extend_schema(tags=PUBLIC_TAGS, summary="My open help chat, on any device", description="{conversation: {id, status}} for the signed-in person's latest web chat that is not closed, else {conversation: null}.", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        conversation = (
            Conversation.objects.filter(contact_user=request.user, channel__in=[Conversation.Channel.WEB, Conversation.Channel.AI])
            .exclude(status=Conversation.Status.CLOSED)
            .order_by("-updated_at")
            .first()
        )
        return api_success(data={"conversation": {"id": str(conversation.id), "status": conversation.status} if conversation else None})


class HelpChatView(APIView):
    permission_classes = [AllowAny, LIVE]

    @extend_schema(tags=PUBLIC_TAGS, summary="My help chat", description="{conversation: {id, status, ask_rating}, messages: {results, last_id, typing}, staff_online}. ?after=<last_id> for only new messages.", parameters=[OpenApiParameter("after", OpenApiTypes.STR)], responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        conversation = _own(request, pk)
        services.mark_read(conversation, by_staff=False)
        config = LiveChatSettings.load()
        return api_success(
            data={
                "conversation": {"id": str(conversation.id), "status": conversation.status, "ask_rating": config.ask_rating and conversation.status == Conversation.Status.CLOSED and conversation.satisfaction is None},
                "messages": _messages(conversation, request, for_staff=False),
                "staff_online": live.staff_online(),
            }
        )


class HelpChatActionView(APIView):
    permission_classes = [AllowAny, LIVE]

    @extend_schema(tags=PUBLIC_TAGS, summary="Write, type, rate or end my help chat", description="messages {body}. typing. rate {satisfaction: 1 to 5}. end: the person ends their own chat (403 for anyone else); returns {status, ask_rating}.", request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk, action):
        if action == "end":
            return self._end(request, pk)
        conversation = _own(request, pk)
        if action == "messages":
            serializer = TextSerializer(data=request.data)
            serializer.is_valid(raise_exception=True)
            user = request.user if request.user.is_authenticated else None
            message = services.person_message(conversation, serializer.validated_data["body"], user=user, attachments=_assets(serializer.validated_data.get("attachments"), user) if user else None)
            return api_success(data=message_payload(message, for_staff=False, request=request), status_code=status.HTTP_201_CREATED)
        if action == "typing":
            live.set_typing("conversation", conversation.id, "person", conversation.display_name or "The person")
            return api_success(data={"typing": True})
        if action == "rate":
            services.rate(conversation, request.data.get("satisfaction") or 0)
            return api_success(data={"satisfaction": conversation.satisfaction})
        raise Http404

    def _end(self, request, pk):
        """Only the chat's own person (their account, or the guest token) may end it; anyone else gets 403, recorded."""
        conversation = Conversation.objects.filter(id=pk, channel__in=[Conversation.Channel.WEB, Conversation.Channel.AI]).select_related("contact_user").first()
        if conversation is None:
            raise Http404
        try:
            conversation = _own(request, pk)
        except Http404:
            user = request.user if request.user.is_authenticated else None
            AuditService.log_action(actor=user, action_type="help_chat_end_refused", target=conversation, metadata={"signed_in": user is not None})
            logging.getLogger("security.access").warning("security.help_chat_end_refused conversation=%s signed_in=%s", conversation.id, user is not None)
            raise PermissionDenied("Only the person in this chat can end it.")
        user = request.user if request.user.is_authenticated else None
        services.leave(conversation, how="ended", user=user)
        from apps.conversations.models import LiveChatSettings

        return api_success(data={"status": conversation.status, "ask_rating": LiveChatSettings.load().ask_rating and conversation.satisfaction is None})
