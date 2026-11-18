from django.conf import settings
from django.db import models

from apps.core.constants import ScreeningOutcome
from apps.core.models import TimeStampedModel, UUIDModel


class ScreeningChecklist(UUIDModel, TimeStampedModel):
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="screening_checklists")
    title = models.CharField(max_length=255)


class ScreeningChecklistItem(UUIDModel, TimeStampedModel):
    checklist = models.ForeignKey(ScreeningChecklist, on_delete=models.CASCADE, related_name="items")
    label = models.CharField(max_length=255)
    ordering = models.PositiveIntegerField(default=1)
    required = models.BooleanField(default=True)


class ScreeningReview(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="screening_reviews")
    reviewed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    is_complete = models.BooleanField(default=False)
    is_eligible = models.BooleanField(default=False)
    has_duplicate_concern = models.BooleanField(default=False)
    notes = models.TextField(blank=True)
    decision = models.CharField(max_length=40, choices=ScreeningOutcome.choices)
    justification = models.TextField()


class DuplicateFlag(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="duplicate_flags")
    flagged_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    reason = models.TextField()
