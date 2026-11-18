from rest_framework import serializers

from apps.events.models import CheckInLog, Event, EventSession, PresentationSlot


class EventSerializer(serializers.ModelSerializer):
    class Meta:
        model = Event
        fields = "__all__"


class EventSessionSerializer(serializers.ModelSerializer):
    class Meta:
        model = EventSession
        fields = "__all__"


class PresentationSlotSerializer(serializers.ModelSerializer):
    class Meta:
        model = PresentationSlot
        fields = "__all__"


class CheckInSerializer(serializers.Serializer):
    attendance_id = serializers.UUIDField()
