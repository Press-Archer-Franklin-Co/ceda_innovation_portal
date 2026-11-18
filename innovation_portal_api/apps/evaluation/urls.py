from django.urls import path

from apps.evaluation.views import (
    EvaluationSummaryView,
    EvaluationOverrideView,
    FinalDecisionView,
    LockEvaluationView,
    MarkingCriteriaDetailView,
    MarkingCriteriaItemDetailView,
    MarkingCriteriaItemsView,
    MarkingCriteriaListView,
    ModerateSubmissionView,
    MyCycleView,
    MyAssignedEvaluationsView,
    OverdueEvaluationsView,
    PendingEvaluationsView,
    ProgramRankingView,
    ProgramShortlistGenerationView,
    ReviewCycleListView,
    ReviewCycleActionView,
    ReviewCycleSummaryView,
    SaveCycleScoresView,
    SaveScoresView,
    StageCriteriaView,
    StageCriterionDetailView,
    StageEvaluationConfigView,
    SubmissionCycleHistoryView,
    SubmissionReviewFeedbackView,
    SubmitCycleScoresView,
    SubmitScoresView,
    SubmissionRubricView,
)

urlpatterns = [
    path("my-assigned/", MyAssignedEvaluationsView.as_view(), name="my-assigned-evaluations"),
    path("pending/", PendingEvaluationsView.as_view(), name="pending-evaluations"),
    path("overdue/", OverdueEvaluationsView.as_view(), name="overdue-evaluations"),

    path("marking-criteria/", MarkingCriteriaListView.as_view(), name="marking-criteria-list"),
    path("marking-criteria/<uuid:criteria_id>/", MarkingCriteriaDetailView.as_view(), name="marking-criteria-detail"),
    path("marking-criteria/<uuid:criteria_id>/items/", MarkingCriteriaItemsView.as_view(), name="marking-criteria-items"),
    path("marking-criteria/<uuid:criteria_id>/items/<uuid:item_id>/", MarkingCriteriaItemDetailView.as_view(), name="marking-criteria-item-detail"),

    path("steps/<uuid:step_id>/evaluation-config/", StageEvaluationConfigView.as_view(), name="stage-evaluation-config"),
    path("steps/<uuid:step_id>/evaluation-config/criteria/", StageCriteriaView.as_view(), name="stage-criteria"),
    path("steps/<uuid:step_id>/evaluation-config/criteria/<uuid:criterion_id>/", StageCriterionDetailView.as_view(), name="stage-criterion-detail"),

    path("<uuid:submission_id>/cycle/", MyCycleView.as_view(), name="my-review-cycle"),
    path("<uuid:submission_id>/cycle/scores/", SaveCycleScoresView.as_view(), name="save-cycle-scores"),
    path("<uuid:submission_id>/cycle/submit/", SubmitCycleScoresView.as_view(), name="submit-cycle-scores"),

    path("<uuid:submission_id>/cycles/", ReviewCycleListView.as_view(), name="review-cycle-list"),
    path("<uuid:submission_id>/cycles/<uuid:cycle_id>/summary/", ReviewCycleSummaryView.as_view(), name="review-cycle-summary"),
    path("<uuid:submission_id>/cycles/<uuid:cycle_id>/<slug:action>/", ReviewCycleActionView.as_view(), name="review-cycle-action"),

    path("<uuid:submission_id>/feedback/", SubmissionReviewFeedbackView.as_view(), name="submission-review-feedback"),
    path("<uuid:submission_id>/cycle-history/", SubmissionCycleHistoryView.as_view(), name="submission-cycle-history"),

    path("<uuid:submission_id>/rubric/", SubmissionRubricView.as_view(), name="submission-rubric"),
    path("<uuid:submission_id>/scores/", SaveScoresView.as_view(), name="save-scores"),
    path("<uuid:submission_id>/submit/", SubmitScoresView.as_view(), name="submit-scores"),
    path("<uuid:submission_id>/summary/", EvaluationSummaryView.as_view(), name="evaluation-summary"),
    path("<uuid:submission_id>/evaluations/<uuid:evaluation_id>/lock/", LockEvaluationView.as_view(), name="lock-evaluation"),
    path("<uuid:submission_id>/override/", EvaluationOverrideView.as_view(), name="evaluation-override"),
    path("<uuid:submission_id>/moderate/", ModerateSubmissionView.as_view(), name="moderate-submission"),
    path("<uuid:submission_id>/final-decision/", FinalDecisionView.as_view(), name="final-decision"),

    path("programs/<uuid:program_id>/ranking/", ProgramRankingView.as_view(), name="program-ranking"),
    path("programs/<uuid:program_id>/generate-shortlist/", ProgramShortlistGenerationView.as_view(), name="program-generate-shortlist"),
]
