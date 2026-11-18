from django.conf import settings
from django.db import models

from apps.core.models import TimeStampedModel, UUIDModel


class OrganizationProfile(UUIDModel, TimeStampedModel):
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="organization_profiles",
    )
    legal_name = models.CharField(max_length=255)
    registration_number = models.CharField(max_length=100, blank=True)
    sector = models.CharField(max_length=150, blank=True)
    website = models.URLField(blank=True)
    address = models.TextField(blank=True)
    region = models.CharField(max_length=120, blank=True)
    contact_person = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [models.Index(fields=["legal_name"]), models.Index(fields=["registration_number"])]

    def __str__(self) -> str:
        return self.legal_name
