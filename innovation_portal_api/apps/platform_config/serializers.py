from rest_framework import serializers

from apps.platform_config.crypto import decrypt_secrets
from apps.platform_config.models import FeatureFlag, IntegrationConnection
from apps.platform_config.providers import get_provider_class


def _person(user):
    if not user:
        return None
    return {"id": str(user.id), "name": user.full_name or str(user)}


class FeatureFlagSerializer(serializers.ModelSerializer):
    group_label = serializers.CharField(source="get_group_display", read_only=True)
    updated_by = serializers.SerializerMethodField()
    # U9 (3.26): the service this feature needs, and whether it still needs setting up.
    needs_setup = serializers.SerializerMethodField()
    service = serializers.SerializerMethodField()

    class Meta:
        model = FeatureFlag
        fields = ("key", "label", "description", "group", "group_label", "enabled", "is_public", "coming_soon", "needs_setup", "service", "updated_by", "updated_at")
        read_only_fields = fields

    def _states(self):
        from apps.platform_config import service_status

        if "_service_states" not in self.context:
            self.context["_service_states"] = service_status.states()
        return self.context["_service_states"]

    def get_needs_setup(self, obj):
        from apps.platform_config import service_status

        return service_status.needs_setup(obj.key, self._states())

    def get_service(self, obj):
        from apps.platform_config import service_status

        return service_status.feature_service(obj.key, self._states())

    def get_updated_by(self, obj):
        return _person(obj.updated_by)


class FeatureFlagUpdateSerializer(serializers.Serializer):
    enabled = serializers.BooleanField()


class _JSONObjectField(serializers.JSONField):
    def to_internal_value(self, data):
        value = super().to_internal_value(data)
        if value is None:
            return {}
        if not isinstance(value, dict):
            self.fail("invalid")
        return value


class IntegrationWriteSerializer(serializers.Serializer):
    kind = serializers.ChoiceField(choices=IntegrationConnection.Kind.choices, required=False)
    provider = serializers.CharField(max_length=60, required=False)
    name = serializers.CharField(max_length=120, required=False, allow_blank=True)
    config = _JSONObjectField(required=False, help_text="Non-secret settings, keyed by field name.")
    secrets = _JSONObjectField(
        required=False,
        help_text='Secret settings. "" keeps the saved value, null clears it. Secrets are never returned.',
    )

    def validate(self, attrs):
        if self.context.get("creating"):
            if not attrs.get("provider"):
                raise serializers.ValidationError({"provider": ["Choose a provider."]})
            provider_class = get_provider_class(attrs["provider"])
            if provider_class and attrs.get("kind") and attrs["kind"] != provider_class.kind:
                raise serializers.ValidationError({"kind": [f"`{attrs['provider']}` is a {provider_class.kind} provider."]})
        return attrs


class IntegrationConnectionSerializer(serializers.ModelSerializer):
    provider_label = serializers.SerializerMethodField()
    secrets = serializers.SerializerMethodField()
    warnings = serializers.SerializerMethodField()
    redirect_uri = serializers.SerializerMethodField()
    delivery_receipt_url = serializers.SerializerMethodField()
    activation_blocker = serializers.SerializerMethodField()
    activated_by = serializers.SerializerMethodField()
    created_by = serializers.SerializerMethodField()
    updated_by = serializers.SerializerMethodField()

    class Meta:
        model = IntegrationConnection
        fields = (
            "id",
            "kind",
            "provider",
            "provider_label",
            "name",
            "config",
            "secrets",
            "status",
            "is_active",
            "last_tested_at",
            "last_test_result",
            "activation_blocker",
            "warnings",
            "redirect_uri",
            "delivery_receipt_url",
            "activated_by",
            "activated_at",
            "created_by",
            "updated_by",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def _secret_values(self, obj):
        cache = self.context.setdefault("_secret_cache", {})
        if obj.pk not in cache:
            cache[obj.pk] = decrypt_secrets(obj.secrets_encrypted)
        return cache[obj.pk]

    def get_provider_label(self, obj):
        provider_class = get_provider_class(obj.provider)
        return provider_class.label if provider_class else obj.provider

    def get_secrets(self, obj):
        from apps.platform_config.services import IntegrationService

        provider_class = get_provider_class(obj.provider)
        if provider_class is None:
            return {}
        return IntegrationService.secret_summary(provider_class, self._secret_values(obj))

    def get_warnings(self, obj):
        from apps.platform_config.services import IntegrationService

        return IntegrationService.warnings_for(obj)

    def get_redirect_uri(self, obj):
        if obj.kind != IntegrationConnection.Kind.SSO:
            return None
        from apps.platform_config.providers.sso import callback_url

        return callback_url()

    def get_delivery_receipt_url(self, obj):
        if obj.kind != IntegrationConnection.Kind.SMS:
            return None
        from apps.platform_config.providers.sms import status_callback_url

        # The token is only shown as "token=..." so admins can copy the full URL into
        # providers that need it; it is the delivery receipt secret, not a login secret.
        token = self._secret_values(obj).get("webhook_secret", "")
        return status_callback_url(obj, "<delivery receipt secret>" if token else "")

    def get_activation_blocker(self, obj):
        from apps.platform_config.services import IntegrationService

        return IntegrationService.activation_blocker(obj)

    def get_activated_by(self, obj):
        return _person(obj.activated_by)

    def get_created_by(self, obj):
        return _person(obj.created_by)

    def get_updated_by(self, obj):
        return _person(obj.updated_by)


class IntegrationTestSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32, help_text="SMS only: send a test message to this number. It is not stored.")


class SSOTrialCompleteSerializer(serializers.Serializer):
    code = serializers.CharField()
    state = serializers.CharField(max_length=160)


class IntegrationHistorySerializer(serializers.Serializer):
    action_type = serializers.CharField()
    actor = serializers.SerializerMethodField()
    created_at = serializers.DateTimeField()
    metadata = serializers.JSONField()

    def get_actor(self, obj):
        return _person(obj.actor)


class PublicConfigSerializer(serializers.Serializer):
    features = serializers.DictField(child=serializers.BooleanField())
    sign_in = serializers.JSONField()


