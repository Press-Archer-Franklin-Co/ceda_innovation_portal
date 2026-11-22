from django.conf import settings
from django.db import models

from apps.core.constants import FinalDecisionType, IntakeChannel, ScreeningOutcome, SubmissionOutcomeType, SubmissionStatus, SubmissionType
from apps.core.models import AuditMetadataMixin, TimeStampedModel, UUIDModel


class ApplicationDraft(UUIDModel, TimeStampedModel, AuditMetadataMixin):
    STATUS_DRAFT = "draft"
    STATUS_SUBMITTED = "submitted"
    STATUS_CHOICES = (
        (STATUS_DRAFT, "Draft"),
        (STATUS_SUBMITTED, "Submitted"),
    )

    reference_number = models.CharField(max_length=60, unique=True, db_index=True)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="application_drafts")
    # Empty for a guest quick-start draft until it is claimed after sign-in.
    innovator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="application_drafts"
    )
    submission_type = models.CharField(max_length=40, choices=SubmissionType.choices)
    team = models.ForeignKey("teams.Team", on_delete=models.SET_NULL, null=True, blank=True, related_name="application_drafts")
    sector = models.ForeignKey("reference.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="application_drafts")
    # Drafts for the general (always-open) ideas programme: a person may have several at once.
    is_general_idea = models.BooleanField(default=False)
    guest_name = models.CharField(max_length=255, blank=True)
    guest_phone = models.CharField(max_length=32, blank=True)
    guest_phone_verified_at = models.DateTimeField(null=True, blank=True)
    title = models.CharField(max_length=255)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_DRAFT, db_index=True)
    version = models.PositiveIntegerField(default=1)
    draft_data = models.JSONField(default=dict, blank=True)
    progress_metadata = models.JSONField(default=dict, blank=True)
    current_section_code = models.CharField(max_length=100, blank=True)
    submitted_submission = models.OneToOneField(
        "Submission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="source_draft",
    )
    submitted_at = models.DateTimeField(null=True, blank=True)
    channel = models.CharField(max_length=20, choices=IntakeChannel.choices, default=IntakeChannel.WEB, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["innovator", "program"],
                condition=models.Q(status="draft", is_general_idea=False),
                name="uq_active_application_draft_per_user_program",
            )
        ]
        ordering = ("-updated_at", "-created_at")


class Submission(UUIDModel, TimeStampedModel, AuditMetadataMixin):
    reference_number = models.CharField(max_length=50, blank=True, db_index=True)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="submissions")
    submission_type = models.CharField(max_length=40, choices=SubmissionType.choices)
    # Empty for a guest submission (sent without creating an account); guest_name and
    # guest_phone are then the only personal details kept.
    innovator = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, null=True, blank=True, related_name="submissions"
    )
    team = models.ForeignKey("teams.Team", on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions")
    sector = models.ForeignKey("reference.Sector", on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions")
    is_guest = models.BooleanField(default=False)
    guest_name = models.CharField(max_length=255, blank=True)
    guest_phone = models.CharField(max_length=32, blank=True)
    guest_email = models.EmailField(blank=True, help_text="Optional email a guest gave for the confirmation copy (R-22).")
    district = models.ForeignKey("reference.District", on_delete=models.SET_NULL, null=True, blank=True, related_name="submissions", help_text="Where the idea is; officers route by it.")
    title = models.CharField(max_length=255)
    current_status = models.CharField(max_length=40, choices=SubmissionStatus.choices, default=SubmissionStatus.DRAFT, db_index=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    screening_outcome = models.CharField(max_length=40, choices=ScreeningOutcome.choices, blank=True)
    final_decision = models.CharField(max_length=40, choices=FinalDecisionType.choices, blank=True)
    locked_for_editing = models.BooleanField(default=False)
    latest_version_number = models.PositiveIntegerField(default=1)
    form_version_number = models.PositiveIntegerField(default=1)
    form_version = models.ForeignKey("programs.FormVersion", on_delete=models.PROTECT, null=True, blank=True, related_name="submissions", help_text="The published form version the applicant answered.")
    channel = models.CharField(max_length=20, choices=IntakeChannel.choices, default=IntakeChannel.WEB, db_index=True)

    class Meta:
        indexes = [
            models.Index(fields=["program", "current_status"]),
            models.Index(fields=["innovator", "current_status"]),
            models.Index(fields=["reference_number"]),
        ]


class SubmissionVersion(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="versions")
    version_number = models.PositiveIntegerField()
    snapshot = models.JSONField(default=dict, blank=True)
    submitted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)

    class Meta:
        unique_together = ("submission", "version_number")


class SubmissionResponse(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="responses")
    form_field = models.ForeignKey("programs.SubmissionFormField", on_delete=models.SET_NULL, null=True, blank=True, related_name="responses")
    field_key_snapshot = models.CharField(max_length=100, blank=True)
    field_label_snapshot = models.CharField(max_length=255, blank=True)
    field_type_snapshot = models.CharField(max_length=30, blank=True)
    form_version_snapshot = models.PositiveIntegerField(default=1)
    value = models.JSONField(default=dict, blank=True)

    class Meta:
        unique_together = ("submission", "form_field")


class SubmissionStatusHistory(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="status_history")
    from_status = models.CharField(max_length=40, blank=True)
    to_status = models.CharField(max_length=40, choices=SubmissionStatus.choices)
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    reason = models.TextField(blank=True)
    comment = models.TextField(blank=True)


class SubmissionFeedbackSnapshot(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="feedback_snapshots")
    workflow_instance = models.ForeignKey("workflow.WorkflowInstance", on_delete=models.SET_NULL, null=True, blank=True, related_name="feedback_snapshots")
    stage_code = models.CharField(max_length=100, db_index=True)
    stage_name = models.CharField(max_length=255)
    release_action = models.CharField(max_length=40, db_index=True)
    source_review_cycle = models.ForeignKey("evaluation.ReviewCycle", on_delete=models.SET_NULL, null=True, blank=True, related_name="feedback_snapshots")
    source_action_log = models.OneToOneField("workflow.WorkflowActionLog", on_delete=models.SET_NULL, null=True, blank=True, related_name="feedback_snapshot")
    released_at = models.DateTimeField(db_index=True)
    payload_json = models.JSONField(default=dict, blank=True)
    schema_version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ("released_at", "created_at")
        indexes = [
            models.Index(fields=["submission", "stage_code", "released_at"]),
            models.Index(fields=["submission", "release_action"]),
        ]


class SubmissionInternalNote(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="internal_notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    note = models.TextField()


class SubmissionOutcome(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey(Submission, on_delete=models.CASCADE, related_name="outcomes")
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="submission_outcomes")
    outcome_type = models.CharField(max_length=30, choices=SubmissionOutcomeType.choices, db_index=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="submission_outcomes")
    decision_step = models.ForeignKey("workflow.WorkflowStep", on_delete=models.SET_NULL, null=True, blank=True, related_name="submission_outcomes")
    decided_at = models.DateTimeField()
    score_snapshot = models.JSONField(default=dict, blank=True)
    ranking_position = models.PositiveIntegerField(null=True, blank=True)
    rationale = models.TextField(blank=True)
    is_current = models.BooleanField(default=True, db_index=True)

    class Meta:
        ordering = ("-decided_at", "-created_at")
        constraints = [
            models.UniqueConstraint(
                fields=["submission"],
                condition=models.Q(is_current=True),
                name="uq_current_submission_outcome",
            )
        ]


class ConsentRecord(UUIDModel, TimeStampedModel):
    """Proof that a person agreed to the submission terms: which text, when, from where."""

    PURPOSE_IDEA_SUBMISSION = "idea_submission"

    purpose = models.CharField(max_length=40, default=PURPOSE_IDEA_SUBMISSION)
    text_version = models.CharField(max_length=40)
    given_at = models.DateTimeField()
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="consent_records")
    guest_phone = models.CharField(max_length=32, blank=True)
    draft = models.ForeignKey(ApplicationDraft, on_delete=models.SET_NULL, null=True, blank=True, related_name="consent_records")
    submission = models.ForeignKey(Submission, on_delete=models.SET_NULL, null=True, blank=True, related_name="consent_records")

    class Meta:
        ordering = ("-given_at",)


class ReferenceSequence(models.Model):
    """Last number used per reference prefix, e.g. CEDA-IP-2026 -> 41."""

    prefix = models.CharField(max_length=40, unique=True)
    last_value = models.PositiveIntegerField(default=0)



class EntryPanelFeedback(UUIDModel, TimeStampedModel):
    """R-54 (2.11, 3.37): what the panel liked and what to work on, and whether the entrant will attend the event."""

    submission = models.OneToOneField(Submission, on_delete=models.CASCADE, related_name="panel_feedback")
    liked = models.JSONField(default=list, blank=True, help_text="Short points, shown as written.")
    work_on = models.JSONField(default=list, blank=True)
    written_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    attending = models.BooleanField(null=True, blank=True, help_text="The entrant's answer to Confirm I will attend.")
    attendance_answered_at = models.DateTimeField(null=True, blank=True)
