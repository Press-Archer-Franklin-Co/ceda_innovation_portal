from django.contrib import admin

from apps.screening.models import DuplicateFlag, ScreeningChecklist, ScreeningChecklistItem, ScreeningReview

admin.site.register(ScreeningChecklist)
admin.site.register(ScreeningChecklistItem)
admin.site.register(ScreeningReview)
admin.site.register(DuplicateFlag)
