from django.contrib.auth import authenticate
from rest_framework import serializers

from apps.accounts.models import LoginCode, SocialAccount, User, UserMFAProfile
from apps.accounts.services import RoleService
from apps.core.constants import RoleType
from apps.core.phone import InvalidPhoneNumber, normalize_phone
from apps.profiles.models import InnovatorProfile


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ("id", "email", "first_name", "last_name", "phone_number", "password")
        # Email is optional on the model (phone-only accounts) but still required here.
        extra_kwargs = {"email": {"required": True, "allow_null": False, "allow_blank": False}}

    def create(self, validated_data):
        password = validated_data.pop("password")
        user = User.objects.create_user(password=password, **validated_data)
        from apps.accounts.services import UserOnboardingService, UserSecurityTokenService
        from apps.audit.services import AuditService
        from apps.communications.email_notifications import EmailNotificationService

        UserOnboardingService.ensure_user_onboarding(
            user,
            source="local_registration",
            default_role_codes=[RoleType.INNOVATOR],
            mark_email_verified=False,
            metadata={"method": "password"},
        )
        from apps.accounts.security_services import AccountSecurityService

        AccountSecurityService.sync_identity_ownership(
            user=user,
            preferred_method=User.PrimaryAuthMethod.PASSWORD,
            actor=user,
            reason="local_registration",
        )
        token = UserSecurityTokenService.issue_token(user, "email_verification")
        EmailNotificationService.send_confirmation_email(user=user, verification_token=token.token)
        AuditService.log_action(
            actor=user,
            action_type="local_registration_success",
            target=user,
            metadata={"method": "password"},
        )
        return user


class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField()

    def validate(self, attrs):
        user = authenticate(username=attrs.get("email"), password=attrs.get("password"))
        if not user:
            raise serializers.ValidationError({"detail": "Invalid email or password."})
        if not user.is_active:
            raise serializers.ValidationError({"detail": "This account is disabled."})
        attrs["user"] = user
        return attrs


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField(required=False, allow_blank=False)


class ForgotPasswordSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ResetPasswordSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8)


class VerifyEmailSerializer(serializers.Serializer):
    token = serializers.CharField()


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField(required=False)


class AdminResendVerificationSerializer(serializers.Serializer):
    cc = serializers.ListField(
        child=serializers.EmailField(),
        required=False,
        default=list,
        max_length=10,
    )


class ChangeEmailSerializer(serializers.Serializer):
    email = serializers.EmailField()


class SocialAuthStartSerializer(serializers.Serializer):
    provider = serializers.ChoiceField(choices=("google", "github", "microsoft", "ceda_staff"))


class _LoginCodeTargetSerializer(serializers.Serializer):
    phone = serializers.CharField(required=False, allow_blank=False, max_length=32)
    email = serializers.EmailField(required=False, allow_blank=False)

    def validate_phone(self, value):
        try:
            return normalize_phone(value)
        except InvalidPhoneNumber as exc:
            raise serializers.ValidationError(str(exc)) from exc

    def validate_email(self, value):
        return value.strip().lower()

    def validate(self, attrs):
        has_phone = bool(attrs.get("phone"))
        has_email = bool(attrs.get("email"))
        if has_phone == has_email:
            raise serializers.ValidationError({"detail": "Send either `phone` or `email`, not both."})
        if has_phone:
            attrs["target_type"] = LoginCode.TargetType.PHONE
            attrs["target"] = attrs["phone"]
        else:
            attrs["target_type"] = LoginCode.TargetType.EMAIL
            attrs["target"] = attrs["email"]
        return attrs


class LoginCodeRequestSerializer(_LoginCodeTargetSerializer):
    pass


class LoginCodeRequestResponseSerializer(serializers.Serializer):
    target_type = serializers.CharField()
    channel = serializers.CharField()
    destination_hint = serializers.CharField()
    expires_in_seconds = serializers.IntegerField()
    resend_after_seconds = serializers.IntegerField(help_text='Wait this long before offering "Resend code".')


class LoginCodeVerifySerializer(_LoginCodeTargetSerializer):
    code = serializers.RegexField(r"^\d{6}$", error_messages={"invalid": "Enter the 6-digit code."})


class SocialAuthCompleteSerializer(serializers.Serializer):
    code = serializers.CharField()
    state = serializers.CharField()


class AuthUserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = InnovatorProfile
        fields = (
            "id",
            "national_id",
            "gender",
            "date_of_birth",
            "region",
            "district",
            "sector",
            "business_stage",
            "bio",
            "sector_interests",
            "skills",
            "certifications",
            "portfolio_url",
            "linkedin_url",
            "past_participation_summary",
        )


class AuthenticatedUserSerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    capabilities = serializers.SerializerMethodField(help_text="What this person may do (S1). Ask for these, not for roles.")
    profile = serializers.SerializerMethodField()
    is_admin = serializers.SerializerMethodField()
    mfa_enabled = serializers.SerializerMethodField()
    mfa_method = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "capabilities",
            "email",
            "first_name",
            "last_name",
            "phone_number",
            "email_verified",
            "phone_verified",
            "primary_auth_method",
            "mfa_enabled",
            "mfa_method",
            "is_staff",
            "is_superuser",
            "is_admin",
            "roles",
            "profile",
        )

    def get_capabilities(self, obj) -> list[str]:
        from apps.core.capabilities import capabilities_for

        return capabilities_for(obj)

    def get_roles(self, obj):
        return list(obj.roles.filter(user_roles__is_active=True).values_list("code", flat=True))

    def get_profile(self, obj):
        profile = getattr(obj, "innovator_profile", None)
        if not profile:
            return None
        return AuthUserProfileSerializer(profile).data

    def get_is_admin(self, obj):
        role_codes = set(obj.roles.filter(user_roles__is_active=True).values_list("code", flat=True))
        return bool(obj.is_superuser or RoleType.ADMINISTRATOR in role_codes)

    def get_mfa_enabled(self, obj):
        profile = getattr(obj, "mfa_profile", None)
        return bool(profile and profile.is_enabled)

    def get_mfa_method(self, obj):
        profile = getattr(obj, "mfa_profile", None)
        return profile.method if profile else ""


class UserSummarySerializer(serializers.ModelSerializer):
    roles = serializers.SerializerMethodField()
    primary_role = serializers.SerializerMethodField()
    primary_role_source = serializers.SerializerMethodField()
    primary_auth_method = serializers.CharField(read_only=True)
    auth = serializers.SerializerMethodField()
    full_name = serializers.CharField(read_only=True)

    class Meta:
        model = User
        fields = (
            "id",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "phone_number",
            "email_verified",
            "primary_role",
            "primary_role_source",
            "primary_auth_method",
            "auth",
            "is_active",
            "is_staff",
            "is_superuser",
            "roles",
            "created_at",
            "last_login",
        )

    def get_roles(self, obj):
        return list(obj.roles.filter(user_roles__is_active=True).values_list("code", flat=True))

    def get_primary_role(self, obj):
        primary, _ = RoleService.get_primary_role(obj)
        return primary

    def get_primary_role_source(self, obj):
        _, source = RoleService.get_primary_role(obj)
        return source

    def get_auth(self, obj):
        profile = getattr(obj, "mfa_profile", None)
        providers = list(obj.social_accounts.values_list("provider", flat=True))
        return {
            "provider": obj.primary_auth_method or "",
            "email_verified": obj.email_verified,
            "mfa_enabled": bool(profile and profile.is_enabled),
            "mfa_method": profile.method if profile else "",
            "is_active": obj.is_active,
            "last_login": obj.last_login,
            "created_at": obj.created_at,
            "linked_providers": providers,
        }


class LinkedSocialAccountSerializer(serializers.ModelSerializer):
    provider_name = serializers.CharField(source="get_provider_display", read_only=True)

    class Meta:
        model = SocialAccount
        fields = (
            "id",
            "provider",
            "provider_name",
            "provider_email",
            "provider_email_verified",
            "last_login_at",
            "created_at",
        )


class SocialLinkSerializer(serializers.Serializer):
    code = serializers.CharField(required=False, allow_blank=False)
    state = serializers.CharField(required=False, allow_blank=False)

    def validate(self, attrs):
        has_code = "code" in attrs
        has_state = "state" in attrs
        if has_code != has_state:
            raise serializers.ValidationError("Both `code` and `state` are required to complete provider linking.")
        return attrs


class AccountSecuritySummarySerializer(serializers.Serializer):
    primary_auth_method = serializers.CharField()
    has_password = serializers.BooleanField()
    linked_provider_count = serializers.IntegerField()
    recovery_methods = serializers.ListField(child=serializers.CharField())
    account_risk_flags = serializers.ListField(child=serializers.CharField())
    recommended_actions = serializers.ListField(child=serializers.CharField())
    security_level = serializers.CharField()
    policy_compliant = serializers.BooleanField()
    policy_flags = serializers.ListField(child=serializers.CharField())
    blocking_flags = serializers.ListField(child=serializers.CharField())
    recommended_action_codes = serializers.ListField(child=serializers.CharField())
    enforcement_actions = serializers.ListField(child=serializers.CharField())
    can_continue_without_action = serializers.BooleanField()
    requires_password_fallback = serializers.BooleanField()
    requires_verified_email = serializers.BooleanField()
    requires_additional_recovery_method = serializers.BooleanField()
    linked_accounts = serializers.ListField(child=serializers.DictField())
    can_set_password = serializers.BooleanField()
    can_change_password = serializers.BooleanField()
    mfa_enabled = serializers.BooleanField()
    mfa_method = serializers.CharField(required=False, allow_blank=True)


class MFASetupSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=UserMFAProfile.MFAMethod.choices)


class MFASetupConfirmSerializer(serializers.Serializer):
    method = serializers.ChoiceField(choices=UserMFAProfile.MFAMethod.choices)
    code = serializers.CharField()
    challenge_id = serializers.CharField(required=False)


class MFAChallengeVerifySerializer(serializers.Serializer):
    challenge_id = serializers.CharField()
    code = serializers.CharField()


class MFAChallengeResendSerializer(serializers.Serializer):
    challenge_id = serializers.CharField()


class MFADisableStartSerializer(serializers.Serializer):
    pass


class MFADisableConfirmSerializer(serializers.Serializer):
    challenge_id = serializers.CharField()
    code = serializers.CharField()


class UserRoleUpdateSerializer(serializers.Serializer):
    roles = serializers.ListField(
        child=serializers.ChoiceField(choices=tuple(RoleService.CANONICAL_ROLE_CODES)),
        allow_empty=False,
    )
    role = serializers.ChoiceField(choices=tuple(RoleService.CANONICAL_ROLE_CODES), required=False)


class SetPasswordSerializer(serializers.Serializer):
    password = serializers.CharField(min_length=8)


class ChangePasswordSerializer(serializers.Serializer):
    current_password = serializers.CharField()
    new_password = serializers.CharField(min_length=8)
