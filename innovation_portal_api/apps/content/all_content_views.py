"""R-59 part 1 (3.38): GET /api/content/all/."""

from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework.views import APIView

from apps.content.all_content import LANGS, ORDERINGS, STATUSES, TYPES, all_content
from apps.core.api import api_success
from apps.core.permissions import HasCapability


class AllContentView(APIView):
    permission_classes = [HasCapability.of("content.edit")]

    @extend_schema(
        tags=["Content"],
        summary="All website content in one list (3.38)",
        description="{count, page, page_size, counts: {page, news, story, quote, partner, faq, policy}, results: [{type, id (slug for pages, key for policy pages), title, "
        "has_setswana (null when the type has no Setswana), status: draft|pending_approval|scheduled|published|archived, updated_at, updated_by, "
        "pending_approval_id}]}. scheduled: published with a publish date still in the future (news, stories and quotes only); "
        "status=published leaves those out. Policy pages are pending_approval while a sent draft waits, published once live, draft before that. "
        "lang=tn_missing or tn_has. ordering: -updated_at (default, newest change first), updated_at, title, -title. "
        "counts follow the other filters but not type.",
        parameters=[
            OpenApiParameter("type", OpenApiTypes.STR, enum=list(TYPES)),
            OpenApiParameter("status", OpenApiTypes.STR, enum=list(STATUSES)),
            OpenApiParameter("lang", OpenApiTypes.STR, enum=list(LANGS)),
            OpenApiParameter("ordering", OpenApiTypes.STR, enum=list(ORDERINGS)),
            OpenApiParameter("search", OpenApiTypes.STR),
            OpenApiParameter("page", OpenApiTypes.INT),
            OpenApiParameter("page_size", OpenApiTypes.INT),
        ],
        responses=OpenApiTypes.OBJECT,
    )
    def get(self, request):
        return api_success(data=all_content(request.query_params))
