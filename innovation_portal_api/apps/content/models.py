import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.exceptions import ValidationError
from django.db import models
from django.utils import timezone

from apps.core.models import TimeStampedModel, UUIDModel


def unique_slug(model, text, *, exclude_pk=None, field="slug", max_length=200) -> str:
    from django.utils.text import slugify

    base = (slugify(text or "") or "item")[:max_length]
    slug, number = base, 2
    queryset = model.objects.all()
    if exclude_pk:
        queryset = queryset.exclude(pk=exclude_pk)
    while queryset.filter(**{field: slug}).exists():
        slug = f"{base}-{number}"
        number += 1
    return slug


class ContentItem(UUIDModel, TimeStampedModel):
    """
    News / announcement items shown in the public Innovation Feed.
    Up to 5 may be highlighted on the homepage.
    """

    CATEGORY_CHOICES = [
        ("announcement", "Announcement"),
        ("challenge_update", "Challenge Update"),
        ("winners", "Winners"),
        ("partnership", "Partnership"),
        ("success_story", "Success Story"),
    ]

    STATUS_CHOICES = [
        ("draft", "Draft"),
        ("pending_approval", "Waiting for approval"),
        ("scheduled", "Scheduled"),
        ("published", "Published"),
        ("archived", "Archived"),
    ]

    class PostType(models.TextChoices):
        NEWS = "news", "News"
        EVENT = "event", "Event"
        OPPORTUNITY = "opportunity", "Opportunity"
        RESULT = "result", "Result"
        NOTICE = "notice", "Notice"
        NEWSLETTER = "newsletter", "Newsletter"

    # Old category -> new type (used by the data migration and for posts saved with only a category).
    CATEGORY_TO_TYPE = {
        "announcement": "notice",
        "challenge_update": "news",
        "winners": "result",
        "partnership": "news",
        "success_story": "news",
    }
    TRANSLATABLE = ("title", "excerpt", "body")

    title = models.CharField(max_length=255)
    excerpt = models.TextField(max_length=500)
    body = models.TextField(blank=True, default="")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default="announcement")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="draft")
    image = models.FileField(upload_to="content/covers/", null=True, blank=True)
    tags = models.JSONField(default=list, blank=True)
    read_time = models.CharField(max_length=30, blank=True, default="")
    is_highlighted = models.BooleanField(
        default=False,
        db_index=True,
        help_text="Show on homepage highlights (max 5 at a time)",
    )
    highlight_priority = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        db_index=True,
        help_text="Homepage highlight order from 1 (lead story) to 5.",
    )
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="content_items",
    )
    # B6 posts -------------------------------------------------------------------
    type = models.CharField(max_length=20, choices=PostType.choices, default=PostType.NEWS, db_index=True)
    slug = models.SlugField(max_length=280, unique=True, null=True, blank=True)
    cover = models.ForeignKey("media_assets.MediaAsset", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"title": "...", "excerpt": "...", "body": "..."}}')
    show_in_news_flash = models.BooleanField(default=False, db_index=True)
    show_on_bulletin = models.BooleanField(default=False, db_index=True)
    pinned_until = models.DateTimeField(null=True, blank=True)
    mark_new_days = models.PositiveSmallIntegerField(default=7)
    event_starts_at = models.DateTimeField(null=True, blank=True, db_index=True)
    event_place = models.CharField(max_length=255, blank=True, default="")
    newsletter_issue = models.PositiveIntegerField(null=True, blank=True)
    view_count = models.PositiveIntegerField(default=0)
    send_to_subscribers = models.BooleanField(default=False, help_text="Email the post to subscribers when it goes live (R-29 b).")
    publish_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="Publish automatically at this time (after approval).")
    unpublish_at = models.DateTimeField(null=True, blank=True, db_index=True, help_text="Take down automatically at this time.")

    class Meta:
        ordering = ["-published_at", "-created_at"]
        verbose_name = "Content Item"
        verbose_name_plural = "Content Items"

    def __str__(self):
        return self.title

    def clean(self):
        if not self.is_highlighted:
            self.highlight_priority = None
        if self.is_highlighted:
            qs = ContentItem.objects.filter(is_highlighted=True)
            if self.pk:
                qs = qs.exclude(pk=self.pk)
            if qs.count() >= 5 and self.pk is None:
                raise ValidationError("Maximum 5 items can be highlighted on the homepage.")
            if self.highlight_priority is not None:
                if not 1 <= self.highlight_priority <= 5:
                    raise ValidationError({"highlight_priority": "Homepage highlight order must be between 1 and 5."})

    def clean_post_fields(self):
        """Type-specific rules for posts (B6). Called by the post serializer."""
        errors = {}
        if self.type == self.PostType.EVENT:
            if not self.event_starts_at:
                errors["event_starts_at"] = "Events need a start date and time."
            if not (self.event_place or "").strip():
                errors["event_place"] = "Events need a place."
        if self.type == self.PostType.NEWSLETTER and not self.newsletter_issue:
            errors["newsletter_issue"] = "Newsletters need an issue number."
        if self.publish_at and self.unpublish_at and self.unpublish_at <= self.publish_at:
            errors["unpublish_at"] = "Take-down time must be after the publish time."
        if errors:
            raise ValidationError(errors)

    @property
    def is_pinned(self) -> bool:
        return bool(self.pinned_until and self.pinned_until > timezone.now())

    @property
    def is_new(self) -> bool:
        if self.status != "published" or not self.published_at:
            return False
        return timezone.now() - self.published_at <= timezone.timedelta(days=self.mark_new_days or 0)

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = unique_slug(ContentItem, self.title, exclude_pk=self.pk)
        self.full_clean()
        if self.is_highlighted and self.highlight_priority is not None:
            ContentItem.objects.filter(
                is_highlighted=True,
                highlight_priority=self.highlight_priority,
            ).exclude(pk=self.pk).update(highlight_priority=None)
        super().save(*args, **kwargs)


class HackathonDetail(UUIDModel, TimeStampedModel):
    """
    Rich content block attached to a Program (hackathon type).
    OneToOne so each hackathon has at most one detail page.
    """

    program = models.OneToOneField(
        "programs.Program",
        on_delete=models.CASCADE,
        related_name="hackathon_detail",
    )
    banner_image = models.ImageField(upload_to="content/hackathon_banners/", null=True, blank=True)
    theme = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")
    rules = models.TextField(blank=True, default="")
    eligibility = models.TextField(blank=True, default="")
    prizes = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of {position, label, amount, description}',
    )
    faq = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of {question, answer}',
    )
    judges = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of {name, title, bio, photo_url}',
    )
    schedule = models.JSONField(
        default=list,
        blank=True,
        help_text='Array of {date, label, description}',
    )
    is_published = models.BooleanField(default=False)

    class Meta:
        verbose_name = "Hackathon Detail"
        verbose_name_plural = "Hackathon Details"

    def __str__(self):
        return f"Detail — {self.program}"


class HackathonMedia(UUIDModel, TimeStampedModel):
    """Photos / videos attached to a hackathon detail page."""

    MEDIA_TYPE_CHOICES = [
        ("photo", "Photo"),
        ("video", "Video"),
    ]

    hackathon_detail = models.ForeignKey(
        HackathonDetail,
        on_delete=models.CASCADE,
        related_name="media",
    )
    media_type = models.CharField(max_length=10, choices=MEDIA_TYPE_CHOICES, default="photo")
    file = models.FileField(upload_to="content/hackathon_media/")
    caption = models.CharField(max_length=255, blank=True, default="")
    order = models.PositiveIntegerField(default=0, db_index=True)

    class Meta:
        ordering = ["order", "created_at"]
        verbose_name = "Hackathon Media"
        verbose_name_plural = "Hackathon Media"

    def __str__(self):
        return f"{self.media_type} — {self.hackathon_detail}"


class SiteSettings(models.Model):
    """
    Singleton table (always exactly one row, pk=1).
    Stores global site configuration — currently the homepage hero video.
    """
    hero_video = models.FileField(
        upload_to="site/hero_videos/",
        null=True,
        blank=True,
        help_text="MP4/WebM video played as the homepage hero background.",
    )
    hero_video_muted = models.BooleanField(
        default=True,
        help_text="Whether the hero video plays muted by default.",
    )
    prize_money_label = models.CharField(
        max_length=50,
        blank=True,
        default="",
        help_text='Override label for prize money stat, e.g. "BWP 1.2M+". Leave blank to hide.',
    )
    solutions_deployed = models.PositiveIntegerField(
        default=0,
        help_text="Number of solutions deployed (manual override shown on public site).",
    )
    quote_rotation_seconds = models.PositiveSmallIntegerField(default=8, help_text="Seconds each leadership quote shows on the home page.")
    # Contact and footer details for the public shell (R-13). All optional.
    social_links = models.JSONField(default=list, blank=True, help_text='[{"network": "facebook", "url": "..."}]')
    whatsapp_number = models.CharField(max_length=32, blank=True, default="")
    ussd_code = models.CharField(max_length=32, blank=True, default="")
    call_centre_number = models.CharField(max_length=32, blank=True, default="")
    office_finder_url = models.URLField(max_length=500, blank=True, default="")
    help_centre_url = models.CharField(max_length=500, blank=True, default="")
    accessibility_url = models.CharField(max_length=500, blank=True, default="")
    footer_links = models.JSONField(default=list, blank=True, help_text='[{"label": "...", "url": "..."}]')
    languages_enabled = models.JSONField(default=list, blank=True, help_text='["en", "tn"]')

    class Meta:
        verbose_name = "Site Settings"
        verbose_name_plural = "Site Settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return "Site Settings"


class LeadershipCard(UUIDModel, TimeStampedModel):
    """
    Executive / leadership testimonial cards shown in the homepage carousel.
    Staff-manageable: name, title, committee role, quote, photo, ordering.
    Only active cards (is_active=True, within optional date window) are shown publicly.
    """

    full_name = models.CharField(max_length=255)
    job_title = models.CharField(max_length=255)
    committee_role = models.CharField(
        max_length=255, blank=True, default="",
        help_text="Optional subtitle, e.g. 'Innovation Committee Chairperson'",
    )
    quote = models.TextField(help_text="The testimonial / message from this leader.")
    photo = models.ImageField(
        upload_to="content/leadership/",
        null=True, blank=True,
        help_text="Portrait image — displayed as a circle.",
    )
    sort_order = models.PositiveIntegerField(
        default=0, db_index=True,
        help_text="Lower numbers appear first in the carousel.",
    )
    is_active = models.BooleanField(
        default=True, db_index=True,
        help_text="Only active cards are shown on the homepage.",
    )
    start_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Optional: show card only from this date/time.",
    )
    end_at = models.DateTimeField(
        null=True, blank=True,
        help_text="Optional: hide card after this date/time.",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name="leadership_cards",
    )
    # B6 part 2 (F): quotes are at most 180 characters, in English and Setswana; quotes
    # from officials go through approval before they show.
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"quote": "..."}}')
    is_official = models.BooleanField(default=False, help_text="A government or CEDA official: the quote needs approval.")
    approved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["sort_order", "created_at"]
        verbose_name = "Leadership Card"
        verbose_name_plural = "Leadership Cards"

    def __str__(self):
        return f"{self.full_name} — {self.job_title}"

    def clean(self):
        if self.start_at and self.end_at and self.start_at >= self.end_at:
            raise ValidationError({"end_at": "end_at must be after start_at."})
        if not self.full_name.strip():
            raise ValidationError({"full_name": "Full name is required."})
        if not self.job_title.strip():
            raise ValidationError({"job_title": "Job title is required."})
        if not self.quote.strip():
            raise ValidationError({"quote": "Quote / message is required."})
        tn_quote = ((self.translations or {}).get("tn") or {}).get("quote", "")
        if len(self.quote) > 180 or len(tn_quote or "") > 180:
            raise ValidationError({"quote": "Keep the quote to 180 characters or fewer."})

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)


class WinnerSpotlight(UUIDModel, TimeStampedModel):
    """Featured winners shown on the public homepage and hackathon detail pages."""

    POSITION_CHOICES = [
        ("1st", "1st Place"),
        ("2nd", "2nd Place"),
        ("3rd", "3rd Place"),
        ("runner_up", "Runner-up"),
        ("special", "Special Award"),
    ]

    program = models.ForeignKey(
        "programs.Program",
        on_delete=models.CASCADE,
        related_name="winner_spotlights",
    )
    team_name = models.CharField(max_length=255)
    project_name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    position = models.CharField(max_length=20, choices=POSITION_CHOICES, default="1st")
    members_count = models.PositiveIntegerField(default=1)
    year = models.PositiveIntegerField()
    tags = models.JSONField(default=list, blank=True)
    photo = models.ImageField(upload_to="content/winner_photos/", null=True, blank=True)
    submission = models.OneToOneField(
        "submissions.Submission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="winner_spotlight",
    )
    prize_label = models.CharField(max_length=255, blank=True, default="")
    prize_amount = models.CharField(max_length=120, blank=True, default="")
    is_featured = models.BooleanField(default=False, db_index=True, help_text="Show on homepage")

    class Meta:
        ordering = ["-year", "position"]
        verbose_name = "Winner Spotlight"
        verbose_name_plural = "Winner Spotlights"

    def __str__(self):
        return f"{self.team_name} — {self.project_name} ({self.year})"


class ApprovalRequest(UUIDModel, TimeStampedModel):
    """A request to publish something (a post, the home page, ...) that someone with the approver role decides."""

    class Status(models.TextChoices):
        PENDING = "pending", "Pending"
        APPROVED = "approved", "Approved"
        REJECTED = "rejected", "Rejected"
        WITHDRAWN = "withdrawn", "Withdrawn"

    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64, db_index=True)
    target = GenericForeignKey("content_type", "object_id")
    summary = models.CharField(max_length=255, blank=True, help_text="What is being approved, for the approvals list.")
    payload = models.JSONField(default=dict, blank=True, help_text="Snapshot of what was submitted (home page sections).")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="content_approval_requests")
    approver_roles = models.JSONField(default=list, blank=True, help_text="Role codes allowed to decide.")
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING, db_index=True)
    publish_at = models.DateTimeField(null=True, blank=True)
    languages = models.JSONField(default=list, blank=True, help_text='Languages the change touches, e.g. ["en", "tn"] (S2).')
    step_ids = models.JSONField(default=list, blank=True, help_text="The approval steps this change waits for (S2), frozen when it is sent.")
    comment = models.TextField(blank=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="content_approvals_decided")
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["content_type", "object_id", "status"])]


class Page(UUIDModel, TimeStampedModel):
    """A public page built from sections. Staff edit the draft rows (PageSection); visitors see the live PageVersion."""

    slug = models.SlugField(max_length=80, unique=True)
    title = models.CharField(max_length=255, blank=True)
    draft_version = models.PositiveIntegerField(default=1, help_text="Bumps on every draft save.")

    def __str__(self):
        return self.slug

    def live_version(self, at=None):
        at = at or timezone.now()
        return self.versions.filter(go_live_at__lte=at).order_by("-number").first()


class PageSection(UUIDModel, TimeStampedModel):
    """One draft section of a page. Types and their settings live in apps/content/sections.py."""

    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="sections")
    type = models.CharField(max_length=40)
    order = models.PositiveIntegerField(default=0)
    enabled = models.BooleanField(default=True)
    settings = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["order", "created_at"]


class PageVersion(UUIDModel, TimeStampedModel):
    """A published copy of a page's sections. The newest one whose go_live_at has passed is live."""

    page = models.ForeignKey(Page, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    sections = models.JSONField(default=list)
    go_live_at = models.DateTimeField(default=timezone.now, db_index=True)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    approval = models.ForeignKey(ApprovalRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ["-number"]
        constraints = [models.UniqueConstraint(fields=["page", "number"], name="uq_page_version_number")]


class Partner(UUIDModel, TimeStampedModel):
    class Tier(models.TextChoices):
        LEAD_SPONSOR = "lead_sponsor", "Lead sponsor"
        PARTNER = "partner", "Partner"
        SUPPORTER = "supporter", "Supporter"

    TIER_ORDER = {"lead_sponsor": 0, "partner": 1, "supporter": 2}

    name = models.CharField(max_length=255)
    short_label = models.CharField(max_length=60, blank=True)
    logo = models.ForeignKey("media_assets.MediaAsset", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    url = models.URLField(max_length=500, blank=True)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.PARTNER, db_index=True)
    tier_rank = models.PositiveSmallIntegerField(default=1, editable=False, db_index=True)
    order = models.PositiveIntegerField(default=0, help_text="Order within the tier.")
    show_on_home = models.BooleanField(default=False, db_index=True)
    show_from = models.DateTimeField(null=True, blank=True)
    show_until = models.DateTimeField(null=True, blank=True)
    programs = models.ManyToManyField("programs.Program", blank=True, related_name="partners")
    is_active = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ["tier_rank", "order", "name"]

    def clean(self):
        if self.show_from and self.show_until and self.show_until <= self.show_from:
            raise ValidationError({"show_until": "Show-until must be after show-from."})

    def save(self, *args, **kwargs):
        self.tier_rank = self.TIER_ORDER.get(self.tier, 9)
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name


class Story(UUIDModel, TimeStampedModel):
    """B6 part 2: a success story (1.6, 3.11). Stories about a real innovator need their consent first."""

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"
        ARCHIVED = "archived", "Archived"

    class Consent(models.TextChoices):
        NOT_NEEDED = "not_needed", "Not needed"
        NOT_ASKED = "not_asked", "Not asked yet"
        REQUESTED = "requested", "Asked, waiting"
        GIVEN = "given", "Given"
        DECLINED = "declined", "Declined"

    MAX_FEATURED = 3
    PLACES = ("home", "challenge", "stories")
    TRANSLATABLE = ("quote", "business", "place")

    person_name = models.CharField(max_length=255)
    business = models.CharField(max_length=255, blank=True)
    place = models.CharField(max_length=255, blank=True)
    sector = models.ForeignKey("reference.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    quote = models.CharField(max_length=200, blank=True)
    stats = models.JSONField(default=list, blank=True, help_text='[{"value": "40", "label": {"en": "jobs", "tn": "..."}}]')
    translations = models.JSONField(default=dict, blank=True)
    cover = models.ForeignKey("media_assets.MediaAsset", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    shows_on = models.JSONField(default=list, blank=True, help_text='Where it shows: "home", "challenge", "stories".')
    program = models.ForeignKey("programs.Program", on_delete=models.SET_NULL, null=True, blank=True, related_name="stories")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="stories_about_me", help_text="The innovator the story is about.")
    submission = models.ForeignKey("submissions.Submission", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    is_featured = models.BooleanField(default=False, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    consent_status = models.CharField(max_length=20, choices=Consent.choices, default=Consent.NOT_NEEDED)
    consent_requested_at = models.DateTimeField(null=True, blank=True)
    consent_decided_at = models.DateTimeField(null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ["-is_featured", "-published_at", "-created_at"]

    def __str__(self):
        return f"{self.person_name}: {self.business}"


class Subscriber(UUIDModel, TimeStampedModel):
    """B6 part 2: people who asked for news by email (double opt-in) or WhatsApp."""

    TOPICS = ("challenges", "news", "events", "results")

    email = models.EmailField(blank=True, db_index=True)
    phone = models.CharField(max_length=32, blank=True, help_text="For WhatsApp, once a provider exists.")
    topics = models.JSONField(default=list, blank=True)
    language = models.CharField(max_length=5, default="en")
    confirm_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    unsubscribe_token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    unsubscribed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    @property
    def is_active(self) -> bool:
        return self.unsubscribed_at is None and (self.confirmed_at is not None or (not self.email and bool(self.phone)))


class PostBlast(UUIDModel, TimeStampedModel):
    """A post sent to subscribers. WhatsApp stays pending until a provider exists."""

    post = models.ForeignKey(ContentItem, on_delete=models.CASCADE, related_name="blasts")
    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    email_count = models.PositiveIntegerField(default=0)
    whatsapp_pending = models.PositiveIntegerField(default=0)
    sent_at = models.DateTimeField(null=True, blank=True)


class ApprovalFlow(UUIDModel, TimeStampedModel):
    """S2: how website content gets approved: ordered steps, per language."""

    key = models.SlugField(max_length=40, unique=True, help_text='"content" for website content.')
    approvers_can_approve_own_work = models.BooleanField(default=True, help_text="People who can approve a step may approve their own change.")

    def __str__(self):
        return self.key


class ApprovalStep(UUIDModel, TimeStampedModel):
    class Language(models.TextChoices):
        ALL = "all", "All languages"
        EN = "en", "English"
        TN = "tn", "Setswana"

    flow = models.ForeignKey(ApprovalFlow, on_delete=models.CASCADE, related_name="steps")
    order = models.PositiveIntegerField(default=1)
    name = models.CharField(max_length=120, blank=True)
    capability = models.CharField(max_length=60, blank=True, help_text="Who may approve: a capability ...")
    role = models.ForeignKey("accounts.Role", on_delete=models.PROTECT, null=True, blank=True, related_name="+", help_text="... or a role.")
    approvals_needed = models.PositiveSmallIntegerField(default=1)
    language = models.CharField(max_length=5, choices=Language.choices, default=Language.ALL)

    class Meta:
        ordering = ["order", "created_at"]


class ApprovalDecision(UUIDModel, TimeStampedModel):
    """One person's approval of one step of an approval request."""

    request = models.ForeignKey(ApprovalRequest, on_delete=models.CASCADE, related_name="decisions")
    step = models.ForeignKey(ApprovalStep, on_delete=models.SET_NULL, null=True, related_name="+")
    step_order = models.PositiveIntegerField(default=1)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="+")
    own_work = models.BooleanField(default=False)

    class Meta:
        ordering = ["created_at"]
        constraints = [models.UniqueConstraint(fields=["request", "step", "decided_by"], name="uq_approval_decision_person_step")]


class PostMonthlyViews(UUIDModel, TimeStampedModel):
    """Views per post per calendar month (R-29 a). view_count on the post stays the all-time total."""

    post = models.ForeignKey(ContentItem, on_delete=models.CASCADE, related_name="monthly_views")
    month = models.DateField(help_text="First day of the month.")
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["post", "month"], name="uq_post_month_views")]
        indexes = [models.Index(fields=["month"])]



class HeroPhoto(UUIDModel, TimeStampedModel):
    """U7: the cut-out innovator photo in the home page banner (Hero photo block, 3.8).

    Staff upload a PNG whose background is already transparent. The server checks that,
    trims the fully transparent edges and keeps WebP and PNG copies at three heights
    (apps.content.hero_photo). The banner's settings point at it by id.
    """

    original = models.FileField(upload_to="hero_photos/originals/")
    filename = models.CharField(max_length=255, blank=True)
    size_bytes = models.PositiveIntegerField(default=0)
    width = models.PositiveIntegerField(default=0, help_text="After trimming the transparent edges.")
    height = models.PositiveIntegerField(default=0, help_text="After trimming the transparent edges.")
    # [{"height": 480, "width": 230, "webp": "hero_photos/<id>/480.webp", "png": "hero_photos/<id>/480.png"}, ...]
    variants = models.JSONField(default=list, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return self.filename or str(self.id)


class ResultEntry(UUIDModel, TimeStampedModel):
    """R-59 (3.37): how one winning or shortlisted entry shows on the public results (1.10)."""

    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="result_entries")
    submission = models.OneToOneField("submissions.Submission", on_delete=models.CASCADE, related_name="result_entry")
    show_on_results = models.BooleanField(default=True)
    order = models.PositiveIntegerField(default=0)
    story = models.JSONField(default=dict, blank=True, help_text='{"en": "...", "tn": "..."}')
    photo = models.ImageField(upload_to="content/result_photos/", null=True, blank=True)

    class Meta:
        ordering = ("order", "created_at")


class ResultsPageSettings(UUIDModel, TimeStampedModel):
    """R-59 (3.37): per challenge, whether the public results show entrants' names."""

    program = models.OneToOneField("programs.Program", on_delete=models.CASCADE, related_name="results_page_settings")
    show_names = models.BooleanField(default=True)
