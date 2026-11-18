from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.assignments.views import (
    AssignmentViewSet,
    InviteSpecialistView,
    OverdueAssignmentListView,
    ReviewerQueueStatsView,
    ReviewerSuggestionView,
    SpecialistInvitationClaimView,
    SpecialistInvitationDetailView,
    SpecialistInvitationResendView,
    SpecialistInvitationTokenView,
    SubmissionSpecialistInvitationListView,
)

router = DefaultRouter()
router.register("", AssignmentViewSet, basename="assignments")

urlpatterns = [
    path("overdue/", OverdueAssignmentListView.as_view(), name="assignments-overdue"),
    path("reviewer-queue/stats/", ReviewerQueueStatsView.as_view(), name="reviewer-queue-stats"),
    path("reviewer-suggestions/", ReviewerSuggestionView.as_view(), name="reviewer-suggestions"),
    path("specialist-invitations/<uuid:pk>/", SpecialistInvitationDetailView.as_view(), name="specialist-invitation-detail"),
    path("specialist-invitations/<uuid:pk>/resend/", SpecialistInvitationResendView.as_view(), name="specialist-invitation-resend"),
    path("specialist-invite/<uuid:token>/", SpecialistInvitationTokenView.as_view(), name="specialist-invite-token"),
    path("specialist-invite/<uuid:token>/claim/", SpecialistInvitationClaimView.as_view(), name="specialist-invite-claim"),
] + router.urls
