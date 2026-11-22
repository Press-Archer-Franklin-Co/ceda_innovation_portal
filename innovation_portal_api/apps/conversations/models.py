"""C1: conversations that are not about one idea (website help chat, hand-overs from WhatsApp, USSD and the AI helper),
and the live chat settings. Idea messages stay in apps.communications (B3)."""

import secrets

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


def _token() -> str:
    return secrets.token_urlsafe(24)


class Conversation(UUIDModel, TimeStampedModel):
    class Channel(models.TextChoices):
        WEB = "web", "Website chat"
        WHATSAPP = "whatsapp", "WhatsApp"
        USSD = "ussd", "USSD call-back"
        AI = "ai", "AI helper hand-over"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        ASSIGNED = "assigned", "Assigned"
        CLOSED = "closed", "Closed"

    channel = models.CharField(max_length=20, choices=Channel.choices, db_index=True)
    contact_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="conversations")
    contact_phone = models.CharField(max_length=30, blank=True, db_index=True)
    contact_email = models.EmailField(blank=True)
    contact_name = models.CharField(max_length=200, blank=True)
    subject = models.CharField(max_length=200, blank=True)
    language = models.CharField(max_length=5, default="en")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.WAITING, db_index=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="assigned_conversations")
    submission = models.ForeignKey("submissions.Submission", on_delete=models.SET_NULL, null=True, blank=True, related_name="conversations")
    handed_over_by = models.CharField(max_length=20, blank=True, help_text="Where it came from before the Inbox: ai, whatsapp, ussd.")
    reason = models.CharField(max_length=500, blank=True)
    team_note = models.TextField(blank=True, help_text="Note for the team (side panel). Never shown to the person.")
    last_message_at = models.DateTimeField(null=True, blank=True, db_index=True)
    first_response_at = models.DateTimeField(null=True, blank=True)
    escalated_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    closed_reason = models.CharField(max_length=300, blank=True)
    satisfaction = models.PositiveSmallIntegerField(null=True, blank=True, help_text="1 to 5, when asked at the end.")
    access_token = models.CharField(max_length=64, default=_token, unique=True, help_text="Lets a guest read their own web chat.")
    support_request = models.ForeignKey("support.SupportRequest", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    internal_task = models.ForeignKey("support.InternalTask", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("-last_message_at", "-created_at")
        indexes = [models.Index(fields=["status", "assignee"])]

    @property
    def display_name(self) -> str:
        if self.contact_user_id and (self.contact_user.full_name or "").strip():
            return self.contact_user.full_name
        return self.contact_name or ""


class ConversationMessage(UUIDModel, TimeStampedModel):
    class Author(models.TextChoices):
        PERSON = "person", "The person"
        STAFF = "staff", "Staff"
        BOT = "bot", "AI helper or journey"
        SYSTEM = "system", "System"

    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name="messages")
    author_role = models.CharField(max_length=20, choices=Author.choices)
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    body = models.TextField(blank=True)
    is_internal = models.BooleanField(default=False, help_text="Internal note: staff only.")
    attachments = models.ManyToManyField("media_assets.MediaAsset", blank=True, related_name="+")
    delivery = models.CharField(max_length=200, blank=True, help_text="What happened when sent on WhatsApp, or why it was not.")
    read_by_person_at = models.DateTimeField(null=True, blank=True)
    read_by_staff_at = models.DateTimeField(null=True, blank=True)
    read_by_staff = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("created_at",)
        indexes = [models.Index(fields=["conversation", "created_at"])]


def default_hours() -> dict:
    day = [{"opens": "07:30", "closes": "16:30"}]
    return {"mon": day, "tue": day, "wed": day, "thu": day, "fri": [{"opens": "07:30", "closes": "16:00"}], "sat": [], "sun": []}


def default_welcome() -> dict:
    return {"en": "Hello! An officer will reply in a few minutes. You can keep browsing.", "tn": "Dumela! Motlhankedi o tla araba mo metsotsong e le mmalwa. O ka tswelela o bala."}


def default_away() -> dict:
    return {
        "en": "We are closed now. Leave a message and we will reply on the next working day.",
        "tn": "Re tswetse jaanong. Tlogela molaetsa mme re tla araba ka letsatsi le le latelang la tiro.",
    }


class LiveChatSettings(UUIDModel, TimeStampedModel):
    """3.28: one row. The on/off switch is the feature flag live_chat."""

    hours = models.JSONField(default=default_hours, help_text='{"mon": [{"opens": "07:30", "closes": "16:30"}], ..., "sun": []}')
    holidays = models.JSONField(default=list, blank=True, help_text='Closed all day: ["2026-12-25", ...]')
    answerers = models.JSONField(default=list, blank=True, help_text='[{"kind": "person"|"team", "id": "...", "max_open": 5, "backup": false}]')
    roles = models.JSONField(default=list, blank=True, help_text="Role codes whose holders take chats, as well as the answerers.")
    share_out = models.CharField(max_length=20, choices=(("pick", "People pick chats"), ("take_turns", "Hand out in turn to whoever is online")), default="pick")
    welcome = models.JSONField(default=default_welcome)
    away = models.JSONField(default=default_away)
    handoff_on_ask_human = models.BooleanField(default=True)
    handoff_on_ai_unsure = models.BooleanField(default=True)
    whatsapp_follow_up_minutes = models.PositiveIntegerField(null=True, blank=True, default=10, help_text="Follow up on WhatsApp if nobody picks up. Empty: off.")
    escalate_after_minutes = models.PositiveIntegerField(null=True, blank=True, default=15, help_text="Tell a manager about unanswered chats. Empty: off.")
    ask_rating = models.BooleanField(default=True)
    allow_guests = models.BooleanField(default=False)
    saved_replies = models.JSONField(default=list, blank=True, help_text='[{"id": "...", "title": "...", "body": {"en": "...", "tn": "..."}}]')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    @classmethod
    def load(cls) -> "LiveChatSettings":
        row = cls.objects.order_by("created_at").first()
        return row or cls.objects.create()
