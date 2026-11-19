from django.contrib import admin

from apps.reference.models import District, Sector


@admin.register(Sector, District)
class ReferenceItemAdmin(admin.ModelAdmin):
    list_display = ("slug", "__str__", "ordering", "active")
    list_editable = ("ordering", "active")
    list_filter = ("active",)
    search_fields = ("slug",)
