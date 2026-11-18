from django.conf import settings
from django.db import models

from apps.core.constants import BusinessStage
from apps.core.models import TimeStampedModel, UUIDModel


class InnovatorProfile(UUIDModel, TimeStampedModel):
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="innovator_profile")
    national_id = models.CharField(max_length=100, blank=True)
    country_code = models.CharField(max_length=12, blank=True)
    country = models.CharField(max_length=120, blank=True)
    gender = models.CharField(max_length=50, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    person_type = models.CharField(max_length=60, blank=True)
    person_type_other = models.CharField(max_length=120, blank=True)
    region = models.CharField(max_length=120, blank=True)
    district = models.ForeignKey(
        "reference.District",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="innovator_profiles",
    )
    sector = models.ForeignKey(
        "reference.Sector",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="innovator_profiles",
    )
    business_stage = models.CharField(max_length=20, choices=BusinessStage.choices, blank=True)
    bio = models.TextField(blank=True)
    sector_interests = models.JSONField(default=list, blank=True)
    skills = models.JSONField(default=list, blank=True)
    certifications = models.JSONField(default=list, blank=True)
    portfolio_url = models.URLField(blank=True)
    linkedin_url = models.URLField(blank=True)
    past_participation_summary = models.TextField(blank=True)

    def __str__(self) -> str:
        return f"Profile<{self.user}>"


class ContactVerification(UUIDModel, TimeStampedModel):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="contact_verifications")
    channel = models.CharField(max_length=30)
    target = models.CharField(max_length=255)
    code = models.CharField(max_length=12)
    is_verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        indexes = [models.Index(fields=["user", "channel", "is_verified"])]
