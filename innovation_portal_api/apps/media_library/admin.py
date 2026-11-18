from django.contrib import admin

from apps.media_library.models import MediaAsset


@admin.register(MediaAsset)
class MediaAssetAdmin(admin.ModelAdmin):
    list_display = ("original_filename", "kind", "mime_type", "size_bytes", "uploaded_by", "created_at")
    list_filter = ("kind",)
    search_fields = ("original_filename", "sha256")
    readonly_fields = ("sha256", "size_bytes", "mime_type", "width", "height", "created_at", "updated_at")
