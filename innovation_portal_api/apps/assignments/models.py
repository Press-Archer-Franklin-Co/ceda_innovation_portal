import uuid as _uuid
from django.conf import settings
from django.db import models
from django.utils import timezone

from apps.core.constants import AssignmentRoleType, AssignmentStatus
from apps.core.models import TimeStampedModel, UUIDModel


class SpecialistInvitationStatus(models.TextChoices):
    PENDING   = "pending",   "Pending"
    ACCEPTED  = "accepted",  "Accepted"
    COMPLETED = "completed", "Completed"
    EXPIRED   = "expired",   "Expired"
    REVOKED   = "revoked",   "Revoked"


class ReviewPanel(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=255)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="review_panels")


class Assignment(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="assignments")
    workflow_step = models.ForeignKey("workflow.WorkflowStep", on_delete=models.SET_NULL, null=True, blank=True, related_name="assignments")
    previous_assignment = models.ForeignKey("self", on_delete=models.SET_NULL, null=True, blank=True, related_name="reassignments")
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="assignments")
    role_type = models.CharField(max_length=20, choices=AssignmentRoleType.choices)
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="assignments_created")
    assigned_at = models.DateTimeField(auto_now_add=True)
    deadline = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=20, choices=AssignmentStatus.choices, default=AssignmentStatus.ASSIGNED)
    reassigned_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    panel = models.ForeignKey(ReviewPanel, on_delete=models.SET_NULL, null=True, blank=True, related_name="assignments")

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["submission", "assignee", "role_type"],
                condition=models.Q(status__in=[AssignmentStatus.ASSIGNED, AssignmentStatus.ACCEPTED]),
                name="uq_active_assignment",
            )
        ]


class AssignmentAcceptance(UUIDModel, TimeStampedModel):
    assignment = models.OneToOneField(Assignment, on_delete=models.CASCADE, related_name="acceptance")
    accepted = models.BooleanField(default=False)
    responded_at = models.DateTimeField(auto_now_add=True)
    response_note = models.TextField(blank=True)


class ConflictOfInterestDeclaration(UUIDModel, TimeStampedModel):
    assignment = models.OneToOneField(Assignment, on_delete=models.CASCADE, related_name="conflict_declaration")
    declared_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    conflict_details = models.TextField()
    resolved = models.BooleanField(default=False)


class SpecialistInvitation(UUIDModel, TimeStampedModel):
    submission    = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="specialist_invitations")
    workflow_step = models.ForeignKey("workflow.WorkflowStep", on_delete=models.SET_NULL, null=True, blank=True, related_name="specialist_invitations")
    invited_by    = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="specialist_invitations_sent")
    invitee_email = models.EmailField()
    invitee_name  = models.CharField(max_length=255)
    message       = models.TextField(blank=True)
    required_review_count = models.PositiveIntegerField(default=1)
    token         = models.UUIDField(default=_uuid.uuid4, unique=True, editable=False)
    status        = models.CharField(max_length=20, choices=SpecialistInvitationStatus.choices, default=SpecialistInvitationStatus.PENDING)
    expires_at    = models.DateTimeField()
    accepted_by   = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="specialist_invitations_accepted")
    assignment    = models.OneToOneField(Assignment, on_delete=models.SET_NULL, null=True, blank=True, related_name="specialist_invitation")

    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timezone.timedelta(days=7)
        super().save(*args, **kwargs)

    @property
    def is_expired(self):
        return timezone.now() > self.expires_at

    class Meta:
        ordering = ("-created_at",)


class MentorAssignment(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="mentor_assignments")
    mentor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="mentorships")
    assigned_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, related_name="mentor_assignments_created")
