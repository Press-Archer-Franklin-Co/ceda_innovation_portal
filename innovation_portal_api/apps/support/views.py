from rest_framework import generics, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
import uuid

from django.db.models import F
from drf_spectacular.utils import OpenApiExample, OpenApiParameter, extend_schema

from apps.core.permissions import IsOfficerOrAdmin
from apps.support.models import FAQ, FAQGroup, UnansweredQuestion, Guideline, InternalTask, SupportRequest
from apps.support.serializers import FAQGroupSerializer, FAQSerializer, PublicFAQSerializer, UnansweredQuestionSerializer, GuidelineSerializer, InternalTaskSerializer, SupportRequestSerializer


@extend_schema(
    tags=["Support"],
    summary="List public FAQs",
    description="?placement=help|home|program|whatsapp_bot, ?program=<id> (with placement=program), ?lang=en|tn. "
    "Ordered by group, then question order. Old fields are kept.",
    parameters=[
        OpenApiParameter("placement", str, enum=list(FAQ.PLACEMENTS)),
        OpenApiParameter("program", str),
        OpenApiParameter("lang", str, enum=["en", "tn"]),
    ],
)
class PublicFAQListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    serializer_class = PublicFAQSerializer

    def get_queryset(self):
        queryset = FAQ.objects.filter(is_public=True).select_related("group")
        placement = self.request.query_params.get("placement")
        if placement:
            queryset = queryset.filter(placements__contains=[placement])
        program = self.request.query_params.get("program")
        if program:
            try:
                queryset = queryset.filter(program_id=uuid.UUID(program))
            except ValueError:
                queryset = queryset.none()
        return queryset.order_by(F("group__ordering").asc(nulls_last=True), "ordering", "question")

    def get_serializer_context(self):
        from apps.core.i18n import normalize_language

        lang = normalize_language(self.request.query_params.get("lang")) or "en"
        return {**super().get_serializer_context(), "lang": "en" if lang == "all" else lang}


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


@extend_schema(tags=["Support"], summary="Admin: list or add FAQ groups")
class FAQGroupListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FAQGroupSerializer
    queryset = FAQGroup.objects.all().order_by("ordering", "name")


@extend_schema(tags=["Support"], summary="Admin: get / update / delete a FAQ group (its questions stay, without a group)")
class FAQGroupDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = FAQGroupSerializer
    queryset = FAQGroup.objects.all()


@extend_schema(tags=["Support"], summary="Admin: bulk-reorder FAQ groups")
class FAQGroupReorderView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    def post(self, request):
        """Body: [{"id": "<uuid>", "ordering": <int>}, ...]"""
        items = request.data
        if not isinstance(items, list):
            return Response({"detail": "Expected a list."}, status=status.HTTP_400_BAD_REQUEST)
        for item in items:
            FAQGroup.objects.filter(id=item["id"]).update(ordering=int(item["ordering"]))
        return Response(FAQGroupSerializer(FAQGroup.objects.all().order_by("ordering", "name"), many=True).data)


@extend_schema(tags=["Support"], summary="Admin: questions people searched for and found nothing, most asked first")
class UnansweredQuestionListView(generics.ListAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = UnansweredQuestionSerializer

    def get_queryset(self):
        queryset = UnansweredQuestion.objects.all()
        if self.request.query_params.get("resolved") != "true":
            queryset = queryset.filter(resolved_by_faq__isnull=True)
        return queryset.order_by("-count", "-last_asked_at")


@extend_schema(tags=["Support"], summary="Admin: mark an unanswered question as answered by a FAQ")
class UnansweredQuestionDetailView(generics.UpdateAPIView):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = UnansweredQuestionSerializer
    queryset = UnansweredQuestion.objects.all()
    http_method_names = ["patch"]

