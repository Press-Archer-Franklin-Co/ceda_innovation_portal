from django.urls import path

from apps.screening.views import ScreeningCreateView, ScreeningListView

urlpatterns = [
    path("submissions/<uuid:submission_id>/screen/", ScreeningCreateView.as_view(), name="submission-screen"),
    path("submissions/<uuid:submission_id>/screening/", ScreeningListView.as_view(), name="submission-screening"),
]
