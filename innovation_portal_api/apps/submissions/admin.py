from django.contrib import admin

from apps.submissions.models import Submission, SubmissionInternalNote, SubmissionResponse, SubmissionStatusHistory, SubmissionVersion

admin.site.register(Submission)
admin.site.register(SubmissionVersion)
admin.site.register(SubmissionResponse)
admin.site.register(SubmissionStatusHistory)
admin.site.register(SubmissionInternalNote)
