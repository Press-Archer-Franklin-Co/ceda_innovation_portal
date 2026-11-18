from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class AuditLog(UUIDModel, TimeStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=120, db_index=True)
    target_model = models.CharField(max_length=120, db_index=True)
    target_id = models.CharField(max_length=120, db_index=True)
    before_state = models.JSONField(default=dict, blank=True)
    after_state = models.JSONField(default=dict, blank=True)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        indexes = [models.Index(fields=["target_model", "target_id", "created_at"])]


class ActivityLog(UUIDModel, TimeStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=120)
    description = models.TextField()
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, null=True, blank=True, related_name="activity_logs")
