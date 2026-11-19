from rest_framework.routers import DefaultRouter

from apps.submissions.draft_views import ApplicationDraftViewSet

router = DefaultRouter()
router.register("", ApplicationDraftViewSet, basename="application-drafts")

urlpatterns = router.urls
