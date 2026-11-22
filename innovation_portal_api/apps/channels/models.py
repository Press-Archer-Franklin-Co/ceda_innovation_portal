"""C2: WhatsApp and USSD journeys.

- ``ChannelConnection`` adds what a channel needs to a platform ``IntegrationConnection``
  (kind ``ussd`` or ``whatsapp``): the short code or number, the journey it runs and the
  random token in its webhook URL.
- ``Journey`` and ``JourneyNode`` are the staff draft that the builder edits. Publishing
  freezes the draft into a ``JourneyVersion``; live sessions keep the version they started on.
- ``JourneySession`` holds one person's walk through a journey: the live state (shared by
  every web worker, because it lives in the database) and the log used for activity reports.
  Answers to questions marked sensitive are never written to the step log.
"""

from __future__ import annotations

import secrets

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


def new_webhook_token() -> str:
    return secrets.token_urlsafe(24)


class Channel(models.TextChoices):
    USSD = "ussd", "USSD"
    WHATSAPP = "whatsapp", "WhatsApp"


class ChannelConnection(UUIDModel, TimeStampedModel):
    connection = models.OneToOneField(
        "platform_config.IntegrationConnection", on_delete=models.CASCADE, related_name="channel"
    )
    address = models.CharField(
        max_length=40, blank=True, help_text="USSD short code (for example *123#) or WhatsApp number."
    )
    journey = models.ForeignKey(
        "channels.Journey", on_delete=models.SET_NULL, null=True, blank=True, related_name="connections"
    )
    webhook_token = models.CharField(max_length=64, unique=True, default=new_webhook_token)

    class Meta:
        ordering = ("connection__kind", "connection__name")

    def __str__(self) -> str:
        return f"{self.connection.kind}:{self.connection.name}"


class Journey(UUIDModel, TimeStampedModel):
    class ChannelChoice(models.TextChoices):
        USSD = "ussd", "USSD"
        WHATSAPP = "whatsapp", "WhatsApp"
        BOTH = "both", "USSD and WhatsApp"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    name = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)
    channel = models.CharField(max_length=10, choices=ChannelChoice.choices, default=ChannelChoice.BOTH)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.DRAFT)
    # Number of the latest published version; 0 before the first publish.
    version = models.PositiveIntegerField(default=0)
    default_language = models.CharField(max_length=5, default="en")
    start_key = models.CharField(max_length=40, blank=True)
    # True when the draft nodes differ from the latest published version.
    has_unpublished_changes = models.BooleanField(default=True)
    published_at = models.DateTimeField(null=True, blank=True)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("name",)

    def __str__(self) -> str:
        return self.name

    def runs_on(self, channel: str) -> bool:
        return self.channel in (channel, self.ChannelChoice.BOTH)

    @property
    def latest_version(self):
        return self.versions.order_by("-number").first()


class JourneyNode(UUIDModel, TimeStampedModel):
    class Type(models.TextChoices):
        MENU = "menu", "Menu"
        MESSAGE = "message", "Message"
        QUESTION = "question", "Question"
        SAVE_DRAFT = "save_draft", "Save to an idea draft"
        LOOKUP = "lookup", "Look up"
        CONDITION = "condition", "Condition"
        SUBSCRIBE = "subscribe", "Subscribe"
        LANGUAGE = "language", "Language"
        HANDOFF = "handoff", "Talk to a person"
        END = "end", "End"
        FILE = "file", "Ask for a file"
        SUBMIT = "submit", "Send the idea"
        FORM_QUESTIONS = "form_questions", "Ask the form's questions"
        MY_IDEAS = "my_ideas", "Show my ideas"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="nodes")
    key = models.SlugField(max_length=40, help_text="Short id, unique in the journey. Edges point at it.")
    type = models.CharField(max_length=20, choices=Type.choices)
    title = models.CharField(max_length=80, blank=True, help_text="Name on the canvas. Never shown to the person.")
    text = models.JSONField(default=dict, blank=True, help_text='{"en": "...", "tn": "..."}')
    settings = models.JSONField(default=dict, blank=True)
    next_key = models.CharField(max_length=40, blank=True, help_text="Where to go next (menus and conditions keep their own edges in settings).")
    position = models.JSONField(default=dict, blank=True, help_text='{"x": 0, "y": 0} on the canvas.')

    class Meta:
        ordering = ("journey", "created_at")
        constraints = [models.UniqueConstraint(fields=["journey", "key"], name="uq_journey_node_key")]

    def __str__(self) -> str:
        return f"{self.journey_id}:{self.key}"

    def as_graph_node(self) -> dict:
        return {"key": self.key, "type": self.type, "title": self.title, "text": self.text or {}, "settings": self.settings or {}, "next": self.next_key}


class JourneyVersion(UUIDModel, TimeStampedModel):
    """A frozen copy of a journey's nodes, made when it is published."""

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    graph = models.JSONField(default=dict)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    warnings = models.JSONField(default=list, blank=True)

    class Meta:
        ordering = ("journey", "-number")
        constraints = [models.UniqueConstraint(fields=["journey", "number"], name="uq_journey_version_number")]


class JourneySession(UUIDModel, TimeStampedModel):
    class Status(models.TextChoices):
        ACTIVE = "active", "In progress"
        COMPLETED = "completed", "Finished"
        HANDED_OVER = "handed_over", "Handed to a person"
        ABANDONED = "abandoned", "Left early"
        TIMED_OUT = "timed_out", "Timed out"

    channel = models.CharField(max_length=10, choices=Channel.choices)
    connection = models.ForeignKey(ChannelConnection, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="sessions")
    # Empty for a simulator run on the draft.
    version = models.ForeignKey(JourneyVersion, on_delete=models.SET_NULL, null=True, blank=True, related_name="sessions")
    is_simulation = models.BooleanField(default=False, db_index=True)
    external_id = models.CharField(max_length=120, db_index=True, help_text="The operator's session id (USSD) or the phone number (WhatsApp).")
    phone = models.CharField(max_length=32, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    language = models.CharField(max_length=5, default="en")
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.ACTIVE, db_index=True)
    current_node = models.CharField(max_length=40, blank=True)
    state = models.JSONField(default=dict, blank=True)
    step_count = models.PositiveIntegerField(default=0)
    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    last_activity_at = models.DateTimeField(db_index=True)
    last_inbound_at = models.DateTimeField(null=True, blank=True, help_text="WhatsApp: the 24 hour free-text window starts here.")
    ended_at = models.DateTimeField(null=True, blank=True)
    draft = models.ForeignKey("submissions.ApplicationDraft", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    conversation_id = models.CharField(max_length=64, blank=True, help_text="Inbox conversation made by Talk to a person.")

    class Meta:
        ordering = ("-started_at",)
        indexes = [models.Index(fields=["channel", "external_id", "status"], name="ix_journey_session_lookup")]


class JourneySessionStep(models.Model):
    """One screen shown and the answer given. Sensitive answers are stored as hidden."""

    HIDDEN = "[hidden]"

    session = models.ForeignKey(JourneySession, on_delete=models.CASCADE, related_name="steps")
    node_key = models.CharField(max_length=40)
    node_type = models.CharField(max_length=20)
    input = models.CharField(max_length=300, blank=True)
    provider_message_id = models.CharField(max_length=80, blank=True, db_index=True, help_text="The provider's id for the message answered here (WhatsApp).")
    attachment_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ("session", "id")
