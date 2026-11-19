import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

from apps.core.constants import ProgramAudience, ProgramStatus, ProgramTypeCode, SubmissionFormFieldType
from apps.core.models import AuditMetadataMixin, TimeStampedModel, UUIDModel


def default_form_languages():
    return ["en", "tn"]


class FieldWidth(models.TextChoices):
    QUARTER = "quarter", "Quarter"
    HALF = "half", "Half"
    THREE_QUARTER = "three_quarter", "Three quarters"
    FULL = "full", "Full"


class ProgramType(UUIDModel, TimeStampedModel):
    code = models.CharField(max_length=50, choices=ProgramTypeCode.choices, unique=True)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True)

    def __str__(self) -> str:
        return self.name


class ChallengeTheme(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=255, unique=True)
    description = models.TextField(blank=True)


class TermsAndConditions(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    content = models.TextField(blank=True)
    document_url = models.URLField(max_length=500, blank=True)
    pdf_file = models.FileField(upload_to='terms/', null=True, blank=True)
    active = models.BooleanField(default=True)

    def get_document_link(self):
        """Returns the best available document link: uploaded file URL takes priority over external URL."""
        if self.pdf_file:
            return self.pdf_file.url
        return self.document_url or None


class Program(UUIDModel, TimeStampedModel, AuditMetadataMixin):
    title = models.CharField(max_length=255)
    slug = models.SlugField(unique=True, max_length=280)
    description = models.TextField()
    program_type = models.ForeignKey(ProgramType, on_delete=models.PROTECT, related_name="programs")
    status = models.CharField(max_length=30, choices=ProgramStatus.choices, default=ProgramStatus.DRAFT, db_index=True)
    opening_date = models.DateTimeField()
    closing_date = models.DateTimeField()
    screening_start = models.DateTimeField(null=True, blank=True)
    screening_end = models.DateTimeField(null=True, blank=True)
    judging_start = models.DateTimeField(null=True, blank=True)
    judging_end = models.DateTimeField(null=True, blank=True)
    event_date = models.DateTimeField(null=True, blank=True)
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="owned_programs")
    max_team_size = models.PositiveIntegerField(null=True, blank=True)
    is_public = models.BooleanField(default=False)
    allow_team_submission = models.BooleanField(default=True)
    allow_individual_submission = models.BooleanField(default=True)
    terms_and_conditions = models.ForeignKey(TermsAndConditions, on_delete=models.SET_NULL, null=True, blank=True)
    published_at = models.DateTimeField(null=True, blank=True)
    opens_at = models.DateTimeField(null=True, blank=True)
    closes_at = models.DateTimeField(null=True, blank=True)
    evaluation_opens_at = models.DateTimeField(null=True, blank=True)
    evaluation_closes_at = models.DateTimeField(null=True, blank=True)
    results_publish_at = models.DateTimeField(null=True, blank=True)
    audience = models.CharField(max_length=20, choices=ProgramAudience.choices, default=ProgramAudience.BOTH)
    max_entries_per_person = models.PositiveIntegerField(null=True, blank=True, help_text="Leave blank for no limit.")
    marking_criteria = models.ForeignKey(
        "evaluation.MarkingCriteria",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="challenge_programs",
    )
    results_announced_at = models.DateTimeField(null=True, blank=True)
    results_hold_reason = models.TextField(blank=True)
    is_general_intake = models.BooleanField(
        default=False,
        db_index=True,
        help_text="The always-open programme that ideas without a chosen challenge belong to.",
    )
    sectors = models.ManyToManyField("reference.Sector", blank=True, related_name="programs")
    next_panel_at = models.DateTimeField(null=True, blank=True, help_text="Next review panel date shown to innovators.")
    form = models.ForeignKey(
        "programs.SubmissionForm",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="programs",
        related_query_name="program",
        help_text="The form applicants fill in. One form can be used by several programmes.",
    )
    # B5: what the public challenge page shows. English in these columns, Setswana in translations.
    summary = models.CharField(max_length=300, blank=True, default="")
    problem_statement = models.TextField(blank=True, default="")
    support_headline = models.CharField(max_length=160, blank=True, default="", help_text='For example "Up to P150 000 plus mentoring".')
    support_package = models.JSONField(default=list, blank=True, help_text='[{"title": {en, tn}, "amount_label": "...", "description": {en, tn}}]')
    who_can_enter = models.TextField(blank=True, default="")
    where = models.CharField(max_length=255, blank=True, default="")
    what_we_look_for = models.JSONField(default=list, blank=True, help_text='[{"en": "...", "tn": "..."}]')
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"summary": "...", "problem_statement": "...", ...}}')
    cover = models.ForeignKey("media_assets.MediaAsset", on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    pass_mark = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="0 to 100 on the weighted score. Copied to the judging stage.")
    reviewers_per_idea = models.PositiveSmallIntegerField(null=True, blank=True, help_text="Judges who mark each entry. Default: every judge.")

    TRANSLATABLE = ("summary", "problem_statement", "support_headline", "who_can_enter", "where")

    class Meta:
        indexes = [models.Index(fields=["status", "program_type"]), models.Index(fields=["opening_date", "closing_date"])]

    @property
    def submission_form(self):
        """The programme's form (kept so code written for the old one-to-one link keeps working)."""
        return self.form

    def save(self, *args, **kwargs):
        if not self.slug:
            self.slug = slugify(self.title)
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return self.title

    @property
    def is_innovation_challenge(self):
        return self.program_type.code == ProgramTypeCode.INNOVATION_CHALLENGE

    @property
    def marking_closes_at(self):
        return self.evaluation_closes_at or self.judging_end

    @property
    def submission_opens_at(self):
        return self.opens_at or self.opening_date

    @property
    def submission_closes_at(self):
        return self.closes_at or self.closing_date

    def is_submission_open(self, at=None):
        at = at or timezone.now()
        if self.status in {ProgramStatus.CLOSED, ProgramStatus.ARCHIVED}:
            return False
        opens_at = self.submission_opens_at
        closes_at = self.submission_closes_at
        if not opens_at or not closes_at:
            return True
        return opens_at <= at <= closes_at

    def is_evaluation_open(self, at=None):
        at = at or timezone.now()
        opens = self.evaluation_opens_at or self.judging_start
        closes = self.evaluation_closes_at or self.judging_end
        if not opens or not closes:
            opens = self.submission_opens_at
            closes = self.submission_closes_at
            if not opens or not closes:
                return True
        return opens <= at <= closes

    def availability_summary(self, at=None):
        at = at or timezone.now()
        return {
            "is_submission_open": self.is_submission_open(at),
            "is_evaluation_open": self.is_evaluation_open(at),
            "submission_opens_at": self.submission_opens_at,
            "submission_closes_at": self.submission_closes_at,
            "evaluation_opens_at": self.evaluation_opens_at or self.judging_start,
            "evaluation_closes_at": self.evaluation_closes_at or self.judging_end,
            "results_publish_at": self.results_publish_at,
        }


class ChallengeJudge(UUIDModel, TimeStampedModel):
    """A judge invited by name and email to mark every entry of an innovation challenge."""

    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="challenge_judges")
    name = models.CharField(max_length=255)
    email = models.EmailField()
    organisation = models.CharField(max_length=255, blank=True, default="")
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="challenge_judgeships")
    invited_at = models.DateTimeField(null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    last_reminded_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ("created_at",)
        constraints = [models.UniqueConstraint(fields=["program", "email"], name="uq_challenge_judge_program_email")]

    def save(self, *args, **kwargs):
        self.email = (self.email or "").strip().lower()
        super().save(*args, **kwargs)

    def __str__(self) -> str:
        return f"{self.name} <{self.email}>"


class ProgramStage(UUIDModel, TimeStampedModel):
    """Innovator-facing description of a review stage. Matched to workflow steps by code."""

    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="stages")
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=80)
    ordering = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    explanation = models.TextField(blank=True, help_text="Plain-language explanation shown on the idea timeline.")
    usual_duration = models.CharField(max_length=60, blank=True, help_text='For example "1 to 2 weeks".')

    class Meta:
        unique_together = ("program", "code")
        ordering = ("ordering",)


class ProgramTimeline(UUIDModel, TimeStampedModel):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="timelines")
    title = models.CharField(max_length=120)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()


class EligibilityRule(UUIDModel, TimeStampedModel):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name="eligibility_rules")
    title = models.CharField(max_length=255)
    description = models.TextField()
    active = models.BooleanField(default=True)


class SubmissionForm(UUIDModel, TimeStampedModel):
    """A reusable form. Programmes point at it through ``Program.form``.

    The live tables (sections, fields, options, rules) are the staff draft. Publishing
    copies them into a ``FormVersion``; applicants always get the latest published version.
    English text is kept in the plain columns; other languages live in ``translations``.
    """

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        LIVE = "live", "Live"
        CLOSED = "closed", "Closed"
        ARCHIVED = "archived", "Archived"

    title = models.CharField(max_length=255)
    code = models.SlugField(max_length=120, blank=True)
    description = models.TextField(blank=True)
    version = models.PositiveIntegerField(default=1, help_text="Draft edit counter; bumps on every structure change.")
    active = models.BooleanField(default=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.DRAFT, db_index=True)
    languages = models.JSONField(default=default_form_languages, blank=True)
    is_template = models.BooleanField(default=False, db_index=True)
    template_meta = models.JSONField(default=dict, blank=True, help_text="description, estimated_minutes, works_on_ussd")
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"title": "...", "description": "..."}}')
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="created_forms")

    TRANSLATABLE = ("title", "description")

    def __init__(self, *args, **kwargs):
        self._pending_program = None
        super().__init__(*args, **kwargs)

    # Old code and tests create a form with ``SubmissionForm(program=...)`` and read
    # ``form.program``. That still works: the program is linked to the form on save.
    @property
    def program(self):
        if self._pending_program is not None:
            return self._pending_program
        if not self.pk or self._state.adding:
            return None
        return self.programs.order_by("created_at").first()

    @program.setter
    def program(self, value):
        self._pending_program = value

    @property
    def program_id(self):
        program = self.program
        return program.pk if program else None

    def save(self, *args, **kwargs):
        if not self.code:
            program = self._pending_program
            self.code = slugify(self.title or (program.title if program else "")) or "form"
        super().save(*args, **kwargs)
        program = self._pending_program
        if program is not None:
            self._pending_program = None
            if program.form_id != self.pk:
                program.form = self
                program.save(update_fields=["form", "updated_at"])

    @property
    def latest_version(self):
        return self.versions.order_by("-number").first()

    def __str__(self) -> str:
        return self.title


class FormVersion(UUIDModel, TimeStampedModel):
    """A published, frozen copy of a form's sections, fields, options, rules and layout."""

    form = models.ForeignKey(SubmissionForm, on_delete=models.CASCADE, related_name="versions")
    number = models.PositiveIntegerField()
    schema = models.JSONField(default=dict)
    published_at = models.DateTimeField(default=timezone.now)
    published_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="published_form_versions")

    class Meta:
        ordering = ("-number",)
        constraints = [models.UniqueConstraint(fields=["form", "number"], name="uq_form_version_number")]

    def __str__(self) -> str:
        return f"{self.form.title} v{self.number}"


class FormSection(UUIDModel, TimeStampedModel):
    form = models.ForeignKey(SubmissionForm, on_delete=models.CASCADE, related_name="sections")
    title = models.CharField(max_length=255)
    code = models.SlugField(max_length=100)
    description = models.TextField(blank=True)
    ordering = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"title": "...", "description": "..."}}')
    tips = models.JSONField(default=list, blank=True, help_text='"Tips for this step": a list of {"en": "...", "tn": "..."}')

    TRANSLATABLE = ("title", "description")

    class Meta:
        unique_together = ("form", "code")
        ordering = ("ordering", "title")


class SubmissionFormField(UUIDModel, TimeStampedModel):
    form = models.ForeignKey(SubmissionForm, on_delete=models.CASCADE, related_name="fields")
    section = models.ForeignKey("programs.FormSection", on_delete=models.CASCADE, null=True, blank=True, related_name="fields")
    label = models.CharField(max_length=255)
    key = models.SlugField(max_length=100)
    field_type = models.CharField(max_length=30, choices=SubmissionFormFieldType.choices)
    help_text = models.TextField(blank=True)
    placeholder = models.CharField(max_length=255, blank=True)
    link_url = models.URLField(max_length=500, blank=True, help_text="Optional URL shown on boolean (checkbox) fields — e.g. a link to a T&C document.")
    example_value = models.JSONField(default=dict, blank=True)
    default_value = models.JSONField(default=dict, blank=True)
    required = models.BooleanField(default=False)
    validation_rules = models.JSONField(default=dict, blank=True)
    visible_if = models.JSONField(default=dict, blank=True)
    required_if = models.JSONField(default=dict, blank=True)
    enabled_if = models.JSONField(default=dict, blank=True)
    media_config = models.JSONField(default=dict, blank=True)
    ordering = models.PositiveIntegerField(default=1)
    is_active = models.BooleanField(default=True)
    width = models.CharField(max_length=20, choices=FieldWidth.choices, default=FieldWidth.FULL)
    row = models.PositiveIntegerField(default=1, help_text="Row within the section; fields in one row sit side by side, left to right by ordering.")
    is_challenge_question = models.BooleanField(default=False, help_text="Asked only for this challenge (shows the Challenge question badge).")
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"label": "...", "help_text": "...", "placeholder": "..."}}')

    TRANSLATABLE = ("label", "help_text", "placeholder")

    class Meta:
        unique_together = ("form", "key")
        ordering = ("ordering",)


class FieldValidationRule(UUIDModel, TimeStampedModel):
    class RuleType(models.TextChoices):
        MIN_LENGTH = "min_length", "Min Length"
        MAX_LENGTH = "max_length", "Max Length"
        MIN_VALUE = "min_value", "Min Value"
        MAX_VALUE = "max_value", "Max Value"
        REGEX = "regex", "Regex"
        FILE_TYPE = "file_type", "File Type"
        FILE_SIZE_MB = "file_size_mb", "File Size MB"
        EXACT_LENGTH = "exact_length", "Exact Length"
        REQUIRED_EXTENSION = "required_extension", "Required Extension"

    field = models.ForeignKey(SubmissionFormField, on_delete=models.CASCADE, related_name="field_rules")
    rule_type = models.CharField(max_length=40, choices=RuleType.choices)
    rule_value = models.CharField(max_length=255)
    error_message = models.CharField(max_length=255, blank=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ("field", "rule_type")


class SubmissionFormFieldOption(UUIDModel, TimeStampedModel):
    field = models.ForeignKey(SubmissionFormField, on_delete=models.CASCADE, related_name="options")
    label = models.CharField(max_length=120)
    value = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True, help_text="Optional second line on radio cards.")
    ordering = models.PositiveIntegerField(default=1)
    translations = models.JSONField(default=dict, blank=True, help_text='{"tn": {"label": "...", "description": "..."}}')

    TRANSLATABLE = ("label", "description")

    class Meta:
        ordering = ("ordering",)
