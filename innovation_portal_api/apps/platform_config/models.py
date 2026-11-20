from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class FeatureFlag(TimeStampedModel):
    """A switch administrators turn on or off from Platform settings."""

    class Group(models.TextChoices):
        SIGN_IN = "sign_in", "Sign-in"
        IDEAS = "ideas", "Ideas"
        WEBSITE = "website", "Website"
        MESSAGING = "messaging", "Messaging"
        INTEGRATIONS = "integrations", "Integrations"

    key = models.SlugField(max_length=60, unique=True)
    label = models.CharField(max_length=120)
    description = models.CharField(max_length=300, blank=True)
    group = models.CharField(max_length=20, choices=Group.choices)
    enabled = models.BooleanField(default=False)
    is_public = models.BooleanField(default=False, help_text="Safe to show to the public site.")
    coming_soon = models.BooleanField(default=False, help_text="Shown but locked in the console.")
    ordering = models.PositiveIntegerField(default=0)
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="feature_flags_updated",
    )

    class Meta:
        ordering = ("group", "ordering", "key")

    def __str__(self) -> str:
        return f"{self.key}={'on' if self.enabled else 'off'}"


class IntegrationConnection(UUIDModel, TimeStampedModel):
    """Saved settings for one external provider (an SSO directory, an SMS gateway, ...).

    Non-secret settings live in ``config``; secrets are encrypted into ``secrets_encrypted``
    and never leave the server. At most one connection per kind is active.
    """

    class Kind(models.TextChoices):
        SSO = "sso", "Single sign-on"
        SMS = "sms", "SMS"
        EMAIL = "email", "Email"
        WHATSAPP = "whatsapp", "WhatsApp"
        TRANSLATION = "translation", "Translation"
        STORAGE = "storage", "Storage"
        AI = "ai", "AI helper"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        TESTED = "tested", "Tested"
        FAILED = "failed", "Test failed"
        ACTIVE = "active", "Active"
        DISABLED = "disabled", "Disabled"

    kind = models.CharField(max_length=20, choices=Kind.choices, db_index=True)
    provider = models.CharField(max_length=60)
    name = models.CharField(max_length=120)
    config = models.JSONField(default=dict, blank=True)
    secrets_encrypted = models.TextField(blank=True, default="")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT)
    is_active = models.BooleanField(default=False)
    last_tested_at = models.DateTimeField(null=True, blank=True)
    last_test_result = models.JSONField(default=dict, blank=True)
    activated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="integrations_activated"
    )
    activated_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="integrations_created"
    )
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="integrations_updated"
    )

    class Meta:
        ordering = ("kind", "-is_active", "-updated_at")
        constraints = [
            models.UniqueConstraint(
                fields=["kind"],
                condition=models.Q(is_active=True),
                name="uq_one_active_integration_per_kind",
            )
        ]

    def __str__(self) -> str:
        return f"{self.kind}:{self.provider}:{self.name}"


class SSOTrialSession(UUIDModel, TimeStampedModel):
    """A 'Try sign-in' attempt. Completing it never creates a user or a session."""

    connection = models.ForeignKey(IntegrationConnection, on_delete=models.CASCADE, related_name="sso_trials")
    state = models.CharField(max_length=120, unique=True)
    nonce = models.CharField(max_length=120)
    redirect_uri = models.URLField()
    started_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    result = models.JSONField(default=dict, blank=True)
