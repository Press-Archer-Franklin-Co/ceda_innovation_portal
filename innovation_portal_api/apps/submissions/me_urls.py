from django.urls import path

from apps.content.part2_views import MyConsentAnswerView, MyConsentListView
from apps.communications.message_views import MyIdeaMessagesReadView, MyIdeaMessagesView, MyIdeaTypingView, MyRecentMessagesView

from apps.submissions.my_work import MyWorkView
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
    path("work/", MyWorkView.as_view(), name="me-work"),
    path("consents/", MyConsentListView.as_view(), name="me-consents"),
    path("consents/<uuid:story_id>/", MyConsentAnswerView.as_view(), name="me-consent-answer"),
    path("ideas/<uuid:idea_id>/messages/", MyIdeaMessagesView.as_view(), name="me-idea-messages"),
    path("ideas/<uuid:idea_id>/messages/read/", MyIdeaMessagesReadView.as_view(), name="me-idea-messages-read"),
    path("ideas/<uuid:idea_id>/messages/typing/", MyIdeaTypingView.as_view(), name="me-idea-messages-typing"),
    path("messages/recent/", MyRecentMessagesView.as_view(), name="me-messages-recent"),
    path("ideas/", MyIdeasView.as_view(), name="me-ideas"),
    path("updates/", MyUpdatesView.as_view(), name="me-updates"),
    path("challenges/recommended/", RecommendedChallengesView.as_view(), name="me-recommended-challenges"),
    path("ideas/<uuid:idea_id>/challenge-matches/", IdeaChallengeMatchesView.as_view(), name="me-idea-challenge-matches"),
    path("ideas/<uuid:idea_id>/link-challenge/<uuid:program_id>/", LinkIdeaToChallengeView.as_view(), name="me-idea-link-challenge"),
]
