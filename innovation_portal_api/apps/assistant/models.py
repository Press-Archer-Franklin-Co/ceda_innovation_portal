"""AI helper (C3): what admins teach it, what it costs, and what it suggested.

Nothing here decides anything about an idea. Hints and related ideas are suggestions that a
person reads; introductions only happen when both innovators say yes.
"""

from django.conf import settings
from django.contrib.postgres.indexes import GinIndex
from django.contrib.postgres.search import SearchVectorField
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
    DRAFT_CHECK = "draft_check", "Idea coach"
    DOCUMENT_REVIEW = "document_review", "Document review"
    HINTS = "hints", "Officer summary"
    RELATED = "related", "Similar ideas"
    IDEA_PROFILE = "idea_profile", "Idea profiles"
    GUIDE = "guide", "Need help guide"
    BUILDER_DRAFT = "builder_draft", "Draft a form or workflow"
    TRANSLATE = "translate", "Setswana suggestions"
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
    """One call to the AI service (or one call that was skipped), for the usage report and the monthly limit."""

    feature = models.CharField(max_length=30, choices=Feature.choices, db_index=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    model = models.CharField(max_length=80, blank=True)
    provider = models.CharField(max_length=40, blank=True, db_index=True)
    connection = models.ForeignKey("platform_config.IntegrationConnection", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    environment = models.CharField(max_length=10, blank=True)
    ok = models.BooleanField(default=True)
    outcome = models.CharField(max_length=40, default="ok", help_text="ok, or why there was no answer (timeout, limit_reached, ...).")
    error_detail = models.CharField(max_length=300, blank=True, help_text="Plain words for admins. Never the key or the text sent.")
    input_tokens = models.PositiveIntegerField(default=0)
    output_tokens = models.PositiveIntegerField(default=0)
    cache_read_tokens = models.PositiveIntegerField(default=0)
    cache_write_tokens = models.PositiveIntegerField(default=0)
    cost_usd = models.DecimalField(
        max_digits=10, decimal_places=6, null=True, blank=True, help_text="Empty when the connection has no prices (cost not set)."
    )
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


# -- Copilot (A1 to A6) ------------------------------------------------------------------------------

FEATURE_DEFAULTS = {
    "draft_check": True,
    "document_review": True,
    "hints": True,
    "related": True,
    "idea_profile": True,
    "guide": True,
    "builder_draft": True,
    "translate": True,
    "web_chat": True,
    "help": True,
}


class AssistantSettings(TimeStampedModel):
    """One row (3.34b): which keys are in use, which service each feature uses, the limit and the privacy switches."""

    class Keys(models.TextChoices):
        TEST = "test", "Test keys"
        LIVE = "live", "Live keys"

    keys_in_use = models.CharField(max_length=10, choices=Keys.choices, default=Keys.TEST)
    routes = models.JSONField(default=dict, blank=True, help_text='{"draft_check": {"provider": "anthropic", "connection": "<uuid>", "model": "claude-sonnet-5-5"}}')
    features = models.JSONField(default=dict, blank=True, help_text='{"guide": false} switches one feature off. Missing means on.')
    monthly_limit_usd = models.DecimalField(max_digits=10, decimal_places=2, default=50)
    send_names = models.BooleanField(default=False, help_text="Send innovator names to the AI service.")
    guests_can_use_guide = models.BooleanField(default=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    @classmethod
    def load(cls) -> "AssistantSettings":
        row = cls.objects.order_by("pk").first()
        return row if row is not None else cls.objects.create()

    def feature_on(self, feature: str) -> bool:
        return bool((self.features or {}).get(str(feature), FEATURE_DEFAULTS.get(str(feature), True)))


class KnowledgeDocument(UUIDModel, TimeStampedModel):
    """A policy, guideline, criteria or manual file admins upload. Read into chunks in the background."""

    class Kind(models.TextChoices):
        POLICY = "policy", "Policy"
        GUIDELINE = "guideline", "Guideline"
        EVALUATION_CRITERIA = "evaluation_criteria", "Evaluation criteria"
        FORM_INSTRUCTIONS = "form_instructions", "Form instructions"
        FAQ = "faq", "FAQ"
        USER_MANUAL = "user_manual", "User manual"
        OTHER = "other", "Other"

    class Language(models.TextChoices):
        EN = "en", "English"
        TN = "tn", "Setswana"
        BOTH = "both", "English and Setswana"

    class Status(models.TextChoices):
        READING = "reading", "Reading"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    title = models.CharField(max_length=200)
    asset = models.ForeignKey("media_assets.MediaAsset", on_delete=models.PROTECT, related_name="+")
    kind = models.CharField(max_length=30, choices=Kind.choices, default=Kind.GUIDELINE)
    audience = models.CharField(max_length=20, choices=Audience.choices, default=Audience.EVERYONE)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.EN)
    is_active = models.BooleanField(default=True)
    text = models.TextField(blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.READING, db_index=True)
    error = models.CharField(max_length=300, blank=True)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.title


class KnowledgeChunk(UUIDModel, TimeStampedModel):
    document = models.ForeignKey(KnowledgeDocument, on_delete=models.CASCADE, related_name="chunks")
    order = models.PositiveIntegerField(default=0)
    text = models.TextField()
    search_terms = models.JSONField(default=list, blank=True, help_text="English and Setswana words the AI wrote once at upload.")
    search_text = models.TextField(blank=True, default="")
    search_vector = SearchVectorField(null=True, blank=True)

    class Meta:
        ordering = ("document", "order")
        indexes = [
            GinIndex(fields=["search_vector"], name="assistant_chunk_fts"),
            GinIndex(fields=["text"], name="assistant_chunk_trgm", opclasses=["gin_trgm_ops"]),
            GinIndex(fields=["search_text"], name="assistant_chunk_terms_trgm", opclasses=["gin_trgm_ops"]),
        ]


class IdeaProfile(TimeStampedModel):
    """One per sent submission: how it matches other ideas across languages (staff only)."""

    submission = models.OneToOneField("submissions.Submission", on_delete=models.CASCADE, related_name="idea_profile", primary_key=True)
    summary_en = models.TextField(blank=True)
    keywords_en = models.JSONField(default=list, blank=True)
    keywords_tn = models.JSONField(default=list, blank=True)
    inputs = models.JSONField(default=list, blank=True)
    outputs = models.JSONField(default=list, blank=True)
    serves = models.JSONField(default=list, blank=True)
    sector = models.ForeignKey("reference.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    district = models.ForeignKey("reference.District", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    source_language = models.CharField(max_length=5, blank=True)
    search_text = models.TextField(blank=True, default="")
    fingerprint = models.CharField(max_length=64, blank=True)
    model = models.CharField(max_length=80, blank=True)

    class Meta:
        indexes = [GinIndex(fields=["search_text"], name="assistant_profile_trgm", opclasses=["gin_trgm_ops"])]


class DocumentReview(UUIDModel, TimeStampedModel):
    """A saved review of one file version in one language."""

    document = models.ForeignKey("documents.SubmissionDocument", on_delete=models.CASCADE, related_name="assistant_reviews")
    version = models.CharField(max_length=120)
    language = models.CharField(max_length=5, default="en")
    model = models.CharField(max_length=80, blank=True)
    data = models.JSONField(default=dict)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["document", "version", "language"], name="uq_assistant_document_review")]


class AIDraft(UUIDModel, TimeStampedModel):
    """Create with AI (B2, 3.41): a description and the draft form and workflow it produced.

    Drafts only. Publishing uses the existing publish endpoints and approval steps.
    """

    class Make(models.TextChoices):
        FORM = "form", "Form"
        WORKFLOW = "workflow", "Workflow"
        BOTH = "both", "Form and workflow"

    class Status(models.TextChoices):
        DRAFTING = "drafting", "Drafting"
        READY = "ready", "Ready to check"
        SENT_FOR_APPROVAL = "sent_for_approval", "Sent for approval"
        PUBLISHED = "published", "Published"
        DISCARDED = "discarded", "Discarded"

    description = models.TextField()
    conversation = models.JSONField(default=list, blank=True)
    make = models.CharField(max_length=10, choices=Make.choices, default=Make.BOTH)
    program = models.ForeignKey("programs.Program", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    general_ideas = models.BooleanField(default=False)
    language = models.CharField(max_length=5, default="en")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFTING, db_index=True)
    proposal = models.JSONField(default=dict, blank=True, help_text="The AI's last answer (form and workflow drafts).")
    draft_form = models.ForeignKey("programs.SubmissionForm", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    draft_workflow = models.ForeignKey("workflow.WorkflowDefinition", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    checks = models.JSONField(default=list, blank=True)
    test_result = models.JSONField(default=dict, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")

    class Meta:
        ordering = ("-created_at",)
