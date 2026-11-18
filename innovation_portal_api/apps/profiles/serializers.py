from rest_framework import serializers

from apps.accounts.models import User
from apps.profiles.models import ContactVerification, InnovatorProfile


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
            "bio",
            "sector_interests",
            "skills",
            "certifications",
            "portfolio_url",
            "website_portfolio",
            "linkedin_url",
            "linkedin_profile",
            "past_participation_summary",
        )


class ContactVerificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = ContactVerification
        fields = ("id", "channel", "target", "code", "is_verified", "verified_at")
        read_only_fields = ("is_verified", "verified_at")
