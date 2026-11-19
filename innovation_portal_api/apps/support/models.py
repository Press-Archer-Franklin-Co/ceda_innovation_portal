from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class FAQ(UUIDModel, TimeStampedModel):
    question = models.CharField(max_length=255)
    answer = models.TextField()
    ordering = models.PositiveIntegerField(default=1)
    is_public = models.BooleanField(default=True)
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, null=True, blank=True, related_name="faqs", help_text="Shown on this challenge's page.")

    class Meta:
        ordering = ("ordering", "question")


class Guideline(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    content = models.TextField()
    document_url = models.URLField(blank=True)
    audience = models.CharField(max_length=120, blank=True)
    is_public = models.BooleanField(default=True)


class SupportRequest(UUIDModel, TimeStampedModel):
    request_type = models.CharField(max_length=50, default="technical_support")
    subject = models.CharField(max_length=255)
    description = models.TextField()
    email = models.EmailField()
    phone_number = models.CharField(max_length=30, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="support_requests")
    submission = models.ForeignKey("submissions.Submission", on_delete=models.SET_NULL, null=True, blank=True, related_name="support_requests")
    status = models.CharField(max_length=50, default="open")
    resolution_notes = models.TextField(blank=True)


class InternalTask(UUIDModel, TimeStampedModel):
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    assignee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    due_date = models.DateField(null=True, blank=True)
    status = models.CharField(max_length=50, default="open")


class EscalationRecord(UUIDModel, TimeStampedModel):
    task = models.ForeignKey(InternalTask, on_delete=models.CASCADE, related_name="escalations")
    reason = models.TextField()
    escalated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
