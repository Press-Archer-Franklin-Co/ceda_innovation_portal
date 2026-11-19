from django.contrib import admin

from apps.communications.models import CommunicationLog, MessageTemplate, Notification, NotificationPreference, NotificationTypePreference

admin.site.register(MessageTemplate)
admin.site.register(CommunicationLog)
admin.site.register(Notification)
admin.site.register(NotificationPreference)
admin.site.register(NotificationTypePreference)
