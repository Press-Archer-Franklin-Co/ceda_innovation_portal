"""AI helper (C3): what admins teach it, what it costs, and what it suggested.

Nothing here decides anything about an idea. Hints and related ideas are suggestions that a
person reads; introductions only happen when both innovators say yes.
"""

from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class Audience(models.TextChoices):
    INNOVATORS = "innovators", "Innovators"
    OFFICERS = "officers", "Officers"
    EVERYONE = "everyone", "Everyone"


class Language(models.TextChoices):
    ANY = "any", "Any language"
    EN = "en", "English"
    TN = "tn", "Setswana"


class Feature(models.TextChoices):
    DRAFT_CHECK = "draft_check", "Innovator guidance"
    HINTS = "hints", "Officer hints"
    RELATED = "related", "Idea matching"
    HELP = "help", "Help with the portal"
    WEB_CHAT = "web_chat", "Website help chat first answer"
    TRY_IT = "try_it", "Try it"
    CONNECTION_TEST = "connection_test", "Connection test"


class KnowledgeEntry(UUIDModel, TimeStampedModel):
    """A line of guidance an admin writes. Active entries go into every request for their audience."""

    title = models.CharField(max_length=160)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.EVERYONE)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.ANY)
    text = models.TextField()
    is_active = models.BooleanField(default=True)
    ordering = models.PositiveIntegerField(default=0)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("ordering", "created_at")

    def __str__(self) -> str:
        return self.title


class ManualPage(UUIDModel, TimeStampedModel):
    """One page of the user manual: text, screenshots and the portal page it explains."""

    title = models.CharField(max_length=160)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.ANY)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.EVERYONE)
    text = models.TextField()
    portal_path = models.CharField(max_length=255, blank=True, help_text="The page it is about, for example /dashboard or /staff/review.")
    is_active = models.BooleanField(default=True)
    ordering = models.PositiveIntegerField(default=0)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("ordering", "created_at")

    def __str__(self) -> str:
        return self.title


class ManualScreenshot(UUIDModel, TimeStampedModel):
    """A screenshot on a manual page. The file is kept in the media library."""

    page = models.ForeignKey(ManualPage, on_delete=models.CASCADE, related_name="screenshots")
    asset = models.ForeignKey("media_assets.MediaAsset", on_delete=models.PROTECT, related_name="+")
    caption = models.JSONField(default=dict, blank=True, help_text='{"en": "...", "tn": "..."}')
    ordering = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ("ordering", "created_at")


class UsageRecord(UUIDModel, TimeStampedModel):
    """One call to Claude (or one call that was skipped), for the usage report and the monthly limit."""

    feature = models.CharField(max_length=30, choices=Feature.choices, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    model = models.CharField(max_length=60, blank=True)
    ok = models.BooleanField(default=True)
    outcome = models.CharField(max_length=40, default="ok", help_text="ok, or why there was no answer (timeout, limit_reached, ...).")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cache_read_tokens = models.PositiveIntegerField(default=0)
    cache_write_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(max_digits=10, decimal_places=6, default=0)
    duration_ms = models.PositiveIntegerField(default=0)
    request_id = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ("-created_at",)


class CachedAnswer(UUIDModel, TimeStampedModel):
    """Hints and related ideas for a submission, kept until the submission (or the shortlist) changes."""

    feature = models.CharField(max_length=30, choices=Feature.choices)
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="assistant_answers")
    language = models.CharField(max_length=5, default="en")
    fingerprint = models.CharField(max_length=64)
    model = models.CharField(max_length=60, blank=True)
    data = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["feature", "submission", "language"], name="uq_assistant_cached_answer")]


class Introduction(UUIDModel, TimeStampedModel):
    """An officer suggests two innovators work together. Details are shared only when both say yes."""

    class Kind(models.TextChoices):
        SIMILAR = "similar", "Similar (could merge)"
        COMPLEMENTARY = "complementary", "Complementary (could work together)"

    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting for answers"
        AGREED = "agreed", "Both agreed"
        DECLINED = "declined", "Declined"

    class Answer(models.TextChoices):
        WAITING = "waiting", "Not answered"
        YES = "yes", "Yes"
        NO = "no", "No"

    first_submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="+")
    second_submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="+")
    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.COMPLEMENTARY)
    reason = models.TextField(blank=True, help_text="Why they could work together, shown to both innovators.")
    suggested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.WAITING, db_index=True)
    first_answer = models.CharField(max_length=10, choices=Answer.choices, default=Answer.WAITING)
    second_answer = models.CharField(max_length=10, choices=Answer.choices, default=Answer.WAITING)
    first_answered_at = models.DateTimeField(null=True, blank=True)
    second_answered_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("-created_at",)
