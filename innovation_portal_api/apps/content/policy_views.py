"""U11C: policy page text endpoints. All answer {success, message, data}."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, OpenApiResponse, extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.content import policies
from apps.content.b6_views import LANG_PARAM, PUBLIC_TAGS, STAFF_TAGS, PublicContentThrottle, _lang
from apps.content.models import PolicyPage
from apps.content.services import ApprovalService
from apps.core.api import api_success
from apps.core.permissions import HasCapability

KEY_PARAM = OpenApiParameter("key", OpenApiTypes.STR, OpenApiParameter.PATH, enum=[key for key, _ in PolicyPage.Key.choices])
CONTENT_HELP = (
    'Body: {title: {en, tn}, intro: {en, tn}, sections: [{heading: {en, tn}, body: {en, tn}}]}. '
    "English is required for the title and every body. Bodies are plain text: a blank line starts a paragraph, "
    'a line starting with "• " is a bullet. Errors come back as {errors: [{path, message}]}.'
)


class PolicyListView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(tags=STAFF_TAGS, summary="List the policy pages", responses=OpenApiTypes.OBJECT)
    def get(self, request):
        return api_success(data=[policies.staff_row(page) for page in PolicyPage.objects.all()])


class PolicyDetailView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(
        tags=STAFF_TAGS,
        summary="One policy page: live text, draft and any open approval",
        parameters=[KEY_PARAM],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, key):
        return api_success(data=policies.staff_document(policies.get_page(key), request.user))


class PolicyDraftView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(
        tags=STAFF_TAGS,
        summary="Save a policy page draft",
        description=CONTENT_HELP + " Visitors keep seeing the live text until the draft is sent and approved.",
        parameters=[KEY_PARAM],
        request=OpenApiTypes.OBJECT,
        responses={200: OpenApiTypes.OBJECT, 400: OpenApiResponse(description="{errors: [{path, message}]}")},
    )
    def put(self, request, key):
        page = policies.save_draft(policies.get_page(key), request.data, actor=request.user)
        return api_success(data=policies.staff_document(page, request.user), message="Draft saved.")

    @extend_schema(tags=STAFF_TAGS, summary="Throw away a policy page draft", parameters=[KEY_PARAM], responses=OpenApiTypes.OBJECT)
    def delete(self, request, key):
        page = policies.discard_draft(policies.get_page(key), actor=request.user)
        return api_success(data=policies.staff_document(page, request.user), message="Draft discarded.")


class PolicySubmitView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(
        tags=STAFF_TAGS,
        summary="Send a policy page draft for approval",
        description="Freezes the draft into a website approval request (approve or send back at /api/content/approvals/). "
        "Once approved the text goes live.",
        parameters=[KEY_PARAM],
        request=None,
        responses={201: OpenApiTypes.OBJECT},
    )
    def post(self, request, key):
        approval = policies.submit(policies.get_page(key), actor=request.user)
        return api_success(data=ApprovalService.payload(approval, request.user), message="Sent for approval.", status_code=status.HTTP_201_CREATED)


class PublicPolicyView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [PublicContentThrottle]

    @extend_schema(
        tags=PUBLIC_TAGS,
        summary="A policy page's live text in one language",
        description="Returns {key, lang, title, intro, sections: [{heading, body}], updated_at, english_fallback}. "
        "english_fallback is true when some Setswana is missing and English is shown in its place.",
        parameters=[KEY_PARAM, LANG_PARAM],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request, key):
        return api_success(data=policies.public_document(policies.get_page(key), _lang(request)))
