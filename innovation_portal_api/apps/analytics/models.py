from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class AnalyticsExport(UUIDModel, TimeStampedModel):
    """B7: a CSV or PDF of the dashboard numbers, made in the background."""

    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        RUNNING = "running", "Running"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    REPORTS = ("kpis", "series", "pipeline", "funnel", "sources", "sectors", "inclusion", "all")
    FORMATS = ("csv", "pdf")

    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="analytics_exports")
    report = models.CharField(max_length=20)
    format = models.CharField(max_length=5)
    filters = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.QUEUED)
    file = models.FileField(upload_to="analytics_exports/", blank=True)
    error = models.TextField(blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]
