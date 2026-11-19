from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics
from rest_framework.permissions import AllowAny

from apps.core.permissions import IPRateThrottle
from apps.reference.selectors import ReferenceSelector
from apps.reference.serializers import DistrictSerializer, SectorSerializer

LANG_PARAMETER = OpenApiParameter(
    name="lang",
    description="Language for names: `en` (default) or `tn`. Setswana falls back to English when missing. Also read from Accept-Language.",
    required=False,
    type=str,
    enum=["en", "tn"],
)


class _PublicReferenceListView(generics.ListAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [IPRateThrottle]
    pagination_class = None
    filter_backends = []


@extend_schema(
    tags=["Reference"],
    summary="List business sectors",
    description="Active sectors in display order. Public.",
    parameters=[LANG_PARAMETER],
)
class SectorListView(_PublicReferenceListView):
    serializer_class = SectorSerializer

    def get_queryset(self):
        return ReferenceSelector.active_sectors()


@extend_schema(
    tags=["Reference"],
    summary="List districts of Botswana",
    description="Active districts in display order. Public.",
    parameters=[LANG_PARAMETER],
)
class DistrictListView(_PublicReferenceListView):
    serializer_class = DistrictSerializer

    def get_queryset(self):
        return ReferenceSelector.active_districts()
