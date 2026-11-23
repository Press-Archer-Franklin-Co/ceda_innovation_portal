"""AI Copilot endpoints.

When the helper cannot answer (switch off, no working service, feature off, limit reached, time
limit, the service failed), feature endpoints answer 200 with ``{"available": false}`` and nothing
else, so the screens hide the helper quietly. The reason is recorded for admins (usage, log),
never shown to the public. Every endpoint decides access on the server; nothing the browser sends
about roles or pages is trusted.
"""

from __future__ import annotations

from django.core.exceptions import ValidationError as DjangoValidationError
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import UserRateThrottle
from rest_framework.views import APIView

from apps.assistant import document_review, features, selectors, services
from apps.assistant.knowledge_services import KnowledgeDocumentService
from apps.assistant.models import AssistantSettings, Introduction, KnowledgeDocument, KnowledgeEntry, ManualPage, ManualScreenshot
from apps.assistant.providers import AssistantUnavailable
from apps.assistant.serializers import (
    AnswerIntroductionSerializer,
    BuilderDraftCreateSerializer,
    BuilderReviseSerializer,
    BuilderTestSerializer,
    GuideRequestSerializer,
    DocumentReviewSerializer,
    DraftCheckSerializer,
    HelpQuestionSerializer,
    IntroductionStaffSerializer,
    KnowledgeDocumentSerializer,
    KnowledgeDocumentUploadSerializer,
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
)
from apps.core.api import api_success
from apps.core.permissions import HasCapability, IPRateThrottle

TAGS = ["AI helper"]
ADMIN_TAGS = ["AI helper admin"]
UNAVAILABLE = {"available": False}
LANG_PARAMETERS = [
    OpenApiParameter("lang", str, enum=["en", "tn"], required=False, description="Answer language (Show in Setswana). Defaults to the person's language."),
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


def _lang(request) -> str | None:
    value = request.query_params.get("lang") or (request.data.get("lang") if hasattr(request, "data") and isinstance(request.data, dict) else None)
    return value if value in ("en", "tn") else None


# -- everyone ----------------------------------------------------------------------------------------


class StatusView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Which AI helper parts are on for me now",
        description="For the signed-in person (or a guest): each feature on or off, the answer language, and for staff with "
        "assistant.manage the set-up state with a link to Integrations. Never fails.",
        parameters=[OpenApiParameter("lang", str, enum=["en", "tn"], required=False)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=selectors.status_for(request.user, _lang(request)))


class DraftCheckView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Check my idea: coaching on one step of my draft and its files",
        description="Owner of the draft, or a guest with the draft's resume token (X-Draft-Token). Returns one card per topic (clear, add more, missing) "
        "with the field or the file and page, unclear sentences, up to 3 officer questions and what each uploaded file covers. "
        "Suggestions only; it never rewrites the idea. {available: false} when the helper is off.",
        request=DraftCheckSerializer,
        responses=OpenApiTypes.OBJECT,
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
            data = features.check_draft(draft=draft, step_code=values["step"], answers=values["answers"], requested_language=values.get("lang"), user=request.user)
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class DocumentReviewView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Review one uploaded file",
        description="Summary, key points with page, what is missing and the file's language. For the owner of the draft or idea "
        "(or a guest with the draft's resume token), and for officers and judges who can already open that idea. Cached per file version and language.",
        request=DocumentReviewSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request, pk):
        from apps.submissions.intake import DraftTokenService

        serializer = DocumentReviewSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        document, role = document_review.document_for(request.user, pk, draft_token=DraftTokenService.token_from_request(request))
        try:
            data = document_review.review(user=request.user, document=document, role=role, requested_language=serializer.validated_data.get("lang"))
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class HelpView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Ask how do I... about the portal",
        description="Answers from the user manual and knowledge base with screenshots and page links, in the person's language. "
        "Signed-in people, and guests when the admin allows. When unsure, or with handoff=true, the question goes to the staff inbox.",
        request=HelpQuestionSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        serializer = HelpQuestionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        user = request.user if request.user.is_authenticated else None
        contact = {"name": values["contact_name"], "phone": values["contact_phone"], "email": values["contact_email"]}
        language = values.get("lang") or "en"
        if values["handoff"]:
            if user is None and not (values["contact_phone"] or values["contact_email"]):
                return api_success(data={"available": True, "handed_over": False, "needs_contact": True})
            return api_success(data=_available(features.hand_over(user=user, question=values["question"], language=language, contact=contact)))
        if user is None and not AssistantSettings.load().guests_can_use_guide:
            return api_success(data=UNAVAILABLE)
        try:
            data = features.ask_help(user=user, question=values["question"], requested_language=values.get("lang"), page_path=values["page_path"], contact=contact)
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        for shot in data["screenshots"]:
            if shot["url"] and not shot["url"].startswith("http"):
                shot["url"] = request.build_absolute_uri(shot["url"])
        return api_success(data=_available(data))


class MyIntroductionsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=TAGS, summary="Introductions suggested to me", description="The other person's name and contact show only after both said yes.", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from django.db.models import Q

        intros = Introduction.objects.filter(
            Q(first_submission__innovator=request.user) | Q(second_submission__innovator=request.user)
        ).select_related("first_submission__innovator", "second_submission__innovator")
        return api_success(data=[services.introduction_for_innovator(intro, request.user) for intro in intros])


class AnswerIntroductionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(tags=TAGS, summary="Say yes or no to an introduction", request=AnswerIntroductionSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        from django.db.models import Q

        intro = get_object_or_404(
            Introduction.objects.filter(Q(first_submission__innovator=request.user) | Q(second_submission__innovator=request.user)), pk=pk
        )
        serializer = AnswerIntroductionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        intro = services.IntroductionService.answer(intro=intro, user=request.user, agree=serializer.validated_data["agree"])
        return api_success(data=services.introduction_for_innovator(intro, request.user), message="Answer saved.")


# -- officers and judges -----------------------------------------------------------------------------


class SubmissionAccessMixin:
    """People with assistant.hints, and only for submissions they can already open
    (judges: only the entries assigned to them)."""

    permission_classes = [HasCapability.of("assistant.hints")]
    throttle_classes = [AssistantUserThrottle]

    def submission(self, pk):
        from apps.submissions.selectors import SubmissionSelector

        try:
            return get_object_or_404(
                SubmissionSelector.for_user(self.request.user).select_related("sector", "district", "program__marking_criteria", "innovator"), pk=pk
            )
        except (DjangoValidationError, ValueError):
            raise Http404 from None


class OfficerOnlyMixin(SubmissionAccessMixin):
    """Similar ideas and introductions: officers who may search every idea (never judges or innovators)."""

    permission_classes = [HasCapability.of("assistant.hints"), HasCapability.of("entries.search")]


class HintsView(SubmissionAccessMixin, APIView):
    @extend_schema(
        tags=TAGS,
        summary="AI helper summary for a submission (3.3b)",
        description="Summary in the reader's language (?lang=en|tn), facts from the files with file and page, what is not in the files, "
        "points to check against the marking criteria, other points and a suggested next step. Every item is a suggestion; "
        "an answer containing a score or a decision is never shown. Kept until the submission or its files change.",
        parameters=LANG_PARAMETERS,
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, pk):
        submission = self.submission(pk)
        query = LangQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = features.submission_hints(submission=submission, user=request.user, requested_language=query.validated_data.get("lang"), refresh=query.validated_data["refresh"])
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class RelatedView(OfficerOnlyMixin, APIView):
    @extend_schema(
        tags=TAGS,
        summary="Similar and complementary ideas, across languages (officers only)",
        description="A database shortlist of ideas this officer can open (idea profiles in English, keywords in English and Setswana, "
        "sector, district, and one idea's outputs matching another's inputs), sorted by the AI into similar (could merge) and "
        "complementary (could work together), with one sentence why. Innovators and judges never get this endpoint.",
        parameters=LANG_PARAMETERS,
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, pk):
        submission = self.submission(pk)
        query = LangQuerySerializer(data=request.query_params)
        query.is_valid(raise_exception=True)
        try:
            data = features.related_ideas(submission=submission, user=request.user, requested_language=query.validated_data.get("lang"), refresh=query.validated_data["refresh"])
        except AssistantUnavailable:
            return api_success(data=UNAVAILABLE)
        return api_success(data=_available(data))


class SuggestIntroductionView(OfficerOnlyMixin, APIView):
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


# -- admin (3.34, 3.34b) -----------------------------------------------------------------------------


class AdminMixin:
    permission_classes = [HasCapability.of("assistant.manage")]


class OverviewView(AdminMixin, APIView):
    @extend_schema(
        tags=ADMIN_TAGS,
        summary="AI services, keys in use, the service for each feature, switches and the privacy note (3.34b)",
        parameters=[OpenApiParameter("lang", str, enum=["en", "tn"], required=False)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=selectors.overview(request.query_params.get("lang", "en")))


class SettingsView(AdminMixin, APIView):
    @extend_schema(
        tags=ADMIN_TAGS,
        summary="Change keys in use, the service for each feature, feature switches, the limit or privacy switches",
        description="Keys themselves are only added and tested in Platform settings > Integrations.",
        request=SettingsSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def patch(self, request):
        serializer = SettingsSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        services.AssistantSettingsService.update(actor=request.user, data=dict(serializer.validated_data))
        return api_success(data=selectors.overview(request.query_params.get("lang", "en")), message="Saved.")


class UsageView(AdminMixin, APIView):
    @extend_schema(
        tags=ADMIN_TAGS,
        summary="This month: calls, tokens in and out, cost and failures per feature and per service",
        description="?download=csv downloads the same table.",
        parameters=[OpenApiParameter("download", str, enum=["csv"], required=False)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        if request.query_params.get("download") == "csv":
            response = HttpResponse(selectors.usage_csv(), content_type="text/csv; charset=utf-8")
            response["Content-Disposition"] = 'attachment; filename="ai-usage.csv"'
            return response
        return api_success(data=selectors.usage_report())


class TryItView(AdminMixin, APIView):
    throttle_classes = [AssistantUserThrottle]

    @extend_schema(
        tags=ADMIN_TAGS,
        summary="Try a feature on sample text",
        description="Runs the idea coach, the officer summary or help on the text, with optional unsaved guidance, and lists the sources used. "
        "Works while a feature is switched off for everyone else.",
        request=TryItSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        serializer = TryItSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            data = features.try_it(user=request.user, feature=values["feature"], text=values["text"], language=values["lang"], guidance=values["guidance"])
        except AssistantUnavailable as exc:
            # Admins may see why: it is their own settings.
            return api_success(data={"available": False, "reason": exc.reason, "detail": exc.detail})
        return api_success(data=_available(data))


class KnowledgeDocumentListView(AdminMixin, APIView):
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    @extend_schema(tags=ADMIN_TAGS, summary="Knowledge base documents", responses=KnowledgeDocumentSerializer(many=True))
    def get(self, request):
        return api_success(data=KnowledgeDocumentSerializer(KnowledgeDocument.objects.select_related("asset"), many=True, context={"request": request}).data)

    @extend_schema(
        tags=ADMIN_TAGS,
        summary="Upload a document to the knowledge base",
        description="PDF, Word or text, with the media library's type and size rules. It is read in the background: status reading, then ready or failed.",
        request=KnowledgeDocumentUploadSerializer,
        responses={201: KnowledgeDocumentSerializer},
    )
    def post(self, request):
        from rest_framework.exceptions import ValidationError

        from apps.media_library.validation import MediaValidationError

        serializer = KnowledgeDocumentUploadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        try:
            document = KnowledgeDocumentService.upload(
                actor=request.user, upload=values["file"], title=values.get("title", ""), kind=values["kind"], audience=values["audience"], language=values["language"]
            )
        except MediaValidationError as exc:
            raise ValidationError({"file": [str(exc)]}) from None
        document.refresh_from_db()
        return api_success(data=KnowledgeDocumentSerializer(document, context={"request": request}).data, message="Uploaded. Reading it now.", status_code=status.HTTP_201_CREATED)


class KnowledgeDocumentDetailView(AdminMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="Edit a knowledge document or switch it on or off", request=KnowledgeDocumentSerializer, responses=KnowledgeDocumentSerializer)
    def patch(self, request, pk):
        document = get_object_or_404(KnowledgeDocument, pk=pk)
        serializer = KnowledgeDocumentSerializer(document, data=request.data, partial=True, context={"request": request})
        serializer.is_valid(raise_exception=True)
        document = KnowledgeDocumentService.update(actor=request.user, document=document, data=serializer.validated_data)
        return api_success(data=KnowledgeDocumentSerializer(document, context={"request": request}).data, message="Saved.")

    @extend_schema(tags=ADMIN_TAGS, summary="Delete a knowledge document", responses=OpenApiTypes.OBJECT)
    def delete(self, request, pk):
        KnowledgeDocumentService.delete(actor=request.user, document=get_object_or_404(KnowledgeDocument, pk=pk))
        return api_success(message="Deleted.")


class KnowledgeDocumentRereadView(AdminMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="Read a knowledge document again", responses=KnowledgeDocumentSerializer)
    def post(self, request, pk):
        document = KnowledgeDocumentService.reread(actor=request.user, document=get_object_or_404(KnowledgeDocument, pk=pk))
        document.refresh_from_db()
        return api_success(data=KnowledgeDocumentSerializer(document, context={"request": request}).data, message="Reading it again.")


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



# -- Copilot Branch B: the guide and Create with AI ----------------------------------------------------


class GuideView(AssistantThrottleMixin, APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="Need help? guide: steps for this page (2.14, 3.40)",
        description="Send what the page shows (route, title, buttons and fields with ids, menu). The server adds the person's role and "
        "capabilities and the manual and knowledge for this page, and answers with at most 6 steps. Steps point only at targets and "
        "routes the page sent. The guide never clicks, submits or changes anything. Guests only when the admin allows. "
        "When the AI cannot answer or the person asks for a person: handoff_suggested true.",
        request=GuideRequestSerializer,
        responses=OpenApiTypes.OBJECT,
    )
    def post(self, request):
        from apps.assistant import guide

        serializer = GuideRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = request.user if request.user.is_authenticated else None
        if user is None and not AssistantSettings.load().guests_can_use_guide:
            return api_success(data={"available": False, "handoff_suggested": True})
        try:
            data = guide.answer(user=user, payload=dict(serializer.validated_data))
        except AssistantUnavailable:
            return api_success(data={"available": False, "handoff_suggested": True})
        return api_success(data=_available(data))


class BuilderMixin:
    permission_classes = [HasCapability.of("assistant.build")]
    throttle_classes = [AssistantUserThrottle]

    def check_builder_rights(self, make: str) -> None:
        """Create with AI also needs the rights of the builders it drafts for."""
        from rest_framework.exceptions import PermissionDenied

        from apps.core.capabilities import user_has

        if make in ("form", "both") and not user_has(self.request.user, "forms.manage"):
            raise PermissionDenied({"code": "needs_forms_manage", "detail": "You need form builder rights to draft a form."})
        if make in ("workflow", "both") and not user_has(self.request.user, "entries.assign"):
            raise PermissionDenied({"code": "needs_workflow_rights", "detail": "You need workflow rights to draft a workflow."})

    def draft(self, pk):
        from apps.assistant.models import AIDraft

        draft = get_object_or_404(AIDraft.objects.select_related("program"), pk=pk)
        self.check_builder_rights(draft.make)
        return draft


class BuilderDraftListView(BuilderMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="My Create with AI drafts", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        from apps.assistant import builder
        from apps.assistant.models import AIDraft

        drafts = AIDraft.objects.filter(created_by=request.user).exclude(status=AIDraft.Status.DISCARDED)[:50]
        return api_success(data=[builder.draft_dict(draft) for draft in drafts])

    @extend_schema(
        tags=ADMIN_TAGS,
        summary="Create with AI: draft a form and/or workflow from a description (3.41)",
        description="Saves drafts only, through the existing builders. Never creates roles, teams or reference lists: what is missing "
        "comes back as a check with a fix. Send for approval and Publish use the existing publish endpoints.",
        request=BuilderDraftCreateSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        from apps.assistant import builder
        from apps.programs.models import Program

        serializer = BuilderDraftCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        values = serializer.validated_data
        self.check_builder_rights(values["make"])
        program = get_object_or_404(Program, pk=values["program_id"]) if values.get("program_id") else None
        if program is None:
            from apps.programs.general_idea import GeneralIdeaProgram

            program = GeneralIdeaProgram.get()
        try:
            draft = builder.create(actor=request.user, description=values["description"], make=values["make"], program=program, general_ideas=values["general_ideas"], requested_language=values.get("language"))
        except AssistantUnavailable as exc:
            return api_success(data={"available": False, "reason": exc.reason, "detail": exc.detail})
        return api_success(data=_available(builder.draft_dict(draft)), message="Draft ready to check.", status_code=status.HTTP_201_CREATED)


class BuilderDraftDetailView(BuilderMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="One Create with AI draft", responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        from apps.assistant import builder

        return api_success(data=builder.draft_dict(self.draft(pk)))


class BuilderDraftReviseView(BuilderMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="Change the draft in words (same draft form and workflow, history kept)", request=BuilderReviseSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        from apps.assistant import builder

        draft = self.draft(pk)
        serializer = BuilderReviseSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            draft = builder.revise(actor=request.user, draft=draft, change=serializer.validated_data["change"])
        except AssistantUnavailable as exc:
            return api_success(data={"available": False, "reason": exc.reason, "detail": exc.detail})
        return api_success(data=_available(builder.draft_dict(draft)))


class BuilderDraftTestView(BuilderMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="Test run: walk sample answers through every step without saving anything", request=BuilderTestSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        from apps.assistant import builder

        draft = self.draft(pk)
        serializer = BuilderTestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        draft = builder.test_run(actor=request.user, draft=draft, answers=serializer.validated_data.get("answers"))
        return api_success(data=builder.draft_dict(draft))


class BuilderDraftDiscardView(BuilderMixin, APIView):
    @extend_schema(tags=ADMIN_TAGS, summary="Discard a Create with AI draft", responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        from apps.assistant import builder

        return api_success(data=builder.draft_dict(builder.discard(actor=request.user, draft=self.draft(pk))), message="Discarded.")
