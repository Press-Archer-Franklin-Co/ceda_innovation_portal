"""U10 endpoints: can you enter (1.9, 1.9b), the entry's eligibility answers, results (1.10) and my result (2.11)."""

import uuid

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.views import APIView

from apps.core.api import api_success
from apps.core.permissions import HasAnyCapability, HasCapability, IPRateThrottle
from apps.programs import challenge_entry as entry
from apps.programs.challenge_public import public_queryset
from apps.programs.challenge_views import LANG, PublicChallengeThrottle, _lang
from apps.programs.models import EligibilityRule, Program


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
    field = serializers.ChoiceField(choices=EligibilityRule.FIELDS, required=False, allow_null=True, allow_blank=True, help_text="R-48 rule block. Empty: a yes/no question.")
    operator = serializers.ChoiceField(choices=EligibilityRule.OPERATORS, required=False, allow_null=True, allow_blank=True)
    value = serializers.JSONField(required=False, allow_null=True, help_text="A number, a [low, high] pair, a list of ids, a choice or true/false.")
    question = serializers.CharField(max_length=300, required=False, allow_blank=True, default="", help_text="Needed when there is no field.")
    help = serializers.CharField(required=False, allow_blank=True, default="")
    required_answer = serializers.BooleanField(required=False, default=True)
    reason = serializers.CharField(required=False, allow_blank=True, max_length=300, default="")
    active = serializers.BooleanField(required=False, default=True)
    translations = serializers.DictField(required=False, default=dict)


    def validate(self, attrs):
        if not attrs.get("field") and not (attrs.get("question") or "").strip():
            raise serializers.ValidationError({"question": "Write the question, or pick a field."})
        if attrs.get("field") and not attrs.get("operator"):
            raise serializers.ValidationError({"operator": "Pick how the field is checked."})
        return attrs


class RequiredDocumentInputSerializer(serializers.Serializer):
    id = serializers.UUIDField(required=False, allow_null=True)
    name = serializers.CharField(max_length=200)
    hint = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")
    required = serializers.BooleanField(required=False, default=True)
    accept = serializers.ListField(child=serializers.CharField(max_length=100), required=False, default=list)
    max_mb = serializers.IntegerField(min_value=1, max_value=50, required=False, default=5)
    translations = serializers.DictField(required=False, default=dict)


class EligibilityRulesSerializer(serializers.Serializer):
    rules = EligibilityRuleInputSerializer(many=True, required=False)
    documents = RequiredDocumentInputSerializer(many=True, required=False, help_text="R-48. Left out: the list stays as it is.")


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
        return api_success(data=entry.staff_eligibility(program))

    @extend_schema(
        tags=["Programs"],
        summary="Replace the challenge's Can you enter? questions and documents",
        description="{rules, documents}, each in order. An item with id updates it; items left out are removed. A key left out "
        "leaves that list as it is. A rule is a yes/no question {question, required_answer} or a block {field: age|citizenship|"
        "district|sector|business_stage|registered_company, operator: is|is_not|is_between|is_one_of|is_at_least, value}. "
        "The answer: {rules, documents: [{id, name, hint, required, accept, max_mb, translations}], sentence: {en, tn}}; each rule "
        "also has its own sentence.",
        request=EligibilityRulesSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def put(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        serializer = EligibilityRulesSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        if "rules" in data:
            entry.save_rules(program, data["rules"], actor=request.user)
        if "documents" in data:
            entry.save_documents(program, data["documents"], actor=request.user)
        return api_success(data=entry.staff_eligibility(program))


class PublishResultsSerializer(serializers.Serializer):
    show_names = serializers.BooleanField(required=False)


class PublishChallengeResultsView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Publish the challenge's results now (1.10)",
        description="Winners picked by hand are published as they are; otherwise the automatic ranking runs now. "
        "Body (optional): {show_names: bool} sets \"Show names on the results page\" (on by default; off shows idea titles only). "
        "{published, published_at, hold_reason, show_names}. 400 still_open before the challenge closes.",
        request=PublishResultsSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, program_id):
        program = get_object_or_404(Program, id=program_id)
        body = PublishResultsSerializer(data=request.data or {})
        body.is_valid(raise_exception=True)
        return api_success(data=entry.publish_results(program, actor=request.user, show_names=body.validated_data.get("show_names")))


# R-59 (3.37 winners manager) ---------------------------------------------------------------------------------------


class ResultEntryUpdateSerializer(serializers.Serializer):
    show_on_results = serializers.BooleanField(required=False)
    order = serializers.IntegerField(min_value=0, max_value=999, required=False)
    story = serializers.DictField(child=serializers.CharField(max_length=1000, allow_blank=True), required=False)


class ResultsManageView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Winners manager (3.37)",
        description="{results_published, published_at, show_names, entries: [{submission_id, title, applicant, district, place: 1st|2nd|3rd|runner_up|special|winner|shortlisted, "
        "order, show_on_results, photo_url, story {en, tn}}]}. show_names is Program.show_names_on_results (change it with PATCH /api/programs/{id}/).",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, program_id):
        from apps.programs.results_manage import manage

        return api_success(data=manage(get_object_or_404(Program, id=program_id), request))


class ResultEntryManageView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(tags=["Programs"], summary="Change how one entry shows on the results (3.37)", request=ResultEntryUpdateSerializer, responses=OpenApiTypes.OBJECT)
    def patch(self, request, program_id, submission_id):
        from apps.programs.results_manage import update_entry

        program = get_object_or_404(Program, id=program_id)
        serializer = ResultEntryUpdateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        return api_success(data=update_entry(program, submission_id, serializer.validated_data, actor=request.user))


class ResultEntryPhotoView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]
    parser_classes = [MultiPartParser]

    @extend_schema(tags=["Programs"], summary="Photo for one entry on the results (3.37)", description="multipart file: a JPG or PNG up to 5 MB.", responses=OpenApiTypes.OBJECT)
    def post(self, request, program_id, submission_id):
        from apps.programs.results_manage import set_photo

        program = get_object_or_404(Program, id=program_id)
        return api_success(data=set_photo(program, submission_id, request.FILES.get("file"), actor=request.user, request=request))


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


class EntryPitchSessionView(APIView):
    """23 Nov: one idea's own pitch session, when staff choose it over the stage's session."""

    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="One idea's pitch session",
        description="GET answers {shortlisted, own: the idea's own session or null, shown: the session the innovator sees or null}. "
        "PUT {starts_at, duration_minutes?, format: in_person|online, place {en, tn}, meeting_link, instructions {en, tn}} sets the idea's own "
        "session and tells the person; DELETE removes it (the stage's session, if any, applies again). Times are stored in UTC and shown in "
        "Gaborone time.",
        request=OpenApiTypes.OBJECT,
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, program_id, submission_id):
        from apps.programs import pitch

        submission = get_object_or_404(get_object_or_404(Program, id=program_id).submissions, id=submission_id)
        own = getattr(submission, "pitch_session", None) if hasattr(submission, "pitch_session") else None
        return api_success(data={"shortlisted": pitch.is_shortlisted(submission), "own": pitch.payload(own, staff=True), "shown": pitch.payload(pitch.session_for(submission), staff=True)})

    def put(self, request, program_id, submission_id):
        from apps.programs import pitch

        submission = get_object_or_404(get_object_or_404(Program, id=program_id).submissions, id=submission_id)
        session = pitch.save_for_idea(submission, request.data, actor=request.user)
        return api_success(data=pitch.payload(session, staff=True), message="Pitch session saved.")

    def delete(self, request, program_id, submission_id):
        from apps.programs import pitch

        submission = get_object_or_404(get_object_or_404(Program, id=program_id).submissions, id=submission_id)
        pitch.save_for_idea(submission, None, actor=request.user)
        return api_success(data=None, message="Pitch session removed.")


class PitchScheduleView(APIView):
    """R-84: the staff Pitch schedule, one row per shortlisted entry."""

    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Pitch schedule: every shortlisted entry and its session",
        description="{count, not_set_count (all shortlisted entries the search and filter leave aside too), page, page_size, stage_session (staff payload) | null, "
        "results: [{submission_id, reference, title, innovator: {name, first_name}, own (the idea's own session) | null, shown (the session the person sees) | null}]}. "
        "Never an email or phone number. shown is null when no time is set.",
        parameters=[
            OpenApiParameter("search", OpenApiTypes.STR, description="Name, title or reference."),
            OpenApiParameter("not_set", OpenApiTypes.BOOL, description="Only entries with no session."),
            OpenApiParameter("ordering", OpenApiTypes.STR, enum=["name", "-name", "starts_at", "-starts_at"]),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT, description="Up to 100."),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, program_id):
        from apps.programs import pitch

        return api_success(data=pitch.schedule(get_object_or_404(Program, id=program_id), request.query_params))


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


# R-53 (3.6 Challenge status) ---------------------------------------------------------------------------------------


class ChallengeUpdateSerializer(serializers.Serializer):
    body = serializers.CharField(max_length=2000)
    body_tn = serializers.CharField(max_length=2000, required=False, allow_blank=True, default="")
    channels = serializers.ListField(child=serializers.CharField(max_length=20), required=False, allow_null=True, default=None, help_text="Left out: as each person prefers. The bell always gets it.")


class ChallengeStatusNumbersView(APIView):
    permission_classes = [HasAnyCapability.of("challenges.manage", "dashboard.view")]

    @extend_schema(
        tags=["Programs"],
        summary="Challenge status numbers (3.6)",
        description="{started (drafts and sent, like the public started_count), submitted, reviewed (past the first step, finished, or with a finished review task), "
        "to_panel (at a judging step or shortlisted), closes_at, days_left}",
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, program_id):
        from apps.programs.challenge_status import status_numbers

        return api_success(data=status_numbers(get_object_or_404(Program, id=program_id)))


class ChallengeUpdatesView(APIView):
    permission_classes = [HasCapability.of("challenges.manage")]

    @extend_schema(
        tags=["Programs"],
        summary="Post an update to everyone who started an entry (3.6)",
        description="{body, body_tn?, channels?: [web, email, sms, whatsapp]}. Setswana readers get body_tn when it is there. Answers {recipients, sent: {web, email, sms, whatsapp}}.",
        request=ChallengeUpdateSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, program_id):
        from apps.programs.challenge_status import post_update

        program = get_object_or_404(Program, id=program_id)
        serializer = ChallengeUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        return api_success(data=post_update(program, body=data["body"], body_tn=data.get("body_tn", ""), channels=data.get("channels"), actor=request.user), message="Update sent.")
