from django.contrib import admin

from apps.documents.models import DocumentCategory, DocumentVersion, SubmissionDocument

admin.site.register(DocumentCategory)
admin.site.register(SubmissionDocument)
admin.site.register(DocumentVersion)
