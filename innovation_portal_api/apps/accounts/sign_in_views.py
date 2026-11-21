"""U7 endpoints: one sign-in for everyone (see apps.accounts.sign_in_flow)."""
from __future__ import annotations

import ipaddress

from drf_spectacular.utils import extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts import demo_logins, sign_in_flow
from apps.accounts.models import AuthPolicy, User
from apps.accounts.serializers import AuthenticatedUserSerializer
from apps.audit.services import AuditService
from apps.core.api import api_success
from apps.core.permissions import AuthRateThrottle, HasCapability
from apps.platform_config.flags import require_feature

TAGS = ["Authentication"]


def client_ip(request) -> str | None:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    raw = forwarded.split(",")[0].strip() if forwarded else request.META.get("REMOTE_ADDR", "")
    try:
        return str(ipaddress.ip_address(raw))
    except ValueError:
        return None


def signed_in_response(request, user, *, auth_method: str, next_path: str | None, extra: dict | None = None) -> Response:
    """Tokens, browser session and where to go next. Same shape as the old login answers."""
    from apps.accounts.otp_services import OTPService
    from apps.accounts.views import _establish_browser_session

    tokens = OTPService.finalize_login(user=user, auth_method=auth_method)
    _establish_browser_session(request, user)
    return Response(
        {
            **tokens,
            "user": AuthenticatedUserSerializer(user).data,
            "redirect": sign_in_flow.safe_redirect(user, next_path),
            **(extra or {}),
        },
        status=status.HTTP_200_OK,
    )


def mfa_response(user, *, auth_method: str) -> Response:
    from apps.accounts.mfa_services import MFAService

    profile = MFAService.ensure_profile(user)
    challenge = MFAService.issue_challenge(user=user, method=profile.method, purpose="login", auth_method=auth_method)
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


class StartSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    want_code = serializers.BooleanField(required=False, default=False, help_text='"Forgot password?": send a one-time code instead.')


class FinishSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    code = serializers.RegexField(r"^\d{6}$", required=False, error_messages={"invalid": "Enter the 6-digit code."})
    password = serializers.CharField(required=False, trim_whitespace=False, max_length=256)
    next = serializers.CharField(required=False, allow_blank=True, max_length=500)

    def validate(self, attrs):
        if bool(attrs.get("code")) == bool(attrs.get("password")):
            raise serializers.ValidationError({"code": "code_or_password", "detail": "Send the code or the password."})
        return attrs


class SignupSerializer(serializers.Serializer):
    identifier = serializers.CharField(max_length=254)
    full_name = serializers.CharField(max_length=300)
    phone = serializers.CharField(required=False, allow_blank=True, max_length=32)
    email = serializers.CharField(required=False, allow_blank=True, max_length=254)
    language = serializers.ChoiceField(choices=("en", "tn"), required=False, default="en")
    consent = serializers.BooleanField(required=False, default=False)
    password = serializers.CharField(required=False, allow_blank=True, trim_whitespace=False, max_length=256)
    next = serializers.CharField(required=False, allow_blank=True, max_length=500)


class DemoLoginSerializer(serializers.Serializer):
    account = serializers.UUIDField()
    next = serializers.CharField(required=False, allow_blank=True, max_length=500)


class AuthPolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = AuthPolicy
        fields = ("second_step", "updated_at")
        read_only_fields = ("updated_at",)


class AuthStartView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=TAGS, summary="Sign-in step 1: phone number or email; says what comes next", request=StartSerializer, responses=None)
    def post(self, request):
        serializer = StartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        result = sign_in_flow.start(
            serializer.validated_data["identifier"], ip=client_ip(request), want_code=serializer.validated_data["want_code"]
        )
        return Response(result, status=status.HTTP_200_OK)


class AuthFinishView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=TAGS, summary="Sign-in step 2: the code or the password", request=FinishSerializer, responses=None)
    def post(self, request):
        from apps.accounts.mfa_services import MFAService

        serializer = FinishSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        identifier = sign_in_flow.parse_identifier(data["identifier"])
        if data.get("code"):
            result = sign_in_flow.check_code_for(identifier, data["code"])
            user, auth_method = result.user, result.auth_method
        else:
            require_feature("password_sign_in")
            user = sign_in_flow.check_password_for(identifier, data["password"])
            auth_method = User.PrimaryAuthMethod.PASSWORD
        demo_logins.assert_can_sign_in(user)
        if MFAService.is_enabled(user) and not (user.is_demo_account and demo_logins.enabled()):
            return mfa_response(user, auth_method=auth_method)
        return signed_in_response(request, user, auth_method=auth_method, next_path=data.get("next"))


class AuthSignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=TAGS, summary='"One more step": make the account for a new phone number or email', request=SignupSerializer, responses=None)
    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user, nxt = sign_in_flow.signup(
            identifier_raw=data["identifier"],
            full_name=data["full_name"],
            phone=data.get("phone", ""),
            email=data.get("email", ""),
            language=data.get("language", "en"),
            consent=data.get("consent", False),
            password=data.get("password", ""),
            ip=client_ip(request),
        )
        if nxt.get("next") == "signed_in":
            return signed_in_response(request, user, auth_method=User.PrimaryAuthMethod.PASSWORD, next_path=data.get("next"), extra={"created": True})
        return Response({**nxt, "created": True}, status=status.HTTP_201_CREATED)


class DemoLoginView(APIView):
    """One click on the sign-in page's Test accounts list. 404 unless both demo gates are on."""

    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [AuthRateThrottle]

    @extend_schema(tags=TAGS, summary="Sign in as a test account (demo servers only)", request=DemoLoginSerializer, responses=None)
    def post(self, request):
        demo_logins.require_enabled()
        serializer = DemoLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = User.objects.filter(id=serializer.validated_data["account"], is_demo_account=True, is_active=True).first()
        if user is None:
            from django.http import Http404

            raise Http404
        AuditService.log_action(actor=user, action_type="demo_login", target=user, metadata={"ip": client_ip(request) or ""})
        return signed_in_response(request, user, auth_method=User.PrimaryAuthMethod.PASSWORD, next_path=serializer.validated_data.get("next"))


class AuthPolicyView(APIView):
    """Platform settings: which second step everyone uses after typing their phone or email."""

    permission_classes = [HasCapability.of("settings.manage")]

    @extend_schema(tags=TAGS, summary="Get the sign-in second step setting", responses=AuthPolicySerializer)
    def get(self, request):
        return api_success(data=AuthPolicySerializer(AuthPolicy.current()).data)

    @extend_schema(tags=TAGS, summary="Change the sign-in second step setting", request=AuthPolicySerializer, responses=AuthPolicySerializer)
    def patch(self, request):
        policy = AuthPolicy.current()
        before = policy.second_step
        serializer = AuthPolicySerializer(policy, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        policy = serializer.save(updated_by=request.user)
        AuditService.log_action(
            actor=request.user, action_type="auth_second_step_changed", target=policy,
            before_state={"second_step": before}, after_state={"second_step": policy.second_step},
        )
        return api_success(data=AuthPolicySerializer(policy).data, message="Sign-in setting saved.")
