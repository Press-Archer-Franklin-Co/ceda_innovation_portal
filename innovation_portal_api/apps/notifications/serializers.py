from rest_framework import serializers

from apps.communications.models import Notification
from apps.core.constants import NotificationDeliveryChannel, NotificationType


# R-8: the bell panel's filter chips. A notification's category comes from its link,
# else from its type.
CATEGORY_TYPES = {
    "challenges": ("new_challenge", "challenge_", "judge", "results_"),
    "news": ("news", "digest", "post_"),
}
LINK_CATEGORIES = {"idea": "ideas", "message": "ideas", "challenge": "challenges", "post": "news"}
CATEGORIES = ("ideas", "challenges", "news")

# R-48 (3.39): the staff settings groups and the notification types in each.
STAFF_GROUPS = {
    "new_assignment": ("New assignment", ("assignment_created", "assignment_conflict_declared", "evaluation_submitted", "form_translation_review")),
    "replies": ("Replies and messages", ("applicant_reply", "officer_message")),
    "approvals": ("Approvals", ("content_approval", "story_consent")),
    "deadlines": ("Deadlines", ("assignment_overdue", "question_overdue", "deadline")),
}


def category_for(notification) -> str:
    if notification.link_type in LINK_CATEGORIES:
        return LINK_CATEGORIES[notification.link_type]
    kind = notification.notification_type or ""
    for category, prefixes in CATEGORY_TYPES.items():
        if any(kind == prefix or kind.startswith(prefix) for prefix in prefixes):
            return category
    return "ideas"


def category_filter(category: str):
    from django.db.models import Q

    link_types = [link for link, name in LINK_CATEGORIES.items() if name == category]
    by_link = Q(link_type__in=link_types)
    by_type = Q()
    for prefix in CATEGORY_TYPES.get(category, ()):
        by_type |= Q(notification_type__startswith=prefix)
    unlinked = Q(link_type="") | ~Q(link_type__in=list(LINK_CATEGORIES))
    if category == "ideas":
        other = Q()
        for prefixes in CATEGORY_TYPES.values():
            for prefix in prefixes:
                other |= Q(notification_type__startswith=prefix)
        return by_link | (unlinked & ~other)
    return by_link | (unlinked & by_type)


class NotificationSerializer(serializers.ModelSerializer):
    category = serializers.SerializerMethodField(help_text="ideas, challenges or news")
    link = serializers.SerializerMethodField(help_text="{type, id, slug} or null")

    class Meta:
        model = Notification
        fields = ("id", "notification_type", "category", "title", "body", "is_read", "link", "due_at", "created_at")

    def get_category(self, obj) -> str:
        return category_for(obj)

    def get_link(self, obj) -> dict | None:
        if not obj.link_type:
            return None
        return {"type": obj.link_type, "id": obj.link_id or None, "slug": obj.link_slug or None}


class NotificationMarkReadSerializer(serializers.Serializer):
    ids = serializers.ListField(child=serializers.UUIDField(), required=False)
    mark_all = serializers.BooleanField(default=False)


class SingleNotificationMarkReadSerializer(serializers.Serializer):
    pass


class NotificationPreferencesSerializer(serializers.Serializer):
    """``{"preferences": {"<type>": {"web": bool, "whatsapp": bool, "sms": bool, "email": bool}}}``.

    On PUT, types and channels that are left out keep their current value.
    """

    preferences = serializers.DictField(
        child=serializers.DictField(child=serializers.BooleanField()),
        allow_empty=False,
        required=False,
    )
    daily_summary = serializers.BooleanField(required=False, help_text="R-48: one summary email a day at 07:30 instead of an email each time.")
    staff_groups = serializers.SerializerMethodField(read_only=True)
    notification_types = serializers.SerializerMethodField(read_only=True)
    channels = serializers.SerializerMethodField(read_only=True)

    def get_staff_groups(self, obj):
        return [{"code": code, "label": label, "types": list(types)} for code, (label, types) in STAFF_GROUPS.items()]

    def get_notification_types(self, obj):
        return [{"code": value, "label": label} for value, label in NotificationType.choices]

    def get_channels(self, obj):
        return [{"code": value, "label": label} for value, label in NotificationDeliveryChannel.choices]

    def validate_preferences(self, value):
        errors = {}
        valid_channels = set(NotificationDeliveryChannel.values)
        for notification_type, channels in value.items():
            if notification_type not in NotificationType.values:
                errors[notification_type] = ["Unknown notification type."]
                continue
            unknown = sorted(set(channels) - valid_channels)
            if unknown:
                errors[notification_type] = [f"Unknown channel(s): {', '.join(unknown)}."]
        if errors:
            raise serializers.ValidationError(errors)
        return value
