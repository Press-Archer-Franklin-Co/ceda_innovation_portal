from django.contrib import admin

from apps.support.models import FAQ, Guideline, InternalTask, SupportRequest


admin.site.register(FAQ)
admin.site.register(Guideline)
admin.site.register(InternalTask)
admin.site.register(SupportRequest)
