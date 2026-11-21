from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.submissions.staff_views import StaffSubmissionListView, StaffSubmissionSummaryView
from apps.submissions.views import MySubmissionListView, SubmissionViewSet
from apps.assignments.views import InviteSpecialistView, SubmissionSpecialistInvitationListView

router = DefaultRouter()
router.register("", SubmissionViewSet, basename="submissions")

urlpatterns = [
    # R-42: before the router, whose detail route would take "staff-list" as an id.
    path("staff-list/", StaffSubmissionListView.as_view(), name="submissions-staff-list"),
    path("<uuid:submission_id>/staff-summary/", StaffSubmissionSummaryView.as_view(), name="submission-staff-summary"),
] + router.urls + [
    path("my-submissions/", MySubmissionListView.as_view(), name="my-submissions"),
    path("<uuid:submission_id>/invite-specialist/", InviteSpecialistView.as_view(), name="submission-invite-specialist"),
    path("<uuid:submission_id>/specialist-invitations/", SubmissionSpecialistInvitationListView.as_view(), name="submission-specialist-invitations"),
]
