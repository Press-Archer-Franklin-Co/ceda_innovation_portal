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
    # U9 (3.29): where the change came from and a readable name for the item, kept at the time of the change.
    ip_address = models.CharField(max_length=60, blank=True, default="", help_text="Masked: the last two parts are hidden (102.65.x.x).")
    device = models.CharField(max_length=120, blank=True, default="")
    item_label = models.CharField(max_length=255, blank=True, default="")

    class Meta:
        indexes = [models.Index(fields=["target_model", "target_id", "created_at"])]


class ActivityLog(UUIDModel, TimeStampedModel):
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    action_type = models.CharField(max_length=120)
    description = models.TextField()
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, null=True, blank=True, related_name="activity_logs")


class AuthorizationRefusal(UUIDModel, TimeStampedModel):
    """S1 / ceda-security 5: refusals grouped with a counter, for spotting patterns.

    One row per (route pattern, method, status, user, address, client build). Never stores
    query strings, bodies, tokens or full URLs. Nothing here decides access.
    """

    route_pattern = models.CharField(max_length=255, db_index=True)
    method = models.CharField(max_length=10)
    status_code = models.PositiveSmallIntegerField(db_index=True)
    error_code = models.CharField(max_length=80, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name="+")
    client_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=255, blank=True)
    client_build = models.CharField(max_length=80, blank=True, db_index=True, help_text="X-CEDA-Client header, e.g. admin@<sha>; blank means not our UI.")
    count = models.PositiveIntegerField(default=1)
    first_seen = models.DateTimeField(auto_now_add=True)
    last_seen = models.DateTimeField(auto_now=True, db_index=True)

    class Meta:
        ordering = ("-last_seen",)
        indexes = [models.Index(fields=["route_pattern", "method", "status_code", "client_build"])]
