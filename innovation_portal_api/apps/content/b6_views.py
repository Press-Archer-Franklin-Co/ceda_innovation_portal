"""B6 part 1 endpoints: home page sections, approvals, posts, partners. All answer {success, message, data}."""

from django.db.models import Count, Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.audit.services import AuditService
from apps.content.b6_serializers import DecisionSerializer, HomeDraftSerializer, PartnerSerializer, PinSerializer, PostSerializer, SubmitSerializer
from apps.content.models import ApprovalRequest, ContentItem, Partner
from apps.content.sections import describe_types
from apps.content.services import ApprovalService, PageService, PartnerService, PostService, clear_home_cache, text_in
from apps.core.api import api_success
from apps.core.i18n import normalize_language
from apps.core.permissions import IPRateThrottle, IsOfficerOrAdmin

STAFF_TAGS = ["Website content"]
PUBLIC_TAGS = ["Website content (public)"]
LANG_PARAM = OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])
PAGE_SIZE = 12


def _lang(request) -> str:
    lang = normalize_language(request.query_params.get("lang")) or "en"
    return "en" if lang == "all" else lang


class PublicContentThrottle(IPRateThrottle):
    scope = "content_public"


# --- Home page --------------------------------------------------------------------------------


class SectionTypeListView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=STAFF_TAGS, summary="List home page section types and their settings", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=describe_types())


class HomeDraftView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=STAFF_TAGS, summary="Get the home page draft", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=PageService.draft_document(PageService.home()))

    @extend_schema(
        tags=STAFF_TAGS,
        summary="Save the home page draft",
        description="The whole list of sections in order: [{id?, type, enabled, settings}]. The banner stays first and on. "
        "Texts in settings are {en, tn}. Errors come back as [{path, message}]. Visitors see nothing until it is approved.",
        request=HomeDraftSerializer,
        responses={200: OpenApiTypes.OBJECT, 400: OpenApiResponse(description="{errors: [{path, message}]}")},
    )
    def put(self, request):
        sections = request.data.get("sections") if isinstance(request.data, dict) else None
        return api_success(data=PageService.save_draft(PageService.home(), sections, actor=request.user), message="Draft saved.")


class HomePreviewView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(tags=STAFF_TAGS, summary="Preview the home page draft", description="Same shape as the public home page.", parameters=[LANG_PARAM], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        page = PageService.home()
        lang = _lang(request)
        return api_success(data={"version": None, "draft_version": page.draft_version, "language": lang, "sections": PageService.render(PageService.draft_sections(page), lang=lang, request=request)})


class HomeSubmitView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(
        tags=STAFF_TAGS,
        summary="Send the home page draft for approval",
        description="Freezes the current draft into an approval request. Once approved it goes live (at publish_at if given).",
        request=SubmitSerializer,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request):
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approval = PageService.submit(PageService.home(), actor=request.user, publish_at=serializer.validated_data.get("publish_at"))
        return api_success(data=ApprovalService.payload(approval), message="Sent for approval.", status_code=status.HTTP_201_CREATED)


class PublicHomeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="The whole home page",
        description="Live, switched-on sections in order. Each has its settings in one language and its data already resolved "
        "(partners, challenges, quotes, posts, sectors, stories). Cached for 60 seconds; publishing clears it.",
        parameters=[LANG_PARAM],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=PageService.public_home(lang=_lang(request), request=request))


# --- Approvals --------------------------------------------------------------------------------


class ApprovalListView(APIView):
    permission_classes = [IsOfficerOrAdmin]

    @extend_schema(
        tags=STAFF_TAGS,
        summary="List approval requests",
        parameters=[OpenApiParameter("status", OpenApiTypes.STR, enum=[choice for choice, _ in ApprovalRequest.Status.choices])],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        queryset = ApprovalRequest.objects.select_related("requested_by", "decided_by", "content_type")
        status_value = request.query_params.get("status")
        if status_value:
            queryset = queryset.filter(status=status_value)
        items = []
        for approval in queryset[:200]:
            item = ApprovalService.payload(approval)
            item["can_decide"] = ApprovalService.can_decide(request.user, approval)
            items.append(item)
        return api_success(data=items)


class ApprovalDecisionView(APIView):
    permission_classes = [IsOfficerOrAdmin]
    approve = True

    @extend_schema(tags=STAFF_TAGS, summary="Approve or reject a request", description="Only innovation managers and administrators decide. Rejecting needs a comment.", request=DecisionSerializer, responses=OpenApiTypes.OBJECT)
    def post(self, request, approval_id):
        serializer = DecisionSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        approval = get_object_or_404(ApprovalRequest, id=approval_id)
        approval = ApprovalService.decide(approval, actor=request.user, approve=self.approve, comment=serializer.validated_data.get("comment", ""))
        return api_success(data=ApprovalService.payload(approval), message="Approved." if self.approve else "Sent back.")


class ApprovalRejectView(ApprovalDecisionView):
    approve = False


# --- Posts (staff) ------------------------------------------------------------------------------


@extend_schema(tags=STAFF_TAGS)
class PostViewSet(viewsets.ModelViewSet):
    """Staff posts editor. The older /api/content/news/ endpoints keep working on the same rows."""

    permission_classes = [IsOfficerOrAdmin]
    serializer_class = PostSerializer
    queryset = ContentItem.objects.select_related("cover", "author")

    def get_queryset(self):
        queryset = super().get_queryset()
        params = self.request.query_params
        if params.get("status"):
            queryset = queryset.filter(status=params["status"])
        if params.get("type"):
            queryset = queryset.filter(type=params["type"])
        if params.get("q"):
            queryset = queryset.filter(Q(title__icontains=params["q"]) | Q(excerpt__icontains=params["q"]))
        return queryset.order_by("-updated_at")

    @extend_schema(
        summary="List posts",
        description="{results, counts: {live, scheduled, waiting_approval, draft, archived}}; each post has shows_on.",
        parameters=[OpenApiParameter("status", OpenApiTypes.STR), OpenApiParameter("type", OpenApiTypes.STR), OpenApiParameter("q", OpenApiTypes.STR)],
    )
    def list(self, request, *args, **kwargs):
        found = dict(ContentItem.objects.values_list("status").annotate(total=Count("id")).values_list("status", "total"))
        counts = {
            "live": found.get("published", 0),
            "scheduled": found.get("scheduled", 0),
            "waiting_approval": found.get("pending_approval", 0),
            "draft": found.get("draft", 0),
            "archived": found.get("archived", 0),
        }
        results = self.get_serializer(self.get_queryset()[:500], many=True).data
        return api_success(data={"results": results, "counts": counts})

    @extend_schema(summary="Get a post")
    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    @extend_schema(summary="Create a post (as a draft)", description="Texts are {en, tn} or a plain English string. Events need event_starts_at and event_place; newsletters need newsletter_issue.")
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        post = serializer.save()
        AuditService.log_action(actor=request.user, action_type="post_created", target=post, after_state={"type": post.type})
        return api_success(data=self.get_serializer(post).data, message="Post saved.", status_code=status.HTTP_201_CREATED)

    @extend_schema(summary="Change a post")
    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        post = serializer.save()
        if post.status == "published":
            clear_home_cache()
        AuditService.log_action(actor=request.user, action_type="post_updated", target=post)
        return api_success(data=self.get_serializer(post).data, message="Post saved.")

    @extend_schema(summary="Delete a post")
    def destroy(self, request, *args, **kwargs):
        post = self.get_object()
        AuditService.log_action(actor=request.user, action_type="post_deleted", target=post, before_state={"title": post.title})
        post.delete()
        clear_home_cache()
        return api_success(data=None, message="Post deleted.", status_code=status.HTTP_200_OK)

    @extend_schema(summary="Send a post for approval", request=SubmitSerializer)
    @action(detail=True, methods=["post"])
    def submit(self, request, pk=None):
        serializer = SubmitSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        from django.core.exceptions import ValidationError as DjangoValidationError
        from rest_framework.exceptions import ValidationError

        try:
            approval = PostService.submit(self.get_object(), actor=request.user, publish_at=serializer.validated_data.get("publish_at"))
        except DjangoValidationError as exc:
            raise ValidationError(exc.message_dict)
        return api_success(data=ApprovalService.payload(approval), message="Sent for approval.", status_code=status.HTTP_201_CREATED)

    @extend_schema(summary="Pin a post to the top of the bulletin board", request=PinSerializer)
    @action(detail=True, methods=["post"])
    def pin(self, request, pk=None):
        serializer = PinSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        until = serializer.validated_data["until"]
        if until and until <= timezone.now():
            from rest_framework.exceptions import ValidationError

            raise ValidationError({"until": "Choose a time in the future."})
        post = self.get_object()
        PostService.pin(post, actor=request.user, until=until)
        return api_success(data=self.get_serializer(post).data)

    @extend_schema(summary="Copy a post into a new draft", request=None)
    @action(detail=True, methods=["post"])
    def duplicate(self, request, pk=None):
        copy = PostService.duplicate(self.get_object(), actor=request.user)
        return api_success(data=self.get_serializer(copy).data, message="Post copied.", status_code=status.HTTP_201_CREATED)

    @extend_schema(summary="Take a post down", request=None)
    @action(detail=True, methods=["post"])
    def unpublish(self, request, pk=None):
        post = self.get_object()
        PostService.unpublish(post, actor=request.user)
        return api_success(data=self.get_serializer(post).data, message="Post taken down.")


# --- Posts (public) -----------------------------------------------------------------------------


class PublicPostListView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="List published posts",
        description="{featured, results, page, pages, total}. featured is the pinned (else newest highlighted) post on page 1.",
        parameters=[
            OpenApiParameter("type", OpenApiTypes.STR, enum=[choice for choice, _ in ContentItem.PostType.choices]),
            OpenApiParameter("q", OpenApiTypes.STR),
            OpenApiParameter("sort", OpenApiTypes.STR, enum=["newest", "oldest", "popular"]),
            OpenApiParameter("page", OpenApiTypes.INT),
            LANG_PARAM,
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        lang = _lang(request)
        queryset = PostService.public_queryset()
        params = request.query_params
        if params.get("type"):
            queryset = queryset.filter(type=params["type"])
        if params.get("q"):
            q = params["q"].strip()
            queryset = queryset.filter(Q(title__icontains=q) | Q(excerpt__icontains=q) | Q(body__icontains=q) | Q(translations__icontains=q))
        sort = params.get("sort") or "newest"
        ordering = {"oldest": ["published_at"], "popular": ["-view_count", "-published_at"]}.get(sort, ["-published_at"])
        try:
            page = max(1, int(params.get("page") or 1))
        except ValueError:
            page = 1
        featured = None
        if page == 1 and not params.get("q"):
            now = timezone.now()
            featured = queryset.filter(pinned_until__gt=now).order_by("-pinned_until").first() or queryset.filter(is_highlighted=True).order_by("highlight_priority", "-published_at").first()
        rest = queryset.exclude(pk=featured.pk) if featured else queryset
        total = rest.count()
        items = rest.order_by(*ordering)[(page - 1) * PAGE_SIZE : page * PAGE_SIZE]
        return api_success(
            data={
                "featured": PostService.card(featured, lang, request) if featured else None,
                "results": [PostService.card(post, lang, request) for post in items],
                "page": page,
                "pages": max(1, -(-total // PAGE_SIZE)),
                "total": total,
            }
        )


class PublicPostDetailView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Read one post", description="Counts a view. related: up to 3 posts of the same type or tags.", parameters=[LANG_PARAM], responses=OpenApiTypes.OBJECT)
    def get(self, request, slug):
        lang = _lang(request)
        post = get_object_or_404(PostService.public_queryset(), slug=slug)
        PostService.count_view(post)
        data = PostService.card(post, lang, request)
        data["body"] = text_in(post, "body", lang)
        data["related"] = [PostService.card(item, lang, request) for item in PostService.related(post)]
        return api_success(data=data)


class PublicUpcomingEventsView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Upcoming events", parameters=[LANG_PARAM], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        lang = _lang(request)
        events = PostService.public_queryset().filter(type=ContentItem.PostType.EVENT, event_starts_at__gte=timezone.now()).order_by("event_starts_at")[:20]
        return api_success(data=[PostService.card(post, lang, request) for post in events])


class PublicNewslettersView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(tags=PUBLIC_TAGS, summary="Newsletter issues, newest first", parameters=[LANG_PARAM], responses=OpenApiTypes.OBJECT)
    def get(self, request):
        lang = _lang(request)
        issues = PostService.public_queryset().filter(type=ContentItem.PostType.NEWSLETTER).order_by("-newsletter_issue", "-published_at")[:50]
        return api_success(data=[PostService.card(post, lang, request) for post in issues])


# --- Partners ------------------------------------------------------------------------------------


@extend_schema(tags=STAFF_TAGS)
class PartnerViewSet(viewsets.ModelViewSet):
    permission_classes = [IsOfficerOrAdmin]
    serializer_class = PartnerSerializer
    queryset = Partner.objects.select_related("logo").prefetch_related("programs")

    def list(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_queryset(), many=True).data)

    def retrieve(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def perform_create(self, serializer):
        partner = serializer.save()
        clear_home_cache()
        AuditService.log_action(actor=self.request.user, action_type="partner_created", target=partner)

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return api_success(data=serializer.data, status_code=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop("partial", False)
        serializer = self.get_serializer(self.get_object(), data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        partner = serializer.save()
        clear_home_cache()
        AuditService.log_action(actor=request.user, action_type="partner_updated", target=partner)
        return api_success(data=serializer.data)

    def destroy(self, request, *args, **kwargs):
        partner = self.get_object()
        AuditService.log_action(actor=request.user, action_type="partner_deleted", target=partner, before_state={"name": partner.name})
        partner.delete()
        clear_home_cache()
        return api_success(data=None, message="Partner removed.")


class PublicPartnerListView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="Partners and sponsors",
        description="Ordered by tier then order; only within their show dates.",
        parameters=[OpenApiParameter("placement", OpenApiTypes.STR, enum=["home", "program"]), OpenApiParameter("program", OpenApiTypes.UUID)],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        import uuid

        placement = request.query_params.get("placement") or "home"
        program_id = request.query_params.get("program")
        try:
            program_id = uuid.UUID(program_id) if program_id else None
        except ValueError:
            program_id = None
        partners = PartnerService.public(placement=placement, program_id=program_id)
        return api_success(data=[PartnerService.payload(partner, request) for partner in partners])
