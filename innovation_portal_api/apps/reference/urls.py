from django.urls import path

from apps.reference.views import DistrictListView, SectorListView

urlpatterns = [
    path("sectors/", SectorListView.as_view(), name="reference-sectors"),
    path("districts/", DistrictListView.as_view(), name="reference-districts"),
]
