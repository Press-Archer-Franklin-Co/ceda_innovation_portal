from django.contrib import admin

from apps.audit.models import ActivityLog, AuditLog

admin.site.register(AuditLog)
admin.site.register(ActivityLog)
