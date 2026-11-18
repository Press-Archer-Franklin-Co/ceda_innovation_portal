from django.conf import settings
from django.db import models

from apps.core.constants import CommunicationChannel, CommunicationStatus, TemplateCode
from apps.core.models import TimeStampedModel, UUIDModel


class MessageTemplate(UUIDModel, TimeStampedModel):
    code = models.CharField(max_length=60, choices=TemplateCode.choices, unique=True)
    name = models.CharField(max_length=120)
    subject_template = models.CharField(max_length=255)
    body_template = models.TextField()
    channel = models.CharField(max_length=20, choices=CommunicationChannel.choices)
    active = models.BooleanField(default=True)


class CommunicationLog(UUIDModel, TimeStampedModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="communication_logs")
    notification = models.ForeignKey("communications.Notification", on_delete=models.SET_NULL, null=True, blank=True, related_name="delivery_logs")
    channel = models.CharField(max_length=20, choices=CommunicationChannel.choices)
    template = models.ForeignKey(MessageTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name="logs")
    subject = models.CharField(max_length=255, blank=True)
    rendered_body = models.TextField()
    status = models.CharField(max_length=20, choices=CommunicationStatus.choices, default=CommunicationStatus.PENDING)
    retry_count = models.PositiveIntegerField(default=0)
    failure_reason = models.TextField(blank=True)
    last_attempt_at = models.DateTimeField(null=True, blank=True)
    sent_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="communications_sent")
    sent_at = models.DateTimeField(null=True, blank=True)
    related_submission = models.ForeignKey("submissions.Submission", on_delete=models.SET_NULL, null=True, blank=True, related_name="communications")
    related_program = models.ForeignKey("programs.Program", on_delete=models.SET_NULL, null=True, blank=True, related_name="communications")


class Notification(UUIDModel, TimeStampedModel):
    recipient = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    notification_type = models.CharField(max_length=80, default="general")
    title = models.CharField(max_length=255)
    body = models.TextField()
    is_read = models.BooleanField(default=False)


class NotificationPreference(UUIDModel, TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notification_preference")
    email_enabled = models.BooleanField(default=True)
    sms_enabled = models.BooleanField(default=False)
    internal_enabled = models.BooleanField(default=True)
