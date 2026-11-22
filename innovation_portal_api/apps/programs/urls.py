from django.urls import path
from rest_framework.routers import DefaultRouter

from apps.programs.challenge_views import JudgingSettingsView, PublicChallengeDetailView, PublicChallengeListView, SetupStatusView
from apps.programs.stage_views import ProgramStageDetailView, ProgramStagesView
from apps.programs.entry_views import (
    ChallengeEligibilityRulesView,
    ChallengeEligibilityView,
    ChallengeEntryStateView,
    ChallengeResultsView,
    MyChallengeResultView,
    PublishChallengeResultsView,
)
from apps.programs.views import (
    FormFieldDetailView,
    FormFieldOptionDetailView,
    FormFieldOptionListCreateView,
    FormFieldRuleDetailView,
    FormFieldRuleListCreateView,
    FormSectionDetailView,
    FormSectionFieldListCreateView,
    ChallengeJudgeInviteView,
    ProgramTypeListView,
    ProgramViewSet,
    TermsAndConditionsViewSet,
)

router = DefaultRouter()
router.register("terms", TermsAndConditionsViewSet, basename="terms-and-conditions")
router.register("", ProgramViewSet, basename="programs")


urlpatterns = [
    path("types/", ProgramTypeListView.as_view(), name="program-type-list"),
    path("judge-invite/<uuid:token>/", ChallengeJudgeInviteView.as_view(), name="challenge-judge-invite"),
    path("public/challenges/", PublicChallengeListView.as_view(), name="public-challenges"),
    path("public/<slug:slug>/", PublicChallengeDetailView.as_view(), name="public-challenge-detail"),
    path("public/<slug:slug>/entry/", ChallengeEntryStateView.as_view(), name="public-challenge-entry"),
    path("public/<slug:slug>/eligibility/", ChallengeEligibilityView.as_view(), name="public-challenge-eligibility"),
    path("public/<slug:slug>/results/", ChallengeResultsView.as_view(), name="public-challenge-results"),
    path("public/<slug:slug>/my-result/", MyChallengeResultView.as_view(), name="public-challenge-my-result"),
    path("<uuid:program_id>/eligibility/", ChallengeEligibilityRulesView.as_view(), name="program-eligibility"),
    path("<uuid:program_id>/results/publish/", PublishChallengeResultsView.as_view(), name="program-results-publish"),
    path("<uuid:program_id>/setup-status/", SetupStatusView.as_view(), name="program-setup-status"),
    path("<uuid:program_id>/judging/", JudgingSettingsView.as_view(), name="program-judging"),
    path("<uuid:program_id>/stages/", ProgramStagesView.as_view(), name="program-stages"),
    path("<uuid:program_id>/stages/<uuid:step_id>/", ProgramStageDetailView.as_view(), name="program-stage-detail"),
] + router.urls + [
    path("form-sections/<uuid:pk>/", FormSectionDetailView.as_view(), name="form-section-detail"),
    path("form-sections/<uuid:section_id>/fields/", FormSectionFieldListCreateView.as_view(), name="form-section-fields"),
    path("form-fields/<uuid:pk>/", FormFieldDetailView.as_view(), name="form-field-detail"),
    path("form-fields/<uuid:field_id>/options/", FormFieldOptionListCreateView.as_view(), name="form-field-options"),
    path("form-field-options/<uuid:pk>/", FormFieldOptionDetailView.as_view(), name="form-field-option-detail"),
    path("form-fields/<uuid:field_id>/rules/", FormFieldRuleListCreateView.as_view(), name="form-field-rules"),
    path("form-field-rules/<uuid:pk>/", FormFieldRuleDetailView.as_view(), name="form-field-rule-detail"),
]
