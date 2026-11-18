from django.urls import path
from rest_framework.routers import DefaultRouter

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
] + router.urls + [
    path("form-sections/<uuid:pk>/", FormSectionDetailView.as_view(), name="form-section-detail"),
    path("form-sections/<uuid:section_id>/fields/", FormSectionFieldListCreateView.as_view(), name="form-section-fields"),
    path("form-fields/<uuid:pk>/", FormFieldDetailView.as_view(), name="form-field-detail"),
    path("form-fields/<uuid:field_id>/options/", FormFieldOptionListCreateView.as_view(), name="form-field-options"),
    path("form-field-options/<uuid:pk>/", FormFieldOptionDetailView.as_view(), name="form-field-option-detail"),
    path("form-fields/<uuid:field_id>/rules/", FormFieldRuleListCreateView.as_view(), name="form-field-rules"),
    path("form-field-rules/<uuid:pk>/", FormFieldRuleDetailView.as_view(), name="form-field-rule-detail"),
]
