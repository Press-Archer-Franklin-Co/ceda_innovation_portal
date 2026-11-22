from apps.content.all_content_views import AllContentView
from django.urls import path
from rest_framework.routers import DefaultRouter

from .b6_views import (
    ApprovalDecisionView,
    ApprovalListView,
    ApprovalRejectView,
    HeroPhotoDetailView,
    HeroPhotoUploadView,
    HomeDraftView,
    HomePreviewView,
    HomeSubmitView,
    PartnerViewSet,
    PostViewSet,
    PublicHomeView,
    PublicNewslettersView,
    PublicPartnerListView,
    PublicPostDetailView,
    PublicPostListView,
    PublicUpcomingEventsView,
    SectionTypeListView,
)
from .part2_views import (
    PostBlastView,
    PublicConfirmSubscriptionView,
    PublicSearchView,
    PublicStoryListView,
    PublicSubscribeView,
    PublicUnsubscribeView,
    StoryViewSet,
    SubscriberCountsView,
)
from .views import ContentItemViewSet, HackathonDetailViewSet, HackathonMediaViewSet, LeadershipCardViewSet, PublicStatsView, SiteSettingsView, WinnerSpotlightViewSet

news_router = DefaultRouter()
news_router.register(r"news", ContentItemViewSet, basename="content")

hackathon_router = DefaultRouter()
hackathon_router.register(r"hackathons", HackathonDetailViewSet, basename="hackathon-detail")

media_router = DefaultRouter()
media_router.register(r"media", HackathonMediaViewSet, basename="hackathon-media")

winners_router = DefaultRouter()
winners_router.register(r"winners", WinnerSpotlightViewSet, basename="winner-spotlight")

b6_router = DefaultRouter()
b6_router.register(r"posts", PostViewSet, basename="content-post")
b6_router.register(r"partners", PartnerViewSet, basename="content-partner")
b6_router.register(r"stories", StoryViewSet, basename="content-story")

leadership_router = DefaultRouter()
leadership_router.register(r"leadership", LeadershipCardViewSet, basename="leadership-card")

urlpatterns = (
    news_router.urls
    + hackathon_router.urls
    + media_router.urls
    + winners_router.urls
    + leadership_router.urls
    + b6_router.urls
    + [
        path("section-types/", SectionTypeListView.as_view(), name="content-section-types"),
        path("pages/home/draft/", HomeDraftView.as_view(), name="content-home-draft"),
        path("hero-photo/", HeroPhotoUploadView.as_view(), name="content-hero-photo"),
        path("hero-photo/<uuid:photo_id>/", HeroPhotoDetailView.as_view(), name="content-hero-photo-detail"),
        path("pages/home/preview/", HomePreviewView.as_view(), name="content-home-preview"),
        path("pages/home/submit/", HomeSubmitView.as_view(), name="content-home-submit"),
        path("approvals/", ApprovalListView.as_view(), name="content-approvals"),
        path("approvals/<uuid:approval_id>/approve/", ApprovalDecisionView.as_view(), name="content-approval-approve"),
        path("approvals/<uuid:approval_id>/reject/", ApprovalRejectView.as_view(), name="content-approval-reject"),
        path("public/home/", PublicHomeView.as_view(), name="content-public-home"),
        path("public/posts/", PublicPostListView.as_view(), name="content-public-posts"),
        path("public/posts/<slug:slug>/", PublicPostDetailView.as_view(), name="content-public-post"),
        path("public/events/upcoming/", PublicUpcomingEventsView.as_view(), name="content-public-events"),
        path("public/newsletters/", PublicNewslettersView.as_view(), name="content-public-newsletters"),
        path("public/partners/", PublicPartnerListView.as_view(), name="content-public-partners"),
        path("public/stories/", PublicStoryListView.as_view(), name="content-public-stories"),
        path("public/search/", PublicSearchView.as_view(), name="content-public-search"),
        path("public/subscriptions/", PublicSubscribeView.as_view(), name="content-public-subscribe"),
        path("public/subscriptions/confirm/<uuid:token>/", PublicConfirmSubscriptionView.as_view(), name="content-public-subscribe-confirm"),
        path("public/unsubscribe/<uuid:token>/", PublicUnsubscribeView.as_view(), name="content-public-unsubscribe"),
        path("subscribers/counts/", SubscriberCountsView.as_view(), name="content-subscriber-counts"),
        path("posts/<uuid:post_id>/blast/", PostBlastView.as_view(), name="content-post-blast"),
        path("site-settings/", SiteSettingsView.as_view(), name="site-settings"),
        path("all/", AllContentView.as_view(), name="content-all"),
        path("public-stats/", PublicStatsView.as_view(), name="public-stats"),
    ]
)
