from django.contrib import admin

from apps.events.models import AttendanceRecord, CheckInLog, Event, EventSession, PresentationSlot

admin.site.register(Event)
admin.site.register(EventSession)
admin.site.register(PresentationSlot)
admin.site.register(AttendanceRecord)
admin.site.register(CheckInLog)
