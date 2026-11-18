from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class Event(UUIDModel, TimeStampedModel):
    program = models.ForeignKey("programs.Program", on_delete=models.CASCADE, related_name="events")
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    location = models.CharField(max_length=255, blank=True)


class EventSession(UUIDModel, TimeStampedModel):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="sessions")
    title = models.CharField(max_length=255)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()


class PresentationSlot(UUIDModel, TimeStampedModel):
    session = models.ForeignKey(EventSession, on_delete=models.CASCADE, related_name="slots")
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="presentation_slots")
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()


class AttendanceRecord(UUIDModel, TimeStampedModel):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="attendance_records")
    attendee = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="attendance_records")
    status = models.CharField(max_length=20, default="registered")


class CheckInLog(UUIDModel, TimeStampedModel):
    attendance = models.ForeignKey(AttendanceRecord, on_delete=models.CASCADE, related_name="check_ins")
    checked_in_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
