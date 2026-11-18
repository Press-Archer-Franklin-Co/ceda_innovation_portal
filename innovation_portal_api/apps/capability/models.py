from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel
class TalentPoolTag(UUIDModel, TimeStampedModel):
    name = models.CharField(max_length=120, unique=True)

    def __str__(self) -> str:
        return self.name


class CapabilityAssessment(UUIDModel, TimeStampedModel):
    submission = models.ForeignKey("submissions.Submission", on_delete=models.CASCADE, related_name="capability_assessments")
    assessed_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    notes = models.TextField(blank=True)


class CapabilityScore(UUIDModel, TimeStampedModel):
    assessment = models.ForeignKey(CapabilityAssessment, on_delete=models.CASCADE, related_name="scores")
    dimension = models.CharField(max_length=120)
    score = models.DecimalField(max_digits=5, decimal_places=2)
