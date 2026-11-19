"""Signed-in innovator endpoints: /api/me/... and /api/ideas/similar/."""
from __future__ import annotations

from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.i18n import resolve_request_language
from apps.platform_config.flags import require_feature
from apps.submissions import openapi as docs
from apps.submissions.innovator_dashboard import FILTERS, InnovatorDashboardSelector
from apps.submissions.serializers import ApplicationDraftSerializer, SimilarIdeasRequestSerializer
from apps.submissions.similar_ideas import find_similar_ideas


def _lang(request) -> str:
    lang = resolve_request_language(request)
    return "en" if lang == "all" else lang


class SimilarIdeasThrottle(UserRateThrottle):
    scope = "similar_ideas"


class MySummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Innovator"], summary="Home screen: most recent idea, next action, unread notifications (2.1)", responses=docs.SUMMARY)
    def get(self, request):
        return api_success(data=InnovatorDashboardSelector.summary(request.user, lang=_lang(request)))


class MyIdeasView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Innovator"],
        summary="My ideas: drafts and submissions in one list, with tab counts (2.2)",
        parameters=[OpenApiParameter("filter", str, enum=list(FILTERS), required=False)],
        responses=docs.IDEAS,
    )
    def get(self, request):
        return api_success(
            data=InnovatorDashboardSelector.ideas(request.user, filter_name=request.query_params.get("filter", "all"), lang=_lang(request))
        )


class MyUpdatesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Innovator"],
        summary="Updates since a time: notifications and status changes, newest first",
        parameters=[OpenApiParameter("since", str, required=False, description="ISO 8601; default the last 30 days.")],
        responses=docs.UPDATES,
    )
    def get(self, request):
        return api_success(data=InnovatorDashboardSelector.updates(request.user, since=request.query_params.get("since")))


class RecommendedChallengesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Innovator"], summary="Open challenges in my sectors", responses=docs.RECOMMENDED)
    def get(self, request):
        return api_success(data=InnovatorDashboardSelector.recommended_challenges(request.user, lang=_lang(request)))


class IdeaChallengeMatchesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Innovator"], summary="Open challenges that match one of my ideas", responses=docs.MATCHES)
    def get(self, request, idea_id):
        return api_success(data=InnovatorDashboardSelector.challenge_matches(request.user, idea_id, lang=_lang(request)))


class LinkIdeaToChallengeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Innovator"],
        summary="Start a challenge entry from an idea: copies answers by field key, returns what is left to answer",
        request=None,
        responses={201: docs.LINK},
    )
    def post(self, request, idea_id, program_id):
        result = InnovatorDashboardSelector.link_challenge(request.user, idea_id, program_id)
        return api_success(
            data={
                "draft": ApplicationDraftSerializer(result["draft"], context={"request": request}).data,
                "copied_fields": result["copied_fields"],
                "unanswered_questions": result["unanswered_questions"],
            },
            status_code=status.HTTP_201_CREATED,
        )


class SimilarIdeasView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [SimilarIdeasThrottle]

    @extend_schema(
        tags=["Innovator"],
        summary="Up to 5 published ideas or stories similar to a text (title, year and place only)",
        request=SimilarIdeasRequestSerializer,
        responses=docs.SIMILAR,
    )
    def post(self, request):
        require_feature("similar_ideas")
        serializer = SimilarIdeasRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        results = find_similar_ideas(
            text=serializer.validated_data["text"],
            sector=serializer.validated_data.get("sector"),
            lang=_lang(request),
        )
        return api_success(data={"results": results})
