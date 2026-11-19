from django.urls import path

from apps.media_library.views import MediaAssetDetailView, MediaUploadView

urlpatterns = [
    path("", MediaUploadView.as_view(), name="media-upload"),
    path("<uuid:pk>/", MediaAssetDetailView.as_view(), name="media-detail"),
]
