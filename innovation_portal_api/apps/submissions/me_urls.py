from django.urls import path

from apps.submissions.innovator_views import (
    IdeaChallengeMatchesView,
    LinkIdeaToChallengeView,
    MyIdeasView,
    MySummaryView,
    MyUpdatesView,
    RecommendedChallengesView,
)

urlpatterns = [
    path("summary/", MySummaryView.as_view(), name="me-summary"),
    path("ideas/", MyIdeasView.as_view(), name="me-ideas"),
    path("updates/", MyUpdatesView.as_view(), name="me-updates"),
    path("challenges/recommended/", RecommendedChallengesView.as_view(), name="me-recommended-challenges"),
    path("ideas/<uuid:idea_id>/challenge-matches/", IdeaChallengeMatchesView.as_view(), name="me-idea-challenge-matches"),
    path("ideas/<uuid:idea_id>/link-challenge/<uuid:program_id>/", LinkIdeaToChallengeView.as_view(), name="me-idea-link-challenge"),
]
