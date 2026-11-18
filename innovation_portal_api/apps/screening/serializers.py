from rest_framework import serializers

from apps.screening.models import ScreeningReview


class ScreeningReviewSerializer(serializers.ModelSerializer):
    class Meta:
        model = ScreeningReview
        fields = "__all__"
        read_only_fields = ("reviewed_by", "submission")
