"""R-59 part 1 (3.38): GET /api/content/all/."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from apps.content.all_content import STATUSES, TYPES, all_content
from apps.core.api import api_success
from apps.core.permissions import HasCapability


class AllContentView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(
        tags=["Content"],
        summary="All website content in one list (3.38)",
        description="{count, page, page_size, counts: {page, news, story, quote, partner, faq}, results: [{type, id (slug for pages), title, "
        "has_setswana (null when the type has no Setswana), status: draft|pending_approval|published|archived, updated_at, updated_by, "
        "pending_approval_id}]}. Newest change first. counts follow the other filters but not type.",
        parameters=[
            OpenApiParameter("type", OpenApiTypes.STR, enum=list(TYPES)),
            OpenApiParameter("status", OpenApiTypes.STR, enum=list(STATUSES)),
            OpenApiParameter("lang", OpenApiTypes.STR, enum=["tn_missing"]),
            OpenApiParameter("search", OpenApiTypes.STR),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=all_content(request.query_params))
