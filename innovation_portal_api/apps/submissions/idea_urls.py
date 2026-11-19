from django.urls import path

from apps.submissions.innovator_views import SimilarIdeasView

urlpatterns = [
    path("similar/", SimilarIdeasView.as_view(), name="ideas-similar"),
]
