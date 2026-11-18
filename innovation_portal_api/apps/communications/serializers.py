from rest_framework import serializers

from apps.communications.models import CommunicationLog


class CommunicationLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = CommunicationLog
        fields = "__all__"
