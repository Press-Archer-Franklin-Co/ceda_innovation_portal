"""U9 (3.23): invite, deactivate and reactivate people."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from apps.accounts import user_admin
from apps.accounts.models import User
from apps.accounts.serializers import UserSummarySerializer
from apps.core.api import api_success
from apps.core.permissions import AuthRateThrottle, HasCapability

TAGS = ["Users"]


class InviteSerializer(serializers.Serializer):
    full_name = serializers.CharField(max_length=300)
    email = serializers.EmailField()
    roles = serializers.ListField(child=serializers.CharField(max_length=60), min_length=1)


class DeactivateSerializer(serializers.Serializer):
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class UserInviteView(APIView):
    permission_classes = [HasCapability.of("users.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Invite someone (3.23)",
        description="{full_name, email, roles: [role codes]}. Makes the account with those roles and emails a sign-in link. "
        "The person shows as status invited until their first sign-in. 400 when the email already has an account.",
        request=InviteSerializer,
        responses={201: UserSummarySerializer},
    )
    def post(self, request):
        serializer = InviteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = user_admin.invite(**serializer.validated_data, actor=request.user)
        return api_success(data=UserSummarySerializer(user).data, message="Invite sent.", status_code=201)


class UserDeactivateView(APIView):
    permission_classes = [HasCapability.of("users.manage")]

    @extend_schema(
        tags=TAGS,
        summary="Deactivate someone (3.23)",
        description="{reason?}. They can no longer sign in and are signed out everywhere. Their work stays. Nobody is deleted. "
        "Refused for yourself and for the last active administrator.",
        request=DeactivateSerializer,
        responses={200: UserSummarySerializer},
    )
    def post(self, request, user_id):
        serializer = DeactivateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = user_admin.deactivate(get_object_or_404(User, id=user_id), actor=request.user, reason=serializer.validated_data["reason"])
        return api_success(data=UserSummarySerializer(user).data, message="Deactivated.")


class UserReactivateView(APIView):
    permission_classes = [HasCapability.of("users.manage")]

    @extend_schema(tags=TAGS, summary="Reactivate someone (3.23)", request=None, responses={200: UserSummarySerializer})
    def post(self, request, user_id):
        user = user_admin.reactivate(get_object_or_404(User, id=user_id), actor=request.user)
        return api_success(data=UserSummarySerializer(user).data, message="Reactivated.")


class VerifyPhoneSerializer(serializers.Serializer):
    phone = serializers.CharField(max_length=32)
    code = serializers.CharField(max_length=10)


class MyPhoneVerifyView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AuthRateThrottle]

    @extend_schema(
        tags=["Auth"],
        summary="Prove my phone with a code",
        description="{phone, code} (code from POST /api/auth/otp/request/). Saves the number as verified, attaches guest ideas with it, and joins a "
        "phone-only WhatsApp or USSD account. 400 phone_other_account when it belongs to another account. Answers {claimed, joined, conflict}.",
        request=VerifyPhoneSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        from apps.accounts.phone_accounts import verify_my_phone

        serializer = VerifyPhoneSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data=verify_my_phone(request.user, serializer.validated_data["phone"], serializer.validated_data["code"]), message="Phone confirmed.")
