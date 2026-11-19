from rest_framework import serializers

from apps.accounts.models import User
from apps.core.i18n import get_text, resolve_request_language
from apps.profiles.models import ContactVerification, InnovatorProfile
from apps.reference.models import District, Sector


class UserSummarySerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "phone_number")


class InnovatorProfileSerializer(serializers.ModelSerializer):
    user = UserSummarySerializer(read_only=True)
    id_passport_number = serializers.CharField(source="national_id", required=False, allow_blank=True)
    birthday = serializers.DateField(source="date_of_birth", required=False, allow_null=True)
    linkedin_profile = serializers.URLField(source="linkedin_url", required=False, allow_blank=True)
    website_portfolio = serializers.URLField(source="portfolio_url", required=False, allow_blank=True)
    sector = serializers.PrimaryKeyRelatedField(queryset=Sector.objects.filter(active=True), required=False, allow_null=True)
    district = serializers.PrimaryKeyRelatedField(queryset=District.objects.filter(active=True), required=False, allow_null=True)
    sector_name = serializers.SerializerMethodField()
    district_name = serializers.SerializerMethodField()
    percent_complete = serializers.SerializerMethodField()
    missing_fields = serializers.SerializerMethodField()

    class Meta:
        model = InnovatorProfile
        fields = (
            "id",
            "user",
            "national_id",
            "id_passport_number",
            "country_code",
            "country",
            "gender",
            "date_of_birth",
            "birthday",
            "person_type",
            "person_type_other",
            "region",
            "district",
            "district_name",
            "sector",
            "sector_name",
            "business_stage",
            "bio",
            "sector_interests",
            "skills",
            "certifications",
            "portfolio_url",
            "website_portfolio",
            "linkedin_url",
            "linkedin_profile",
            "past_participation_summary",
            "percent_complete",
            "missing_fields",
        )

    def _lang(self):
        return resolve_request_language(self.context.get("request"))

    def get_sector_name(self, obj):
        return get_text(obj.sector.name, self._lang()) if obj.sector_id else ""

    def _completeness(self, obj):
        from apps.submissions.innovator_dashboard import profile_completeness

        cache = getattr(self, "_completeness_cache", {})
        if obj.pk not in cache:
            cache[obj.pk] = profile_completeness(obj)
            self._completeness_cache = cache
        return cache[obj.pk]

    def get_percent_complete(self, obj):
        return self._completeness(obj)["percent_complete"]

    def get_missing_fields(self, obj):
        return self._completeness(obj)["missing_fields"]

    def get_district_name(self, obj):
        return get_text(obj.district.name, self._lang()) if obj.district_id else ""


class ContactVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactVerification
        fields = ("id", "channel", "target", "code", "is_verified", "verified_at")
        read_only_fields = ("is_verified", "verified_at")
