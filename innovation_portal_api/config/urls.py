from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.http import JsonResponse
from django.urls import include, path
from django.views.generic import RedirectView
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from apps.core.permissions import IsAdministrator


class _StaffSpectacularAPIView(SpectacularAPIView):
    permission_classes = [IsAdministrator]


class _StaffSwaggerView(SpectacularSwaggerView):
    permission_classes = [IsAdministrator]


class _StaffRedocView(SpectacularRedocView):
    permission_classes = [IsAdministrator]

from apps.audit.views import SubmissionAuditLogListView
from apps.assignments.views import OverdueAssignmentListView, ReviewerQueueStatsView, ReviewerQueueView, ReviewerSuggestionView
from apps.communications.message_views import SubmissionMessagesView
from apps.assignments.saved_views import SavedViewDetailView, SavedViewListCreateView
from apps.programs.challenge_views import CriteriaLibraryView
from apps.submissions.staff_search import StaffSearchView
from apps.communications.views import SubmissionCommunicationListView
from apps.documents.views import SubmissionDocumentListCreateView
from apps.screening.views import ScreeningCreateView, ScreeningListView
from apps.submissions.views import MySubmissionListView
from apps.tracking.views import SubmissionTrackingView
from apps.evaluation.views import EvaluationOverrideView, LockEvaluationView, ProgramRankingView, ProgramShortlistGenerationView

urlpatterns = [
    path("health/", lambda request: JsonResponse({"status": "ok"}), name="health"),
    path("admin/", admin.site.urls),
    path("docs/", RedirectView.as_view(pattern_name="swagger-ui", permanent=False), name="docs"),
    path("api/schema/", _StaffSpectacularAPIView.as_view(), name="schema"),
    path("api/docs/swagger/", _StaffSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
    path("api/docs/redoc/", _StaffRedocView.as_view(url_name="schema"), name="redoc"),
    path("api/auth/", include("apps.accounts.urls")),
    path("api/admin/", include("apps.accounts.admin_urls")),
    path("api/profile/", include("apps.profiles.urls")),
    path("api/teams/", include("apps.teams.urls")),
    path("api/programs/", include("apps.programs.urls")),
    path("api/forms/", include("apps.programs.form_urls")),
    path("api/drafts/", include("apps.submissions.draft_urls")),
    path("api/me/", include("apps.submissions.me_urls")),
    path("api/ideas/", include("apps.submissions.idea_urls")),
    path("api/submissions/<uuid:submission_id>/messages/", SubmissionMessagesView.as_view(), name="submission-messages"),
    path("api/submissions/", include("apps.submissions.urls")),
    path("api/documents/", include("apps.documents.urls")),
    path("api/screening/", include("apps.screening.urls")),
    path("api/assignments/", include("apps.assignments.urls")),
    path("api/evaluations/criteria-library/", CriteriaLibraryView.as_view(), name="criteria-library"),
    path("api/evaluations/", include("apps.evaluation.urls")),
    path("api/communications/", include("apps.communications.urls")),
    path("api/notifications/", include("apps.notifications.urls")),
    path("api/", include("apps.workflow.urls")),
    path("api/reviewer-queue/", ReviewerQueueView.as_view(), name="reviewer-queue"),
    path("api/saved-views/", SavedViewListCreateView.as_view(), name="saved-views"),
    path("api/saved-views/<uuid:view_id>/", SavedViewDetailView.as_view(), name="saved-view-detail"),
    path("api/staff-search/", StaffSearchView.as_view(), name="staff-search"),
    path("api/reviewer-queue/stats/", ReviewerQueueStatsView.as_view(), name="reviewer-queue-stats-direct"),
    path("api/assignments/overdue/", OverdueAssignmentListView.as_view(), name="assignments-overdue-direct"),
    path("api/reviewer-suggestions/", ReviewerSuggestionView.as_view(), name="reviewer-suggestions-direct"),
    path("api/events/", include("apps.events.urls")),
    path("api/reports/", include("apps.reports.urls")),
    path("api/operations/", include("apps.operations.urls")),
    path("api/analytics/", include("apps.analytics.urls")),
    path("api/audit/", include("apps.audit.urls")),
    path("api/support/", include("apps.support.urls")),
    path("api/content/", include("apps.content.urls")),
    path("api/tracking/", include("apps.tracking.urls")),
    path("api/media/", include("apps.media_library.urls")),
    path("api/reference/", include("apps.reference.urls")),
    path("api/platform/", include("apps.platform_config.urls")),
    path("api/assistant/", include("apps.assistant.urls")),
    path("api/submissions/<uuid:submission_id>/documents/", SubmissionDocumentListCreateView.as_view(), name="submission-documents-direct"),
    path("api/submissions/<uuid:submission_id>/screen/", ScreeningCreateView.as_view(), name="submission-screen-direct"),
    path("api/submissions/<uuid:submission_id>/screening/", ScreeningListView.as_view(), name="submission-screening-direct"),
    path("api/submissions/<uuid:submission_id>/communications/", SubmissionCommunicationListView.as_view(), name="submission-communications-direct"),
    path("api/submissions/<uuid:submission_id>/audit/", SubmissionAuditLogListView.as_view(), name="submission-audit-direct"),
    path("api/my-submissions/", MySubmissionListView.as_view(), name="my-submissions-direct"),
    path("api/track/<str:reference_number>/", SubmissionTrackingView.as_view(), name="submission-track-direct"),
    path("api/programs/<uuid:program_id>/ranking/", ProgramRankingView.as_view(), name="program-ranking-direct"),
    path("api/programs/<uuid:program_id>/generate-shortlist/", ProgramShortlistGenerationView.as_view(), name="program-generate-shortlist-direct"),
    path("api/submissions/<uuid:submission_id>/evaluations/<uuid:evaluation_id>/lock/", LockEvaluationView.as_view(), name="submission-lock-evaluation-direct"),
    path("api/submissions/<uuid:submission_id>/evaluations/override/", EvaluationOverrideView.as_view(), name="submission-evaluation-override-direct"),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
