from django.urls import path

from apps.profiles.views import ProfileView, VerifyContactView

urlpatterns = [
    path("", ProfileView.as_view(), name="profile"),
    path("verify-contact/", VerifyContactView.as_view(), name="verify-contact"),
]
