from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.db import models
from django.middleware.csrf import get_token
from rest_framework import generics, serializers, status
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError
from drf_spectacular.utils import OpenApiExample, OpenApiResponse, extend_schema, inline_serializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.views import TokenObtainPairView

from apps.accounts import me_profile
from apps.accounts.models import User, UserMFAProfile, MFAChallenge, UserSecurityToken
from apps.accounts.serializers import (
    AccountSecuritySummarySerializer,
    AuthenticatedUserSerializer,
    ChangePasswordSerializer,
    ForgotPasswordSerializer,
    LinkedSocialAccountSerializer,
    LoginCodeRequestResponseSerializer,
    LoginCodeRequestSerializer,
    LoginCodeVerifySerializer,
    LoginSerializer,
    LogoutSerializer,
    RegisterSerializer,
    ResetPasswordSerializer,
    SetPasswordSerializer,
    SocialAuthCompleteSerializer,
    SocialLinkSerializer,
    SocialAuthStartSerializer,
    UserSummarySerializer,
    VerifyEmailSerializer,
    ResendVerificationSerializer,
    ChangeEmailSerializer,
    MFASetupSerializer,
    MFASetupConfirmSerializer,
    MFAChallengeVerifySerializer,
    MFAChallengeResendSerializer,
    MFADisableStartSerializer,
    MFADisableConfirmSerializer,
    UserRoleUpdateSerializer,
    AdminResendVerificationSerializer,
)
from apps.accounts.security_policy import SecurityPolicyService
from apps.accounts.security_services import AccountSecurityService
from apps.accounts.mfa_services import MFAService
from apps.accounts.social_services import SocialAuthService, SocialProviderRegistry
from apps.accounts.services import UserSecurityTokenService
from apps.audit.services import AuditService
from apps.communications.email_notifications import EmailNotificationService
from apps.core.api import api_success
from apps.core.permissions import HasCapability, IsOfficerAdminOrManagementReadOnly, IsAdministrator, AuthRateThrottle
from apps.platform_config.flags import require_feature


def _login_backend() -> str:
    backends = getattr(settings, "AUTHENTICATION_BACKENDS", ["django.contrib.auth.backends.ModelBackend"])
    return backends[0]


def _establish_browser_session(request, user) -> None:
    if not hasattr(user, "backend"):
        user.backend = _login_backend()
    django_login(request, user, backend=user.backend)
    get_token(request)


@extend_schema(
    tags=["Authentication"],
    summary="Register innovator account",
    description="Creates a new user account and assigns the default `innovator` role.",
    examples=[
        OpenApiExample(
            "Register payload",
            value={
                "email": "innovator@example.com",
                "first_name": "Neo",
                "last_name": "Kebadile",
                "phone_number": "+26771234567",
                "password": "StrongPass123!",
            },
            request_only=True,
        )
    ],
)
class RegisterView(generics.CreateAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def create(self, request, *args, **kwargs):
        require_feature("password_sign_in")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return api_success(data=RegisterSerializer(user).data, status_code=status.HTTP_201_CREATED)


@extend_schema(
    tags=["Authentication"],
    summary="Login",
    description="Returns JWT access and refresh tokens. Use the returned access token as `Bearer <token>`.",
    examples=[
        OpenApiExample(
            "Login payload",
            value={"email": "innovator@example.com", "password": "StrongPass123!"},
            request_only=True,
        )
    ],
)
class LoginView(TokenObtainPairView):
    serializer_class = LoginSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        require_feature("password_sign_in")
        serializer = self.get_serializer(data=request.data)

        if not serializer.is_valid():
            raise ValidationError(serializer.errors)

        user = serializer.validated_data["user"]
        if MFAService.is_enabled(user):
            profile = MFAService.ensure_profile(user)
            challenge = MFAService.issue_challenge(
                user=user,
                method=profile.method,
                purpose="login",
                auth_method=User.PrimaryAuthMethod.PASSWORD,
            )
            return Response(
                {
                    "mfa_required": True,
                    "challenge_id": challenge.id,
                    "method": challenge.method,
                    "email_hint": challenge.email_hint,
                    "expires_at": challenge.expires_at,
                },
                status=status.HTTP_200_OK,
            )
        from apps.accounts.auth_identity_service import AuthIdentityService

        tokens = AuthIdentityService.finalize_local_login(user=user)
        _establish_browser_session(request, user)
        payload = {
            **tokens,
            "user": AuthenticatedUserSerializer(user).data,
        }
        return Response(payload, status=status.HTTP_200_OK)


class LogoutView(generics.GenericAPIView):
    serializer_class = LogoutSerializer

    @extend_schema(
        tags=["Authentication"],
        summary="Logout",
        description="Blacklists the provided refresh token.",
        examples=[OpenApiExample("Logout payload", value={"refresh": "your-refresh-token"}, request_only=True)],
        responses={205: OpenApiResponse(description="Refresh token blacklisted successfully.")},
    )
    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        refresh = serializer.validated_data.get("refresh")
        if refresh:
            token = RefreshToken(refresh)
            token.blacklist()
        django_logout(request)
        response = api_success(message="Logged out successfully.", status_code=status.HTTP_205_RESET_CONTENT)
        response.delete_cookie(settings.SESSION_COOKIE_NAME, path="/")
        return response


@extend_schema(
    tags=["Authentication"],
    summary="Refresh access token",
    description="Returns a fresh access token, rotated refresh token, and the current authenticated user profile payload.",
    examples=[
        OpenApiExample(
            "Refresh payload",
            value={"refresh": "your-refresh-token"},
            request_only=True,
        )
    ],
)
class RefreshView(generics.GenericAPIView):
    permission_classes = [AllowAny]
    serializer_class = TokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

        serializer = self.get_serializer(data=request.data)
        try:
            serializer.is_valid(raise_exception=True)
        except TokenError as exc:
            # A blacklisted or expired refresh token is a 401, not a server error.
            raise InvalidToken(exc.args[0]) from exc

        refresh_token = RefreshToken(serializer.validated_data["refresh"])
        from apps.accounts.sessions import check_refresh

        check_refresh(refresh_token)
        user = User.objects.filter(id=refresh_token.get("user_id")).first()
        if not user:
            return Response({"detail": "User not found for refresh token."}, status=status.HTTP_401_UNAUTHORIZED)
        from apps.accounts.services import UserOnboardingService

        UserOnboardingService.ensure_user_onboarding(
            user,
            source="token_refresh",
            default_role_codes=[],
            metadata={"method": "refresh_token"},
        )

        payload = {
            **serializer.validated_data,
            "user": AuthenticatedUserSerializer(user).data,
        }
        return Response(payload, status=status.HTTP_200_OK)


class ForgotPasswordView(generics.GenericAPIView):
    serializer_class = ForgotPasswordSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(email=serializer.validated_data["email"]).first()
        if user:
            token = UserSecurityTokenService.issue_token(user, "password_reset")
            EmailNotificationService.send_password_reset_email(user=user, reset_token=token.token)
        return api_success(data={"email": serializer.validated_data["email"]}, message="If the email exists, a reset token has been sent.", status_code=status.HTTP_200_OK)


class ResetPasswordView(generics.GenericAPIView):
    serializer_class = ResetPasswordSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        token = UserSecurityTokenService.consume_token(serializer.validated_data["token"], "password_reset")
        user = token.user
        user.set_password(serializer.validated_data["password"])
        user.save(update_fields=["password"])
        EmailNotificationService.send_password_changed_email(user=user)
        AuditService.log_action(
            actor=user,
            action_type="password_reset_completed",
            target=user,
            metadata={"via_token": True},
        )
        return api_success(message="Password reset successful.", status_code=status.HTTP_200_OK)


class VerifyEmailView(generics.GenericAPIView):
    serializer_class = VerifyEmailSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            token = UserSecurityTokenService.consume_token(serializer.validated_data["token"], "email_verification")
        except ValueError:
            stale_token = UserSecurityToken.objects.filter(
                token=serializer.validated_data["token"],
                purpose="email_verification",
            ).select_related("user").first()
            if stale_token and stale_token.user.email_verified:
                return api_success(
                    data={"already_verified": True, "user": AuthenticatedUserSerializer(stale_token.user).data},
                    message="Email address is already verified.",
                    status_code=status.HTTP_200_OK,
                )
            raise ValidationError({"token": "Verification token is invalid or expired."})
        user = token.user
        user.email_verified = True
        user.save(update_fields=["email_verified"])
        if user.email:
            from apps.accounts.phone_accounts import email_proved

            email_proved(user, user.email, source="email_verification", actor=user)
        from apps.accounts.auth_identity_service import AuthIdentityService

        tokens = AuthIdentityService.finalize_local_login(user=user)
        _establish_browser_session(request, user)
        AuditService.log_action(
            actor=user,
            action_type="email_verification_completed",
            target=user,
            metadata={"via_token": True},
        )
        return api_success(
            data={"access": tokens["access"], "refresh": tokens["refresh"], "user": AuthenticatedUserSerializer(user).data},
            message="Email verified successfully.",
            status_code=status.HTTP_200_OK,
        )


class ResendVerificationView(generics.GenericAPIView):
    serializer_class = ResendVerificationSerializer
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data.get("email")
        user = request.user if request.user.is_authenticated else None
        if not user and email:
            user = User.objects.filter(email__iexact=email).first()
        if user and not user.email_verified:
            token = UserSecurityTokenService.issue_token(user, "email_verification")
            EmailNotificationService.send_confirmation_email(user=user, verification_token=token.token)
        return api_success(message="If the email exists, a new verification link has been sent.", status_code=status.HTTP_200_OK)


class ChangeEmailView(generics.GenericAPIView):
    serializer_class = ChangeEmailSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        new_email = serializer.validated_data["email"].strip().lower()
        if User.objects.filter(email__iexact=new_email).exclude(id=request.user.id).exists():
            raise ValidationError({"email": "This email address is already in use."})
        request.user.email = new_email
        request.user.email_verified = False
        request.user.save(update_fields=["email", "email_verified", "updated_at"])
        token = UserSecurityTokenService.issue_token(request.user, "email_verification")
        EmailNotificationService.send_confirmation_email(user=request.user, verification_token=token.token)
        AuditService.log_action(
            actor=request.user,
            action_type="email_change_requested",
            target=request.user,
            metadata={"new_email": new_email},
        )
        return api_success(message="Email updated. Please verify your new email address.", status_code=status.HTTP_200_OK)


class SocialProviderListView(generics.GenericAPIView):
    permission_classes = [AllowAny]

    def get(self, request, *args, **kwargs):
        return Response({"providers": SocialProviderRegistry.list_social_providers()}, status=status.HTTP_200_OK)


class UserListPagination(PageNumberPagination):
    page_size = 25
    page_size_query_param = "page_size"
    max_page_size = 100


class UserListView(generics.ListAPIView):
    permission_classes = [IsAdministrator]
    serializer_class = UserSummarySerializer
    pagination_class = UserListPagination

    def get_queryset(self):
        queryset = User.objects.prefetch_related("roles", "social_accounts", "mfa_profile").order_by("first_name", "last_name", "email")
        role = self.request.query_params.get("role")
        active = self.request.query_params.get("active")
        verified = self.request.query_params.get("verified")
        search = self.request.query_params.get("search")
        if role:
            from apps.accounts.services import RoleService
            role_codes = [role]
            if role == "innovation_officer":
                role_codes = [role, *RoleService.LEGACY_ROLE_MAP.keys()]
            queryset = queryset.filter(roles__code__in=role_codes, user_roles__is_active=True)
        if active in {"true", "false"}:
            queryset = queryset.filter(is_active=(active == "true"))
        # U9 (3.23): status=active|invited|deactivated
        user_status = self.request.query_params.get("status")
        if user_status == "deactivated":
            queryset = queryset.filter(is_active=False)
        elif user_status == "invited":
            queryset = queryset.filter(is_active=True, invited_at__isnull=False, last_login__isnull=True)
        elif user_status == "active":
            queryset = queryset.filter(is_active=True).exclude(invited_at__isnull=False, last_login__isnull=True)
        if verified in {"true", "false"}:
            queryset = queryset.filter(email_verified=(verified == "true"))
        if search:
            queryset = queryset.filter(
                models.Q(first_name__icontains=search)
                | models.Q(last_name__icontains=search)
                | models.Q(email__icontains=search)
                | models.Q(phone_number__icontains=search)
            )
        return queryset.distinct()


class UserRoleUpdateView(generics.GenericAPIView):
    permission_classes = [HasCapability.of("users.manage")]
    serializer_class = UserRoleUpdateSerializer

    def patch(self, request, user_id, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        from apps.accounts.services import RoleService
        roles = serializer.validated_data.get("roles")
        if not roles:
            role = serializer.validated_data.get("role")
            roles = [role] if role else []
        try:
            RoleService.set_roles(user=user, role_codes=roles, actor=request.user, reason="admin_role_update")
        except ValueError as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"roles": str(exc)})
        return api_success(data=UserSummarySerializer(user).data, status_code=status.HTTP_200_OK)


class AdminResendVerificationView(generics.GenericAPIView):
    permission_classes = [IsAdministrator]
    serializer_class = AdminResendVerificationSerializer

    def post(self, request, user_id, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(id=user_id).first()
        if not user:
            return Response({"detail": "User not found."}, status=status.HTTP_404_NOT_FOUND)
        if user.email_verified:
            return Response({"detail": "This user's email is already verified."}, status=status.HTTP_400_BAD_REQUEST)
        cc = serializer.validated_data.get("cc", [])
        from apps.communications.email_notifications import EmailNotificationService
        token = UserSecurityTokenService.issue_token(user, "email_verification")
        EmailNotificationService.send_admin_resend_verification_email(
            user=user,
            verification_token=token.token,
            sent_by=request.user,
            cc=cc,
        )
        AuditService.log_action(
            actor=request.user,
            action_type="admin_resend_verification",
            target=user,
            metadata={"cc": cc},
        )
        return api_success(
            message=f"Verification email sent to {user.email}.",
            status_code=status.HTTP_200_OK,
        )


class SocialAuthStartView(generics.GenericAPIView):
    serializer_class = SocialAuthStartSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, provider, *args, **kwargs):
        serializer = self.get_serializer(data={"provider": provider})
        serializer.is_valid(raise_exception=True)
        payload = SocialAuthService.begin(serializer.validated_data["provider"])
        return Response({"authorization_url": payload["authorization_url"]}, status=status.HTTP_200_OK)


class SocialAuthCompleteView(generics.GenericAPIView):
    serializer_class = SocialAuthCompleteSerializer
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request, provider, *args, **kwargs):
        provider_serializer = SocialAuthStartSerializer(data={"provider": provider})
        provider_serializer.is_valid(raise_exception=True)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = SocialAuthService.complete(
            provider=provider_serializer.validated_data["provider"],
            code=serializer.validated_data["code"],
            state=serializer.validated_data["state"],
        )
        user = result["user"]
        if MFAService.is_enabled(user):
            profile = MFAService.ensure_profile(user)
            challenge = MFAService.issue_challenge(
                user=user,
                method=profile.method,
                purpose="login",
                auth_method=result["provider"],
            )
            return Response(
                {
                    "mfa_required": True,
                    "challenge_id": challenge.id,
                    "method": challenge.method,
                    "email_hint": challenge.email_hint,
                    "expires_at": challenge.expires_at,
                    "provider": result["provider"],
                    "created": result["created"],
                    "linked_existing_account": result["linked_existing_account"],
                },
                status=status.HTTP_200_OK,
            )
        _establish_browser_session(request, user)
        return Response(
            {
                "access": result["tokens"]["access"],
                "refresh": result["tokens"]["refresh"],
                "user": AuthenticatedUserSerializer(user).data,
                "created": result["created"],
                "linked_existing_account": result["linked_existing_account"],
                "provider": result["provider"],
            },
            status=status.HTTP_200_OK,
        )


class LinkedSocialAccountsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        accounts = request.user.social_accounts.order_by("provider", "created_at")
        serializer = LinkedSocialAccountSerializer(accounts, many=True)
        return api_success(data={"linked_accounts": serializer.data}, status_code=status.HTTP_200_OK)


class AccountSecurityView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        AccountSecurityService.sync_identity_ownership(user=request.user, actor=request.user, reason="account_security_view")
        state = AccountSecurityService.build_security_state(user=request.user)
        policy = SecurityPolicyService.evaluate(user=request.user, state=state)
        serializer = AccountSecuritySummarySerializer(
            {
                "primary_auth_method": state.primary_auth_method,
                "has_password": state.has_password,
                "linked_provider_count": state.linked_provider_count,
                "recovery_methods": state.recovery_methods,
                "account_risk_flags": state.account_risk_flags,
                "recommended_actions": policy.recommended_actions,
                "security_level": policy.security_level,
                "policy_compliant": policy.policy_compliant,
                "policy_flags": policy.policy_flags,
                "blocking_flags": policy.blocking_flags,
                "recommended_action_codes": policy.recommended_action_codes,
                "enforcement_actions": policy.enforcement_actions,
                "can_continue_without_action": policy.can_continue_without_action,
                "requires_password_fallback": policy.requires_password_fallback,
                "requires_verified_email": policy.requires_verified_email,
                "requires_additional_recovery_method": policy.requires_additional_recovery_method,
                "linked_accounts": state.linked_accounts,
                "can_set_password": state.can_set_password,
                "can_change_password": state.can_change_password,
                "mfa_enabled": bool(getattr(request.user, "mfa_profile", None) and request.user.mfa_profile.is_enabled),
                "mfa_method": getattr(getattr(request.user, "mfa_profile", None), "method", ""),
            }
        )
        return api_success(data=serializer.data, status_code=status.HTTP_200_OK)


class AuthMeView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return api_success(data=AuthenticatedUserSerializer(request.user, context={"request": request}).data, status_code=status.HTTP_200_OK)

    @extend_schema(
        tags=["Authentication"],
        summary="Change my name, phone or language (R-48 3.39, R-51 2.9)",
        description="Any of first_name, last_name, phone_number (for WhatsApp alerts; changing it clears phone_verified), preferred_language: en|tn.",
        request=me_profile.MeUpdateSerializer,
    )
    def patch(self, request, *args, **kwargs):
        serializer = me_profile.MeUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        me_profile.update_me(request.user, serializer.validated_data)
        return api_success(data=AuthenticatedUserSerializer(request.user, context={"request": request}).data, message="Saved.")


class AuthMePhotoView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser]

    @extend_schema(tags=["Authentication"], summary="Change my photo", description="multipart file: a JPG or PNG up to 5 MB. Saved as a 512 px square.")
    def post(self, request, *args, **kwargs):
        me_profile.set_photo(request.user, request.FILES.get("file"))
        return api_success(data={"photo_url": me_profile.photo_url(request.user, request)}, message="Photo saved.")

    @extend_schema(tags=["Authentication"], summary="Remove my photo")
    def delete(self, request, *args, **kwargs):
        me_profile.remove_photo(request.user)
        return api_success(data={"photo_url": None}, message="Photo removed.")


class MFASetupView(generics.GenericAPIView):
    serializer_class = MFASetupSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data["method"]
        if method == UserMFAProfile.MFAMethod.EMAIL:
            challenge = MFAService.issue_challenge(user=request.user, method=method, purpose="setup")
            return api_success(
                data={
                    "method": method,
                    "challenge_id": challenge.id,
                    "email_hint": challenge.email_hint,
                    "expires_at": challenge.expires_at,
                },
                status_code=status.HTTP_200_OK,
            )
        payload = MFAService.start_totp_setup(user=request.user)
        return api_success(data={"method": method, **payload}, status_code=status.HTTP_200_OK)


class MFASetupConfirmView(generics.GenericAPIView):
    serializer_class = MFASetupConfirmSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        method = serializer.validated_data["method"]
        code = serializer.validated_data["code"]
        if method == UserMFAProfile.MFAMethod.EMAIL:
            challenge_id = serializer.validated_data.get("challenge_id")
            if not challenge_id:
                raise ValidationError({"challenge_id": "challenge_id is required for email verification."})
            MFAService.verify_challenge(challenge_id=challenge_id, code=code, expected_purpose="setup")
            profile = MFAService.enable_email_otp(user=request.user)
        else:
            profile = MFAService.confirm_totp_setup(user=request.user, code=code)
        return api_success(data={"mfa_enabled": profile.is_enabled, "mfa_method": profile.method}, status_code=status.HTTP_200_OK)


class MFADisableStartView(generics.GenericAPIView):
    serializer_class = MFADisableStartSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        profile = MFAService.ensure_profile(request.user)
        if not profile.is_enabled or not profile.method:
            raise ValidationError({"detail": "Multi-factor authentication is not enabled for this account."})
        challenge = MFAService.issue_challenge(user=request.user, method=profile.method, purpose="disable")
        return api_success(
            data={
                "method": profile.method,
                "challenge_id": challenge.id,
                "email_hint": challenge.email_hint,
                "expires_at": challenge.expires_at,
            },
            status_code=status.HTTP_200_OK,
        )


class MFADisableConfirmView(generics.GenericAPIView):
    serializer_class = MFADisableConfirmSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        MFAService.verify_challenge(
            challenge_id=serializer.validated_data["challenge_id"],
            code=serializer.validated_data["code"],
            expected_purpose="disable",
        )
        profile = MFAService.disable_mfa(user=request.user)
        return api_success(data={"mfa_enabled": profile.is_enabled, "mfa_method": profile.method}, status_code=status.HTTP_200_OK)


class MFAChallengeVerifyView(generics.GenericAPIView):
    serializer_class = MFAChallengeVerifySerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = MFAService.verify_challenge(
            challenge_id=serializer.validated_data["challenge_id"],
            code=serializer.validated_data["code"],
            expected_purpose="login",
        )
        auth_method = challenge.auth_method or User.PrimaryAuthMethod.PASSWORD
        if auth_method == User.PrimaryAuthMethod.PASSWORD:
            from apps.accounts.auth_identity_service import AuthIdentityService

            tokens = AuthIdentityService.finalize_local_login(user=challenge.user)
        else:
            from apps.accounts.services import AuthTokenService

            AccountSecurityService.sync_identity_ownership(
                user=challenge.user,
                preferred_method=auth_method,
                actor=challenge.user,
                reason="mfa_login",
            )
            tokens = AuthTokenService.issue_tokens(challenge.user)
        _establish_browser_session(request, challenge.user)
        return Response(
            {
                "access": tokens["access"],
                "refresh": tokens["refresh"],
                "user": AuthenticatedUserSerializer(challenge.user).data,
            },
            status=status.HTTP_200_OK,
        )


class MFAChallengeResendView(generics.GenericAPIView):
    serializer_class = MFAChallengeResendSerializer
    permission_classes = [AllowAny]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        challenge = MFAChallenge.objects.select_related("user").filter(
            id=serializer.validated_data["challenge_id"],
            used_at__isnull=True,
        ).first()
        if not challenge:
            raise ValidationError({"detail": "Unable to resend a code for this request."})
        new_challenge = MFAService.issue_challenge(
            user=challenge.user,
            method=challenge.method,
            purpose=challenge.purpose,
            auth_method=challenge.auth_method,
        )
        return api_success(
            data={
                "challenge_id": new_challenge.id,
                "method": new_challenge.method,
                "email_hint": new_challenge.email_hint,
                "expires_at": new_challenge.expires_at,
            },
            status_code=status.HTTP_200_OK,
        )


class SetPasswordView(generics.GenericAPIView):
    serializer_class = SetPasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AccountSecurityService.set_password_for_user(user=request.user, new_password=serializer.validated_data["password"])
        return api_success(message="Password set successfully.", status_code=status.HTTP_200_OK)


class ChangePasswordView(generics.GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        AccountSecurityService.change_password_for_user(
            user=request.user,
            current_password=serializer.validated_data["current_password"],
            new_password=serializer.validated_data["new_password"],
        )
        return api_success(message="Password changed successfully.", status_code=status.HTTP_200_OK)


class SocialAccountLinkView(generics.GenericAPIView):
    serializer_class = SocialLinkSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request, provider, *args, **kwargs):
        provider_serializer = SocialAuthStartSerializer(data={"provider": provider})
        provider_serializer.is_valid(raise_exception=True)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if serializer.validated_data.get("code") and serializer.validated_data.get("state"):
            account = SocialAuthService.complete_link(
                provider=provider_serializer.validated_data["provider"],
                user=request.user,
                code=serializer.validated_data["code"],
                state=serializer.validated_data["state"],
            )
            return api_success(
                data={"linked_account": LinkedSocialAccountSerializer(account).data},
                message=f"{account.get_provider_display()} linked successfully.",
                status_code=status.HTTP_200_OK,
            )
        payload = SocialAuthService.begin_link(
            provider=provider_serializer.validated_data["provider"],
            user=request.user,
        )
        return Response(payload, status=status.HTTP_200_OK)

    def delete(self, request, provider, *args, **kwargs):
        provider_serializer = SocialAuthStartSerializer(data={"provider": provider})
        provider_serializer.is_valid(raise_exception=True)
        SocialAuthService.unlink(
            provider=provider_serializer.validated_data["provider"],
            user=request.user,
        )
        return api_success(message="Provider unlinked successfully.", status_code=status.HTTP_200_OK)


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    return forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")


@extend_schema(
    tags=["Authentication"],
    summary="Request a sign-in code",
    description=(
        "Sends a 6-digit sign-in code to a phone (SMS) or email address. The code is valid for 10 minutes "
        "and allows 5 tries. The response is the same whether or not an account exists. "
        "Phone numbers are stored in E.164 form; 8-digit numbers are treated as Botswana (+267)."
    ),
    request=LoginCodeRequestSerializer,
    responses={200: LoginCodeRequestResponseSerializer},
    examples=[
        OpenApiExample("By phone", value={"phone": "71234567"}, request_only=True),
        OpenApiExample("By email", value={"email": "innovator@example.com"}, request_only=True),
    ],
)
class LoginCodeRequestView(generics.GenericAPIView):
    serializer_class = LoginCodeRequestSerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        require_feature("code_sign_in")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from apps.accounts.otp_services import OTPService

        OTPService.assert_channel_available(serializer.validated_data["target_type"], serializer.validated_data["target"])
        result = OTPService.request_code(
            target_type=serializer.validated_data["target_type"],
            target=serializer.validated_data["target"],
            ip=_client_ip(request),
        )
        return api_success(
            data=LoginCodeRequestResponseSerializer(result).data,
            message="If the details are valid, a sign-in code has been sent.",
            status_code=status.HTTP_200_OK,
        )


@extend_schema(
    tags=["Authentication"],
    summary="Sign in with a code",
    description=(
        "Checks a sign-in code. An existing account is signed in; otherwise a new innovator account is created "
        "for that phone or email. Returns the same `access`, `refresh` and `user` payload as password login, plus "
        "`created`. If the account has MFA switched on, returns an MFA challenge instead, as password login does."
    ),
    request=LoginCodeVerifySerializer,
    responses={
        200: inline_serializer(
            "LoginCodeVerifyResponse",
            fields={
                "access": serializers.CharField(required=False, help_text="Missing when mfa_required is true."),
                "refresh": serializers.CharField(required=False),
                "user": AuthenticatedUserSerializer(required=False),
                "created": serializers.BooleanField(help_text="A new innovator account was made for this phone or email."),
                "mfa_required": serializers.BooleanField(required=False),
                "challenge_id": serializers.UUIDField(required=False),
                "method": serializers.CharField(required=False),
                "email_hint": serializers.CharField(required=False),
                "expires_at": serializers.DateTimeField(required=False),
            },
        )
    },
    examples=[OpenApiExample("Verify", value={"phone": "+26771234567", "code": "123456"}, request_only=True)],
)
class LoginCodeVerifyView(generics.GenericAPIView):
    serializer_class = LoginCodeVerifySerializer
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    def post(self, request, *args, **kwargs):
        require_feature("code_sign_in")
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from apps.accounts.otp_services import OTPService

        result = OTPService.verify_code(
            target_type=serializer.validated_data["target_type"],
            target=serializer.validated_data["target"],
            code=serializer.validated_data["code"],
        )
        user = result.user
        if MFAService.is_enabled(user):
            profile = MFAService.ensure_profile(user)
            challenge = MFAService.issue_challenge(
                user=user,
                method=profile.method,
                purpose="login",
                auth_method=result.auth_method,
            )
            return Response(
                {
                    "mfa_required": True,
                    "challenge_id": challenge.id,
                    "method": challenge.method,
                    "email_hint": challenge.email_hint,
                    "expires_at": challenge.expires_at,
                    "created": result.created,
                },
                status=status.HTTP_200_OK,
            )
        tokens = OTPService.finalize_login(user=user, auth_method=result.auth_method)
        _establish_browser_session(request, user)
        return Response(
            {
                **tokens,
                "user": AuthenticatedUserSerializer(user).data,
                "created": result.created,
            },
            status=status.HTTP_200_OK,
        )



# R-51 (2.9): where I am signed in, and deleting my account ---------------------------------------------------------


class AccountSessionsView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Authentication"], summary="Where I am signed in (2.9)", description="[{id, device, place, last_seen, signed_in_at, current}]. place is null: we do not look up locations.")
    def get(self, request, *args, **kwargs):
        from apps.accounts.sessions import listing

        return api_success(data=listing(request.user, request))


class AccountSessionSignOutView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Authentication"], summary="Sign out one place (2.9)", description="Ends that sign-in: its next refresh is refused, so it is signed out within a few minutes.", request=None)
    def post(self, request, session_id=None, *args, **kwargs):
        from apps.accounts.sessions import end

        end(request.user, session_id, actor=request.user)
        return api_success(data={"signed_out": True})


class DeleteMyAccountSerializer(serializers.Serializer):
    confirm = serializers.CharField()

    def validate_confirm(self, value):
        if value != "DELETE":
            raise serializers.ValidationError('Type DELETE to confirm.')
        return value


class DeleteMyAccountView(generics.GenericAPIView):
    permission_classes = [IsAuthenticated]
    serializer_class = DeleteMyAccountSerializer

    @extend_schema(tags=["Authentication"], summary="Delete my account (2.9)", description='{confirm: "DELETE"}. Removes your contact details and signs you out everywhere. Ideas already sent stay with CEDA.', request=DeleteMyAccountSerializer)
    def post(self, request, *args, **kwargs):
        from apps.accounts.sessions import delete_account

        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        delete_account(request.user)
        return api_success(data={"deleted": True}, message="Your account is deleted.")
