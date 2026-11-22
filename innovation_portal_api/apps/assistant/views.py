"""AI helper endpoints (C3).

When the helper cannot answer (switch off, no connection, feature off, limit reached, time limit,
Claude failed), feature endpoints answer 200 with ``{"available": false}`` and nothing else, so
the screens hide the helper quietly. The reason is recorded for admins (usage report, log), never
shown to the public.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.assistant import selectors, services
from apps.assistant.client import AssistantClient, AssistantUnavailable
from apps.assistant.models import Introduction, KnowledgeEntry, ManualPage, ManualScreenshot
from apps.assistant.serializers import (
    AnswerIntroductionSerializer,
    DraftCheckSerializer,
    HelpQuestionSerializer,
    IntroductionStaffSerializer,
    KnowledgeEntrySerializer,
    LangQuerySerializer,
    ManualPageSerializer,
    ReorderSerializer,
    ScreenshotSerializer,
    ScreenshotUpdateSerializer,
    ScreenshotUploadSerializer,
    SettingsSerializer,
    SuggestIntroductionSerializer,
    TryItSerializer,
    UsageQuerySerializer,
)
from apps.core.api import api_success
from apps.core.permissions import HasCapability, IPRateThrottle

TAGS = ["AI helper"]
ADMIN_TAGS = ["AI helper admin"]
UNAVAILABLE = {"available": False}
LANG_PARAMETERS = [
    OpenApiParameter("lang", str, enum=["en", "tn"], required=False),
    OpenApiParameter("refresh", bool, required=False, description="Ask again even if a saved answer is still valid."),
]


class AssistantUserThrottle(UserRateThrottle):
    scope = "assistant"


class AssistantGuestThrottle(IPRateThrottle):
    scope = "assistant_guest"


class AssistantThrottleMixin:
    """Signed-in people are throttled per user, guests per address."""

    def get_throttles(self):
        if self.request.user and self.request.user.is_authenticated:
            return [AssistantUserThrottle()]
        return [AssistantGuestThrottle()]


def _available(data: dict) -> dict:
    return {"available": True, **data}


# -- public and innovator -----------------------------------------------------------------------


class StatusView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=TAGS, summary="Which AI helper parts are on now", description="Never fails. Screens show a helper part only when its feature is true.")
    def get(self, request):
        return api_success(data=AssistantClient.status())


class DraftCheckView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=OpenApiTypes.OBJECT, tags=TAGS,
        summary="Check my idea: feedback on one step of my draft",
        description="Owner of the draft, or a guest with the draft's resume token (X-Draft-Token). Returns clear, unclear (with the quoted sentence), "
        "missing and up to 3 officer questions. Suggestions only; it never rewrites the idea. {available: false} when the helper is off.",
        request=DraftCheckSerializer,
    )
    def post(self, request):
        from apps.submissions.intake import DraftTokenService
        from apps.submissions.models import ApplicationDraft

        serializer = DraftCheckSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        draft = None
        if request.user.is_authenticated:
            draft = ApplicationDraft.objects.filter(pk=values["draft_id"], innovator=request.user).select_related("program__form").first()
        if draft is None:
            token = DraftTokenService.token_from_request(request)
            if token:
                try:
                    draft = DraftTokenService.guest_draft(token, values["draft_id"])
                except (DjangoValidationError, ValueError):
                    draft = None
        if draft is None or draft.status != ApplicationDraft.STATUS_DRAFT:
            raise Http404
        try:
            data = services.check_draft(
                draft=draft, step_code=values["step"], answers=values["answers"], language=values["lang"], user=request.user
            )
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class HelpView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        responses=OpenApiTypes.OBJECT, tags=TAGS,
        summary="Ask how do I... about the portal",
        description="Answers from the user manual with screenshots and page links. Signed-in people, and guests when the admin allows. "
        "When unsure, or with handoff=true, the question goes to the staff inbox (handed_over: true).",
        request=HelpQuestionSerializer,
    )
    def post(self, request):
        serializer = HelpQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        user = request.user if request.user.is_authenticated else None
        contact = {"name": values["contact_name"], "phone": values["contact_phone"], "email": values["contact_email"]}
        if values["handoff"]:
            if user is None and not (values["contact_phone"] or values["contact_email"]):
                return api_success(data={"available": True, "handed_over": False, "needs_contact": True})
            return api_success(data=_available(services.hand_over(user=user, question=values["question"], language=values["lang"], contact=contact)))
        runtime = AssistantClient.runtime()
        if user is None and not (runtime and runtime.allow_guests_help):
            return api_success(data=UNAVAILABLE)
        try:
            data = services.ask_help(user=user, question=values["question"], language=values["lang"], page_path=values["page_path"], contact=contact)
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        for shot in data["screenshots"]:
            if shot["url"] and not shot["url"].startswith("http"):
                shot["url"] = request.build_absolute_uri(shot["url"])
        return api_success(data=_available(data))


class MyIntroductionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=TAGS, summary="Introductions suggested to me", description="The other person's name and contact show only after both said yes.")
    def get(self, request):
        from django.db.models import Q

        intros = Introduction.objects.filter(
            Q(first_submission__innovator=request.user) | Q(second_submission__innovator=request.user)
        ).select_related("first_submission__innovator", "second_submission__innovator")
        return api_success(data=[services.introduction_for_innovator(intro, request.user) for intro in intros])


class AnswerIntroductionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=TAGS, summary="Say yes or no to an introduction", request=AnswerIntroductionSerializer)
    def post(self, request, pk):
        from django.db.models import Q

        intro = get_object_or_404(
            Introduction.objects.filter(Q(first_submission__innovator=request.user) | Q(second_submission__innovator=request.user)), pk=pk
        )
        serializer = AnswerIntroductionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intro = services.IntroductionService.answer(intro=intro, user=request.user, agree=serializer.validated_data["agree"])
        return api_success(data=services.introduction_for_innovator(intro, request.user), message="Answer saved.")


# -- officers ------------------------------------------------------------------------------------


class SubmissionAccessMixin:
    """Officers with assistant.hints, and only for submissions they can already open."""

    permission_classes = [HasCapability.of("assistant.hints")]
    throttle_classes = [AssistantUserThrottle]

    def submission(self, pk):
        from apps.submissions.selectors import SubmissionSelector

        try:
            return get_object_or_404(SubmissionSelector.for_user(self.request.user).select_related("sector", "district"), pk=pk)
        except (DjangoValidationError, ValueError):
            raise Http404 from None


class HintsView(SubmissionAccessMixin, APIView):
    @extend_schema(
        responses=OpenApiTypes.OBJECT, tags=TAGS,
        summary="AI helper hints for a submission",
        description="Summary (5 lines), strengths, points to check and a suggested next step, each labelled as a suggestion. Kept until the submission changes.",
        parameters=LANG_PARAMETERS,
    )
    def get(self, request, pk):
        submission = self.submission(pk)
        query = LangQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = services.submission_hints(submission=submission, user=request.user, language=query.validated_data["lang"], refresh=query.validated_data["refresh"])
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class RelatedView(SubmissionAccessMixin, APIView):
    @extend_schema(
        responses=OpenApiTypes.OBJECT, tags=TAGS,
        summary="Similar and complementary ideas",
        description="A database shortlist of ideas this officer can open (title similarity, sector, district, keywords), sorted by Claude into "
        "similar (could merge) and complementary (could work together), with one sentence why.",
        parameters=LANG_PARAMETERS,
    )
    def get(self, request, pk):
        submission = self.submission(pk)
        query = LangQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = services.related_ideas(submission=submission, user=request.user, language=query.validated_data["lang"], refresh=query.validated_data["refresh"])
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class SuggestIntroductionView(SubmissionAccessMixin, APIView):
    @extend_schema(
        tags=TAGS,
        summary="Suggest working together",
        description="Asks both innovators by message whether they agree to be introduced. Nobody's details are shared until both say yes.",
        request=SuggestIntroductionSerializer,
        responses={201: IntroductionStaffSerializer},
    )
    def post(self, request, pk):
        submission = self.submission(pk)
        serializer = SuggestIntroductionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        other = self.submission(serializer.validated_data["other_submission"])
        intro = services.IntroductionService.suggest(
            actor=request.user, submission=submission, other=other, kind=serializer.validated_data["kind"], reason=serializer.validated_data["reason"]
        )
        return api_success(data=IntroductionStaffSerializer(intro).data, message="Both innovators were asked.", status_code=status.HTTP_201_CREATED)


# -- admin ---------------------------------------------------------------------------------------


class AdminMixin:
    permission_classes = [HasCapability.of("assistant.manage")]


class OverviewView(AdminMixin, APIView):
    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="AI helper status, switches and privacy note", parameters=[OpenApiParameter("lang", str, enum=["en", "tn"], required=False)])
    def get(self, request):
        return api_success(data=selectors.overview(request.query_params.get("lang", "en")))


class SettingsView(AdminMixin, APIView):
    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="Change AI helper switches and the monthly limit", request=SettingsSerializer)
    def patch(self, request):
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.AssistantSettingsService.update(actor=request.user, data=dict(serializer.validated_data))
        return api_success(data=selectors.overview(request.query_params.get("lang", "en")), message="Saved.")


class UsageView(AdminMixin, APIView):
    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="Calls and cost per day and per feature, limit left this month", parameters=[OpenApiParameter("days", int, required=False)])
    def get(self, request):
        query = UsageQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        return api_success(data=selectors.usage_report(days=query.validated_data["days"]))


class TryItView(AdminMixin, APIView):
    throttle_classes = [AssistantUserThrottle]

    @extend_schema(
        responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS,
        summary="Try a feature on sample text",
        description="Runs innovator guidance, officer hints or help on the text, with optional unsaved guidance, so admins see the effect before saving. "
        "Works while a feature is switched off for everyone else.",
        request=TryItSerializer,
    )
    def post(self, request):
        serializer = TryItSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            data = services.try_it(user=request.user, feature=values["feature"], text=values["text"], language=values["lang"], guidance=values["guidance"])
        except AssistantUnavailable as exc:
            # Admins may see why: it is their own settings.
            return api_success(data={"available": False, "reason": exc.reason})
        return api_success(data=_available(data))


class _CrudList(AdminMixin, APIView):
    model = None
    serializer_class = None
    service = None

    def get(self, request):
        return api_success(data=self.serializer_class(self.model.objects.all(), many=True, context={"request": request}).data)

    def post(self, request):
        serializer = self.serializer_class(data=request.data, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = self.service.save(actor=request.user, instance=None, data=serializer.validated_data)
        return api_success(data=self.serializer_class(instance, context={"request": request}).data, message="Saved.", status_code=status.HTTP_201_CREATED)


class _CrudDetail(AdminMixin, APIView):
    model = None
    serializer_class = None
    service = None

    def get(self, request, pk):
        return api_success(data=self.serializer_class(get_object_or_404(self.model, pk=pk), context={"request": request}).data)

    def patch(self, request, pk):
        instance = get_object_or_404(self.model, pk=pk)
        serializer = self.serializer_class(instance, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        instance = self.service.save(actor=request.user, instance=instance, data=serializer.validated_data)
        return api_success(data=self.serializer_class(instance, context={"request": request}).data, message="Saved.")

    def delete(self, request, pk):
        self.service.delete(actor=request.user, instance=get_object_or_404(self.model, pk=pk))
        return api_success(message="Deleted.")


class _Reorder(AdminMixin, APIView):
    model = None

    def post(self, request):
        serializer = ReorderSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.KnowledgeService.reorder(actor=request.user, model=self.model, ids=serializer.validated_data["ids"])
        return api_success(message="Order saved.")


def _crud_schema(view_class, name: str, serializer):
    """Give each concrete view its own documented methods (the base methods are shared, so wrap them)."""

    def documented(function, summary, with_body, operation_id=None):
        def method(self, *args, **kwargs):
            return function(self, *args, **kwargs)

        method.__name__ = function.__name__
        return extend_schema(
            tags=ADMIN_TAGS, summary=summary, request=serializer if with_body else None, responses=serializer, operation_id=operation_id
        )(method)

    is_list = view_class.__name__.endswith("ListView")

    for verb, summary in (("get", name), ("post", f"Add to {name.lower()}"), ("patch", f"Edit {name.lower()}"), ("delete", f"Delete {name.lower()}")):
        function = getattr(view_class, verb, None)
        if function is not None:
            operation_id = f"assistant_admin_{view_class.__name__.removesuffix('ListView').lower()}_list" if is_list and verb == "get" else None
            setattr(view_class, verb, documented(function, summary, verb in ("post", "patch"), operation_id))
    return view_class


class KnowledgeListView(_CrudList):
    model, serializer_class, service = KnowledgeEntry, KnowledgeEntrySerializer, services.KnowledgeService


class KnowledgeDetailView(_CrudDetail):
    model, serializer_class, service = KnowledgeEntry, KnowledgeEntrySerializer, services.KnowledgeService


class KnowledgeReorderView(_Reorder):
    model = KnowledgeEntry

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="Save the order of guidance entries", request=ReorderSerializer)
    def post(self, request):
        return super().post(request)


class ManualPageListView(_CrudList):
    model, serializer_class, service = ManualPage, ManualPageSerializer, services.ManualService

    def get(self, request):
        pages = ManualPage.objects.prefetch_related("screenshots__asset")
        return api_success(data=ManualPageSerializer(pages, many=True, context={"request": request}).data)


class ManualPageDetailView(_CrudDetail):
    model, serializer_class, service = ManualPage, ManualPageSerializer, services.ManualService


class ManualPageReorderView(_Reorder):
    model = ManualPage

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="Save the order of manual pages", request=ReorderSerializer)
    def post(self, request):
        return super().post(request)


class ScreenshotUploadView(AdminMixin, APIView):
    parser_classes = [MultiPartParser, FormParser]

    @extend_schema(tags=ADMIN_TAGS, summary="Add a screenshot to a manual page", description="Stored in the media library.", request=ScreenshotUploadSerializer, responses={201: ScreenshotSerializer})
    def post(self, request, pk):
        page = get_object_or_404(ManualPage, pk=pk)
        serializer = ScreenshotUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        from apps.media_library.validation import MediaValidationError

        try:
            shot = services.ManualService.add_screenshot(
                actor=request.user, page=page, upload=values["file"], caption={"en": values["caption_en"], "tn": values["caption_tn"]}, ordering=values.get("ordering")
            )
        except MediaValidationError as exc:
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"file": [str(exc)]}) from None
        return api_success(data=ScreenshotSerializer(shot, context={"request": request}).data, message="Screenshot added.", status_code=status.HTTP_201_CREATED)


class ScreenshotDetailView(AdminMixin, APIView):
    parser_classes = [JSONParser]

    @extend_schema(tags=ADMIN_TAGS, summary="Change a screenshot's caption or order", request=ScreenshotUpdateSerializer, responses=ScreenshotSerializer)
    def patch(self, request, pk):
        shot = get_object_or_404(ManualScreenshot.objects.select_related("asset"), pk=pk)
        serializer = ScreenshotUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        shot = services.ManualService.update_screenshot(actor=request.user, shot=shot, caption=serializer.validated_data.get("caption"), ordering=serializer.validated_data.get("ordering"))
        return api_success(data=ScreenshotSerializer(shot, context={"request": request}).data, message="Saved.")

    @extend_schema(responses=OpenApiTypes.OBJECT, tags=ADMIN_TAGS, summary="Remove a screenshot")
    def delete(self, request, pk):
        services.ManualService.delete_screenshot(actor=request.user, shot=get_object_or_404(ManualScreenshot, pk=pk))
        return api_success(message="Deleted.")


for _view, _name, _serializer in (
    (KnowledgeListView, "Guidance entries", KnowledgeEntrySerializer),
    (KnowledgeDetailView, "Guidance entry", KnowledgeEntrySerializer),
    (ManualPageListView, "Manual pages", ManualPageSerializer),
    (ManualPageDetailView, "Manual page", ManualPageSerializer),
):
    _crud_schema(_view, _name, _serializer)

