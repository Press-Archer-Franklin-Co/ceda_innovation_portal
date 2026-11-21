"""B5 endpoints: public challenge list and detail, setup status, judging settings, criteria library."""

from decimal import Decimal

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.i18n import normalize_language
from apps.core.permissions import IPRateThrottle, IsOfficerOrAdmin
from apps.programs import challenge_public as challenges
from apps.programs.models import Program

LANG = OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])


def _lang(request):
    lang = normalize_language(request.query_params.get("lang")) or "en"
    return "en" if lang == "all" else lang


class PublicChallengeThrottle(IPRateThrottle):
    scope = "challenges_public"


class PublicChallengeListView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicChallengeThrottle]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="Challenge cards for the public list (1.7)",
        description="{counts: {open, upcoming, closed, all}, results: [card]}. counts follow ?sector but not ?status. "
        "The older GET /api/programs/public/ list is unchanged.",
        parameters=[
            OpenApiParameter("status", OpenApiTypes.STR, enum=list(challenges.STATUSES)),
            OpenApiParameter("sector", OpenApiTypes.STR, description="Sector slug or id"),
            OpenApiParameter("sort", OpenApiTypes.STR, enum=["closing_soon", "newest"]),
            LANG,
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        params = request.query_params
        return api_success(data=challenges.public_list(status=params.get("status"), sector=params.get("sector"), sort=params.get("sort"), lang=_lang(request)))


class PublicChallengeDetailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicChallengeThrottle]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="One challenge page (1.8) in one call",
        description="Card fields plus problem, who can enter, where, support package, judging criteria (names, weights, "
        "descriptions only), key dates, FAQs, partners, started_count and estimated_minutes. Never judges or scores.",
        parameters=[LANG],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, slug):
        program = get_object_or_404(challenges.public_queryset(), slug=slug)
        return api_success(data=challenges.public_detail(program, _lang(request)))


class SetupStatusView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=["Programs"], summary="Which of the 6 challenge builder steps are complete (3.6)", responses=OpenApiTypes.OBJECT)
    def get(self, request, program_id):
        return api_success(data=challenges.setup_status(get_object_or_404(Program, id=program_id)))


class CriterionInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False, allow_null=True)
    library_id = serializers.UUIDField(required=False, allow_null=True, help_text="Ticked from the library: copied into this challenge.")
    name = serializers.CharField(required=False, allow_blank=True, max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    weight = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0)
    score_meanings = serializers.ListField(child=serializers.JSONField(), required=False, max_length=5)
    comment_required_scores = serializers.ListField(child=serializers.IntegerField(min_value=1, max_value=5), required=False)


class JudgingInputSerializer(serializers.Serializer):
    criteria = CriterionInputSerializer(many=True)
    pass_mark = serializers.DecimalField(max_digits=5, decimal_places=2, min_value=0, max_value=100, required=False, allow_null=True)
    reviewers_per_idea = serializers.IntegerField(min_value=1, max_value=50, required=False, allow_null=True)
    disagreement_threshold = serializers.DecimalField(max_digits=3, decimal_places=1, min_value=Decimal("0"), max_value=Decimal("4"), required=False)


class JudgingSettingsView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(
        tags=["Programs"],
        summary="A challenge's judging settings (3.6, 3.7)",
        description="{criteria: [{id, library_id, name, description, weight, order, score_meanings, comment_required_scores}], total, pass_mark, reviewers_per_idea, disagreement_threshold}.",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, program_id):
        return api_success(data=challenges.judging_settings(get_object_or_404(Program, id=program_id)))

    @extend_schema(
        tags=["Programs"],
        summary="Save a challenge's judging settings",
        description="The whole criteria list in order. Weights must add up to 100 (the error gives the current total). "
        "pass_mark is out of 100 on the weighted score.",
        request=JudgingInputSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = JudgingInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        data["criteria"] = [dict(item, id=str(item["id"]) if item.get("id") else None, library_id=str(item["library_id"]) if item.get("library_id") else None) for item in data["criteria"]]
        return api_success(data=challenges.save_judging(program, data, actor=request.user), message="Judging settings saved.")


class LibraryItemInputSerializer(serializers.Serializer):
    name = serializers.CharField(max_length=255)
    description = serializers.CharField(required=False, allow_blank=True)
    weight = serializers.DecimalField(max_digits=6, decimal_places=2, min_value=0, required=False)
    score_meanings = serializers.ListField(child=serializers.JSONField(), required=False, max_length=5)
    comment_required_scores = serializers.ListField(child=serializers.IntegerField(min_value=1, max_value=5), required=False)


class CriteriaLibraryView(APIView):
    """Criteria saved across all challenges ("Tick to use")."""

    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=["Evaluations"], summary="List the shared criteria library", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.evaluation.models import MarkingCriteriaItem

        items = MarkingCriteriaItem.objects.filter(criteria__is_library=True, criteria__is_active=True).order_by("name")
        return api_success(data=[challenges.criterion_payload(item) for item in items])

    @extend_schema(tags=["Evaluations"], summary="Add a criterion to the shared library", request=LibraryItemInputSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request):
        from decimal import Decimal

        from apps.audit.services import AuditService
        from apps.evaluation.models import MarkingCriteria, MarkingCriteriaItem

        serializer = LibraryItemInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        library, _ = MarkingCriteria.objects.get_or_create(is_library=True, title="Criteria library", defaults={"created_by": request.user})
        item = MarkingCriteriaItem.objects.create(
            criteria=library,
            name=data["name"],
            description=data.get("description", ""),
            weight=data.get("weight", Decimal("0")),
            min_score=Decimal("1"),
            max_score=Decimal("5"),
            ordering=library.items.count() + 1,
            score_meanings=challenges._meanings(data.get("score_meanings")),
            comment_required_scores=sorted(set(data.get("comment_required_scores", []))),
        )
        AuditService.log_action(actor=request.user, action_type="criteria_library_item_added", target=item, metadata={"name": item.name})
        return api_success(data=challenges.criterion_payload(item), status_code=status.HTTP_201_CREATED)
