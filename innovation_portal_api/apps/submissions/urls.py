from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.submissions.views import MySubmissionListView, SubmissionViewSet
from apps.assignments.views import InviteSpecialistView, SubmissionSpecialistInvitationListView

router = DefaultRouter()
router.register("", SubmissionViewSet, basename="submissions")

urlpatterns = router.urls + [
    path("my-submissions/", MySubmissionListView.as_view(), name="my-submissions"),
    path("<uuid:submission_id>/invite-specialist/", InviteSpecialistView.as_view(), name="submission-invite-specialist"),
    path("<uuid:submission_id>/specialist-invitations/", SubmissionSpecialistInvitationListView.as_view(), name="submission-specialist-invitations"),
]
