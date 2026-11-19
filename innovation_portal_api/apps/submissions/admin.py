from django.contrib import admin

from apps.submissions.models import Submission, SubmissionInternalNote, SubmissionResponse, SubmissionStatusHistory, SubmissionVersion

admin.site.register(Submission)
admin.site.register(SubmissionVersion)
admin.site.register(SubmissionResponse)
admin.site.register(SubmissionStatusHistory)
admin.site.register(SubmissionInternalNote)


from apps.submissions.models import ConsentRecord  # noqa: E402


@admin.register(ConsentRecord)
class ConsentRecordAdmin(admin.ModelAdmin):
    """Evidence of consent: read-only."""

    list_display = ("given_at", "purpose", "text_version", "user", "guest_phone", "submission")
    list_filter = ("purpose", "text_version")
    search_fields = ("submission__reference_number", "guest_phone", "user__email", "user__phone_number")
    readonly_fields = [field.name for field in ConsentRecord._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
