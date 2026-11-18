from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import ContentItemViewSet, HackathonDetailViewSet, HackathonMediaViewSet, LeadershipCardViewSet, PublicStatsView, SiteSettingsView, WinnerSpotlightViewSet

news_router = DefaultRouter()
news_router.register(r"news", ContentItemViewSet, basename="content")

hackathon_router = DefaultRouter()
hackathon_router.register(r"hackathons", HackathonDetailViewSet, basename="hackathon-detail")

media_router = DefaultRouter()
media_router.register(r"media", HackathonMediaViewSet, basename="hackathon-media")

winners_router = DefaultRouter()
winners_router.register(r"winners", WinnerSpotlightViewSet, basename="winner-spotlight")

leadership_router = DefaultRouter()
leadership_router.register(r"leadership", LeadershipCardViewSet, basename="leadership-card")

urlpatterns = (
    news_router.urls
    + hackathon_router.urls
    + media_router.urls
    + winners_router.urls
    + leadership_router.urls
    + [
        path("site-settings/", SiteSettingsView.as_view(), name="site-settings"),
        path("public-stats/", PublicStatsView.as_view(), name="public-stats"),
    ]
)
