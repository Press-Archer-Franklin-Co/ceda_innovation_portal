from django.utils import timezone
from rest_framework import generics, status
from rest_framework.response import Response

from apps.profiles.models import ContactVerification, InnovatorProfile
from apps.profiles.serializers import ContactVerificationSerializer, InnovatorProfileSerializer
from apps.accounts.services import UserOnboardingService


class ProfileView(generics.RetrieveUpdateAPIView):
    serializer_class = InnovatorProfileSerializer

    def get_object(self):
        UserOnboardingService.ensure_user_onboarding(
            self.request.user,
            source="profile_access_repair",
            default_role_codes=[],
            metadata={"compatibility_fallback": True},
        )
        return self.request.user.innovator_profile


class VerifyContactView(generics.GenericAPIView):
    serializer_class = ContactVerificationSerializer

    def post(self, request, *args, **kwargs):
        verification = ContactVerification.objects.create(
            user=request.user,
            channel=request.data.get("channel", "email"),
            target=request.data.get("target", request.user.email),
            code="123456",
            is_verified=True,
            verified_at=timezone.now(),
        )
        return Response(self.get_serializer(verification).data, status=status.HTTP_201_CREATED)
