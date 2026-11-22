"""R-59 part 2 (3.36) endpoints for the live hackathon page."""

from django.shortcuts import get_object_or_404
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import status
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView

from apps.audit.services import AuditService
from apps.content import hackathon_page as page
from apps.content.models import HackathonDetail, HackathonUpdate
from apps.core.api import api_success
from apps.core.permissions import HasCapability

TAGS = ["Content"]
LANG = OpenApiParameter("lang", OpenApiTypes.STR, enum=["en", "tn"])


def _lang(request) -> str:
    lang = (request.query_params.get("lang") or "en").lower()
    return lang if lang in ("en", "tn") else "en"


class ActiveHackathonView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        tags=TAGS,
        summary="The hackathon page that is on now (3.36)",
        description="{hackathon: {id, program, theme, event_date, sections, venue, schedule: [{id, starts_at, title, now}], prizes: [{place, label, amount, "
        "sponsor_partner_id, sponsor}], updates} | null}. Its challenge is open, or its event is within 30 days. The menu item shows only when not null.",
        parameters=[LANG],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        detail = page.active()
        return api_success(data={"hackathon": page.public_document(detail, _lang(request), request) if detail else None})


class HackathonPageView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(tags=TAGS, summary="Hackathon page for staff (3.36)", description="{id, program, live, draft, has_draft, pending_approval_id}. live and draft are {page_sections, venue, schedule_items, prize_items}.", responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        return api_success(data=page.staff_document(get_object_or_404(HackathonDetail.objects.select_related("program"), pk=pk)))

    @extend_schema(tags=TAGS, summary="Save the hackathon page draft (3.36)", description="Any of page_sections, venue, schedule_items, prize_items. The live page does not change until approved.", request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def put(self, request, pk):
        detail = get_object_or_404(HackathonDetail.objects.select_related("program"), pk=pk)
        return api_success(data=page.save_draft(detail, request.data, actor=request.user))


class HackathonPageSubmitView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(tags=TAGS, summary="Send the hackathon page for approval (3.36)", request=None, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        detail = get_object_or_404(HackathonDetail.objects.select_related("program"), pk=pk)
        approval = page.submit(detail, actor=request.user)
        return api_success(data={"approval_id": str(approval.id), **page.staff_document(detail)}, status_code=status.HTTP_201_CREATED)


class HackathonUpdatesView(APIView):
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get_permissions(self):
        return [AllowAny()] if self.request.method == "GET" else [HasCapability.of("content.edit")()]

    @extend_schema(tags=TAGS, summary="Live updates from the hackathon (3.36)", description="Newest first.", parameters=[LANG], responses=OpenApiTypes.OBJECT)
    def get(self, request, pk):
        detail = get_object_or_404(HackathonDetail, pk=pk)
        return api_success(data=[page.update_payload(update, _lang(request), request) for update in detail.updates.all()[:50]])

    @extend_schema(tags=TAGS, summary="Post a live update (3.36)", description="{body: {en, tn}, photo?} as JSON, or multipart with body_en, body_tn and photo. Posts at once.", request=OpenApiTypes.OBJECT, responses=OpenApiTypes.OBJECT)
    def post(self, request, pk):
        detail = get_object_or_404(HackathonDetail, pk=pk)
        body = request.data.get("body") if isinstance(request.data.get("body"), dict) else {"en": request.data.get("body_en") or request.data.get("body") or "", "tn": request.data.get("body_tn") or ""}
        update = page.post_update(detail, body=body, photo=request.FILES.get("photo"), actor=request.user)
        return api_success(data=page.update_payload(update, "en", request), status_code=status.HTTP_201_CREATED)


class HackathonUpdateDetailView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(tags=TAGS, summary="Delete a live update", responses=OpenApiTypes.OBJECT)
    def delete(self, request, pk, update_id):
        update = get_object_or_404(HackathonUpdate, pk=update_id, hackathon_id=pk)
        update.delete()
        AuditService.log_action(actor=request.user, action_type="hackathon_update_deleted", target=update.hackathon, metadata={"update_id": str(update_id)})
        return api_success(data={"deleted": True})
