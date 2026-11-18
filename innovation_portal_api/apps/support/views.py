from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import OpenApiExample, extend_schema

from apps.core.permissions import IsOfficerOrAdmin
from apps.support.models import FAQ, Guideline, InternalTask, SupportRequest
from apps.support.serializers import FAQSerializer, GuidelineSerializer, InternalTaskSerializer, SupportRequestSerializer


@extend_schema(tags=["Support"], summary="List public FAQs")
class PublicFAQListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = FAQSerializer

    def get_queryset(self):
        return FAQ.objects.filter(is_public=True).order_by("ordering", "question")


@extend_schema(tags=["Support"], summary="List public guidelines")
class PublicGuidelineListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = GuidelineSerializer

    def get_queryset(self):
        return Guideline.objects.filter(is_public=True).order_by("title")


@extend_schema(
    tags=["Support"],
    summary="Create support request",
    description="Allows guests or authenticated users to log a support ticket, technical help request, complaint, or appeal foundation record.",
    examples=[
        OpenApiExample(
            "Support request payload",
            value={
                "request_type": "technical_support",
                "subject": "Unable to submit my draft",
                "description": "The form saves but submit returns an error.",
                "email": "innovator@example.com",
                "phone_number": "+26771234567",
            },
            request_only=True,
        )
    ],
)
class SupportRequestCreateView(generics.CreateAPIView):
    permission_classes = [AllowAny]
    serializer_class = SupportRequestSerializer

    def perform_create(self, serializer):
        user = self.request.user if self.request.user.is_authenticated else None
        serializer.save(created_by=user)


@extend_schema(tags=["Support"], summary="List my support requests")
class MySupportRequestListView(generics.ListAPIView):
    serializer_class = SupportRequestSerializer

    def get_queryset(self):
        return SupportRequest.objects.filter(created_by=self.request.user).order_by("-created_at")


@extend_schema(tags=["Support"], summary="List or create internal tasks")
class InternalTaskListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = InternalTaskSerializer

    def get_queryset(self):
        return InternalTask.objects.select_related("assignee").order_by("due_date", "-created_at")


@extend_schema(tags=["Support"], summary="List support requests for officers/admins")
class SupportRequestAdminListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = SupportRequestSerializer

    def get_queryset(self):
        return SupportRequest.objects.select_related("created_by", "submission").order_by("-created_at")



@extend_schema(tags=["Support"], summary="Admin: list all FAQs / create FAQ")
class FAQAdminListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FAQSerializer

    def get_queryset(self):
        return FAQ.objects.all().order_by("ordering", "question")


@extend_schema(tags=["Support"], summary="Admin: get / update / delete a FAQ")
class FAQAdminDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FAQSerializer
    queryset = FAQ.objects.all()


@extend_schema(tags=["Support"], summary="Admin: bulk-reorder FAQs")
class FAQReorderView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request):
        """Body: [{"id": "<uuid>", "ordering": <int>}, ...]"""
        items = request.data
        if not isinstance(items, list):
            return Response({"detail": "Expected a list."}, status=status.HTTP_400_BAD_REQUEST)
        for item in items:
            FAQ.objects.filter(id=item["id"]).update(ordering=int(item["ordering"]))
        qs = FAQ.objects.all().order_by("ordering", "question")
        return Response(FAQSerializer(qs, many=True).data)
