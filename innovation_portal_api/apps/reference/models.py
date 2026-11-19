from django.db import models

from apps.core.i18n import get_text, translated_default, validate_translated_text
from apps.core.models import TimeStampedModel, UUIDModel


class ReferenceItem(UUIDModel, TimeStampedModel):
    """A short bilingual pick list entry (sector, district)."""

    name = models.JSONField(default=translated_default, validators=[validate_translated_text])
    slug = models.SlugField(max_length=80, unique=True)
    ordering = models.PositiveIntegerField(default=0, db_index=True)
    active = models.BooleanField(default=True, db_index=True)

    class Meta:
        abstract = True
        ordering = ("ordering", "slug")

    def __str__(self) -> str:
        return get_text(self.name) or self.slug


class Sector(ReferenceItem):
    class Meta(ReferenceItem.Meta):
        verbose_name = "sector"


class District(ReferenceItem):
    class Meta(ReferenceItem.Meta):
        verbose_name = "district"
