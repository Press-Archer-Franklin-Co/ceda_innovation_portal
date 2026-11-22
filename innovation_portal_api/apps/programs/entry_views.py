"""U10 endpoints: can you enter (1.9, 1.9b), the entry's eligibility answers, results (1.10) and my result (2.11)."""

import uuid

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.permissions import HasCapability, IPRateThrottle
from apps.programs import challenge_entry as entry
from apps.programs.challenge_public import public_queryset
from apps.programs.challenge_views import LANG, PublicChallengeThrottle, _lang
from apps.programs.models import Program


def _challenge(slug: str):
    """A public challenge by slug, or by id (old links such as /innovate?program=<id> carry the id)."""
    queryset = public_queryset()
    try:
        return get_object_or_404(queryset, id=uuid.UUID(slug))
    except ValueError:
        return get_object_or_404(queryset, slug=slug)


class EligibilityThrottle(IPRateThrottle):
    scope = "challenges_public"


class EligibilityAnswersSerializer(serializers.Serializer):
    answers = serializers.DictField(child=serializers.BooleanField(), required=False, default=dict, help_text="{rule id: true (yes) or false (no)}")


class EligibilityRuleInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False, allow_null=True)
    question = serializers.CharField(max_length=300)
    help = serializers.CharField(required=False, allow_blank=True, default="")
    required_answer = serializers.BooleanField(required=False, default=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=300, default="")
    active = serializers.BooleanField(required=False, default=True)
    translations = serializers.DictField(required=False, default=dict)


class EligibilityRulesSerializer(serializers.Serializer):
    rules = EligibilityRuleInputSerializer(many=True)


class ChallengeEntryStateView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicChallengeThrottle]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="What Enter leads to for this person (1.9, 1.9b)",
        description="state: sign_in | questions | form | not_open | closed | entered | limit | audience. With questions: "
        "[{id, question, help}]. With form: draft_id of this challenge's own draft. entry: the person's latest sent entry "
        "(link for 'already entered'). Works signed out (state sign_in).",
        parameters=[LANG],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, slug):
        program = _challenge(slug)
        return api_success(data=entry.entry_state(program, request.user, _lang(request)))


class ChallengeEligibilityView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [EligibilityThrottle]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="Answer the Can you enter? questions (1.9)",
        description="Eligible: opens or reuses this challenge's draft and returns draft_id (2.10). Not eligible: "
        "{eligible: false, reasons: [{id, question, reason}], general_idea_url}; nothing is stored. "
        "400 answer_all when a question is unanswered; 400 when the challenge is closed or the entry limit is reached; "
        "403 when the challenge is for another audience.",
        parameters=[LANG],
        request=EligibilityAnswersSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, slug):
        program = _challenge(slug)
        serializer = EligibilityAnswersSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data=entry.check_eligibility(program, request.user, serializer.validated_data["answers"], _lang(request)))


class ChallengeResultsView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicChallengeThrottle]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="Challenge results: winners and shortlist (1.10)",
        description="published false until the challenge has closed and published its results; then winners "
        "[{position, name, title, description, prize_label, prize_amount, members_count, photo_url}] and shortlisted "
        "[{title}] (titles only). Never scores, judges or notes.",
        parameters=[LANG],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, slug):
        program = _challenge(slug)
        return api_success(data=entry.public_results(program, _lang(request)))


class MyChallengeResultView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        tags=["Challenges (public)"],
        summary="My result in one challenge (2.11)",
        description="outcome: no_entry | waiting | winner | shortlisted | not_selected. scores {total, criteria: "
        "[{name, score}]} (out of 100) only when the challenge shares scores and results are out.",
        parameters=[LANG],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, slug):
        program = _challenge(slug)
        return api_success(data=entry.my_result(program, request.user, _lang(request)))


class ChallengeEligibilityRulesView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(tags=["Programs"], summary="The challenge's Can you enter? questions (challenge builder)", responses=OpenApiTypes.OBJECT)
    def get(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        return api_success(data={"rules": entry.staff_rules(program)})

    @extend_schema(
        tags=["Programs"],
        summary="Replace the challenge's Can you enter? questions",
        description="rules in the order asked. An item with id updates that question; questions left out are removed.",
        request=EligibilityRulesSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = EligibilityRulesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data={"rules": entry.save_rules(program, serializer.validated_data["rules"], actor=request.user)})


class PublishChallengeResultsView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Publish the challenge's results now (1.10)",
        description="Winners picked by hand are published as they are; otherwise the automatic ranking runs now. "
        "{published, published_at, hold_reason}. 400 still_open before the challenge closes.",
        request=None,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        return api_success(data=entry.publish_results(program, actor=request.user))


# R-54 (2.11 and 3.37) ----------------------------------------------------------------------------------------------


class AttendSerializer(serializers.Serializer):
    attending = serializers.BooleanField(default=True)


class MyChallengeAttendView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=["Challenges (public)"], summary="Confirm I will attend (2.11)", description="{attending: true|false}. Shortlisted and winning entries, before the event. Answers the attendance block.", request=AttendSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, slug):
        program = _challenge(slug)
        serializer = AttendSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data=entry.answer_attendance(program, request.user, serializer.validated_data["attending"]))


class PanelFeedbackSerializer(serializers.Serializer):
    liked = serializers.ListField(child=serializers.CharField(max_length=300, allow_blank=True), max_length=6, default=list)
    work_on = serializers.ListField(child=serializers.CharField(max_length=300, allow_blank=True), max_length=6, default=list)


class EntryPanelFeedbackView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Panel feedback for one entry (3.37)",
        description="GET or PUT {liked: [str], work_on: [str]} (up to 6 points each). The entrant sees them on My result once results are out and the entry is shortlisted or won. GET also shows the attendance answer.",
        request=PanelFeedbackSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, program_id, submission_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = PanelFeedbackSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return api_success(data=entry.save_panel_feedback(program, submission_id, liked=serializer.validated_data["liked"], work_on=serializer.validated_data["work_on"], actor=request.user))

    def get(self, request, program_id, submission_id):
        from apps.submissions.models import EntryPanelFeedback

        program = get_object_or_404(Program, id=program_id)
        submission = get_object_or_404(program.submissions, id=submission_id)
        row = EntryPanelFeedback.objects.filter(submission=submission).first()
        return api_success(
            data={
                "submission_id": str(submission.id),
                "liked": row.liked if row else [],
                "work_on": row.work_on if row else [],
                "attending": row.attending if row else None,
                "attendance_answered_at": row.attendance_answered_at.isoformat() if row and row.attendance_answered_at else None,
            }
        )
