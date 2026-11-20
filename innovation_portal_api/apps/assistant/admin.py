from django.contrib import admin

from apps.assistant.models import Introduction, KnowledgeEntry, ManualPage, UsageRecord


@admin.register(KnowledgeEntry)
class KnowledgeEntryAdmin(admin.ModelAdmin):
    list_display = ("title", "audience", "language", "is_active", "ordering")


@admin.register(ManualPage)
class ManualPageAdmin(admin.ModelAdmin):
    list_display = ("title", "portal_path", "is_active", "ordering")


@admin.register(UsageRecord)
class UsageRecordAdmin(admin.ModelAdmin):
    list_display = ("created_at", "feature", "model", "outcome", "cost_usd")
    list_filter = ("feature", "outcome")


@admin.register(Introduction)
class IntroductionAdmin(admin.ModelAdmin):
    list_display = ("created_at", "kind", "status", "first_answer", "second_answer")
