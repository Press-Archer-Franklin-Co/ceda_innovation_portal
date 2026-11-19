from django.shortcuts import get_object_or_404
from drf_spectacular.utils import OpenApiResponse, extend_schema, extend_schema_view
from rest_framework import generics, status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.response import Response

from apps.core.api import api_success
from apps.media_library.models import MediaAsset
from apps.media_library.permissions import IsMediaOwnerOrStaff
from apps.media_library.serializers import MediaAssetSerializer, MediaUploadSerializer
from apps.media_library.services import MediaService
from apps.media_library.validation import MediaValidationError


@extend_schema(
    tags=["Media"],
    summary="Upload a media file",
    description=(
        "Multipart upload of an image, video, document or audio file. Limits: images 10 MB, documents 20 MB, "
        "audio 10 MB, video 50 MB. Other file types are refused, and the file content must match its extension. "
        "Send `make_monochrome=true` with a logo image to also get a one-colour PNG copy (`monochrome_url`)."
    ),
    request={"multipart/form-data": MediaUploadSerializer},
    responses={201: MediaAssetSerializer, 400: OpenApiResponse(description="Type not allowed, too large, or content mismatch.")},
)
class MediaUploadView(generics.GenericAPIView):
    serializer_class = MediaUploadSerializer
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        try:
            asset = MediaService.create_asset(
                actor=request.user,
                upload=data["file"],
                expected_kind=data.get("kind"),
                alt_text=data.get("alt_text"),
                captions=data.get("captions"),
                duration_seconds=data.get("duration_seconds"),
                make_monochrome=data.get("make_monochrome", False),
                monochrome_color=data.get("monochrome_color"),
            )
        except MediaValidationError as exc:
            field = "captions" if exc.code.startswith("captions") else "file"
            raise ValidationError({field: [str(exc)], "code": exc.code}) from exc
        return api_success(
            data=MediaAssetSerializer(asset, context={"request": request}).data,
            message="File uploaded.",
            status_code=status.HTTP_201_CREATED,
        )


@extend_schema_view(
    get=extend_schema(tags=["Media"], summary="Get a media file's details", responses={200: MediaAssetSerializer}),
    delete=extend_schema(tags=["Media"], summary="Delete a media file", description="Owner or staff only. Removes the stored files too.", responses={204: None}),
)
class MediaAssetDetailView(generics.GenericAPIView):
    serializer_class = MediaAssetSerializer
    permission_classes = [IsMediaOwnerOrStaff]
    queryset = MediaAsset.objects.all()

    def get_object(self):
        asset = get_object_or_404(MediaAsset, pk=self.kwargs["pk"])
        self.check_object_permissions(self.request, asset)
        return asset

    def get(self, request, *args, **kwargs):
        return api_success(data=self.get_serializer(self.get_object()).data)

    def delete(self, request, *args, **kwargs):
        MediaService.delete_asset(asset=self.get_object(), actor=request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)
