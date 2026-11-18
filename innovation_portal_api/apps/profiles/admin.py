from django.contrib import admin

from apps.profiles.models import ContactVerification, InnovatorProfile

admin.site.register(InnovatorProfile)
admin.site.register(ContactVerification)
