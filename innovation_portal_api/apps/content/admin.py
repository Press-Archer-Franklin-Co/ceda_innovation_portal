from django.contrib import admin
from django.utils.html import format_html

from .models import ContentItem, HackathonDetail, HackathonMedia, LeadershipCard, WinnerSpotlight


class HackathonMediaInline(admin.TabularInline):
    model = HackathonMedia
    extra = 0
    fields = ["media_type", "file", "caption", "order"]


@admin.register(ContentItem)
class ContentItemAdmin(admin.ModelAdmin):
    list_display = ["title", "category", "status", "is_highlighted", "highlight_priority", "published_at", "author", "created_at"]
    list_filter = ["category", "status", "is_highlighted"]
    search_fields = ["title", "excerpt"]
    readonly_fields = ["created_at", "updated_at"]
    list_editable = ["status", "is_highlighted", "highlight_priority"]
    ordering = ["highlight_priority", "-published_at"]

    fieldsets = [
        (None, {"fields": ["title", "excerpt", "body", "category", "status"]}),
        ("Media", {"fields": ["image"]}),
        ("Publishing", {"fields": ["is_highlighted", "highlight_priority", "published_at", "author", "tags", "read_time"]}),
        ("Timestamps", {"fields": ["created_at", "updated_at"], "classes": ["collapse"]}),
    ]


@admin.register(HackathonDetail)
class HackathonDetailAdmin(admin.ModelAdmin):
    list_display = ["program", "theme", "is_published", "created_at"]
    list_filter = ["is_published"]
    search_fields = ["program__title", "theme"]
    inlines = [HackathonMediaInline]
    readonly_fields = ["created_at", "updated_at"]


@admin.register(LeadershipCard)
class LeadershipCardAdmin(admin.ModelAdmin):
    list_display = ["full_name", "job_title", "committee_role", "sort_order", "is_active", "created_at"]
    list_filter = ["is_active"]
    list_editable = ["sort_order", "is_active"]
    search_fields = ["full_name", "job_title", "committee_role"]
    readonly_fields = ["created_by", "created_at", "updated_at"]
    ordering = ["sort_order", "created_at"]

    fieldsets = [
        (None, {"fields": ["full_name", "job_title", "committee_role", "quote", "photo"]}),
        ("Visibility", {"fields": ["is_active", "sort_order", "start_at", "end_at"]}),
        ("Audit", {"fields": ["created_by", "created_at", "updated_at"], "classes": ["collapse"]}),
    ]


@admin.register(WinnerSpotlight)
class WinnerSpotlightAdmin(admin.ModelAdmin):
    list_display = ["team_name", "project_name", "program", "position", "year", "is_featured"]
    list_filter = ["position", "year", "is_featured"]
    search_fields = ["team_name", "project_name"]
    readonly_fields = ["created_at", "updated_at"]
    list_editable = ["is_featured"]
