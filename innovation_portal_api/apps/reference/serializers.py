from rest_framework import serializers

from apps.core.i18n import TranslatedTextField
from apps.reference.models import District, Sector


class SectorSerializer(serializers.ModelSerializer):
    name = TranslatedTextField(read_only=True)

    class Meta:
        model = Sector
        fields = ("id", "slug", "name", "ordering")


class DistrictSerializer(serializers.ModelSerializer):
    name = TranslatedTextField(read_only=True)

    class Meta:
        model = District
        fields = ("id", "slug", "name", "ordering")
