from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


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
        ("published", "Published"),
        ("archived", "Archived"),
    ]

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

    def save(self, *args, **kwargs):
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
