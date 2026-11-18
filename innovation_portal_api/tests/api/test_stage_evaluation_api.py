"""
Tests for stage-based evaluation:
  - StageEvaluationConfig CRUD
  - StageCriterion CRUD
  - ReviewCycle lifecycle (open, score, submit, auto-decide)
  - Reviewer blindness enforcement
  - Threshold-based auto-decisions (pass / return / reject)
  - Reviewer lock-out after submission
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.core.constants import AssignmentRoleType, AssignmentStatus, ProgramTypeCode, RoleType, ScoreSheetStatus, SubmissionFormFieldType, SubmissionType
from apps.evaluation.models import (
    ReviewCycle,
    ScoreSheet,
    StageCriterion,
    StageEvaluationConfig,
)
from apps.evaluation.services import EvaluationService, ReviewCycleService, StageConfigService
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.models import WorkflowStep
from apps.workflow.services import WorkflowRuntimeService



def _make_user(email, role, first="Test", last="User"):
    user = User.objects.create_user(email=email, password="StrongPass123!", first_name=first, last_name=last)
    RoleService.assign_roles(user, [role])
    return user


def _make_program(program_type, officer):
    return Program.objects.create(
        title="Stage Eval Program",
        slug="stage-eval-program",
        description="Test",
        program_type=program_type,
        opening_date=timezone.now(),
        closing_date=timezone.now() + timezone.timedelta(days=30),
        owner=officer,
    )


def _make_submission(innovator, program, field):
    sub = SubmissionService.create_draft(
        innovator=innovator,
        program=program,
        submission_type=SubmissionType.HACKATHON_APPLICATION,
        title="Stage Eval Submission",
    )
    SubmissionService.save_responses(sub, responses=[{"form_field": field.id, "value": "My idea"}], actor=innovator)
    return SubmissionService.finalize_submission(sub, innovator)


def _advance_to_step(submission, officer, steps=3):
    """Advance through n approve actions so there is an active workflow step."""
    for _ in range(steps):
        try:
            WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="advance")
        except Exception:
            break


def _assign_and_accept(submission, judge, officer):
    """Create an accepted judge assignment for the given submission."""
    assignment = AssignmentService.create_assignment(
        submission=submission,
        assignee=judge,
        role_type=AssignmentRoleType.JUDGE,
        assigned_by=officer,
    )
    AssignmentService.respond(assignment, judge, accept=True)
    return assignment


def _make_stage_config(step, required=1, reject_below=40, pass_above=70):
    config = StageEvaluationConfig.objects.create(
        workflow_step=step,
        required_reviewer_count=required,
        threshold_reject_below=Decimal(str(reject_below)),
        threshold_pass_above=Decimal(str(pass_above)),
        blind_scoring=True,
        allow_applicant_feedback=True,
    )
    StageCriterion.objects.create(
        stage_config=config,
        name="Innovation",
        description="How innovative is the idea?",
        max_score=Decimal("10"),
        min_score=Decimal("0"),
        weight=Decimal("1"),
        ordering=1,
    )
    StageCriterion.objects.create(
        stage_config=config,
        name="Feasibility",
        description="Can it be built?",
        max_score=Decimal("10"),
        min_score=Decimal("0"),
        weight=Decimal("1"),
        ordering=2,
    )
    return config



class StageEvalBaseTestCase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

        self.officer = _make_user("eval-officer@example.com", RoleType.INNOVATION_OFFICER, "Officer", "Eval")
        self.judge1 = _make_user("eval-judge1@example.com", RoleType.JUDGE, "Judge", "One")
        self.judge2 = _make_user("eval-judge2@example.com", RoleType.JUDGE, "Judge", "Two")
        self.innovator = _make_user("eval-innovator@example.com", RoleType.INNOVATOR, "Innovator", "Eval")

        self.program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon SE"})[0]
        self.program = _make_program(self.program_type, self.officer)

        form = SubmissionForm.objects.create(program=self.program, title="Form")
        self.field = SubmissionFormField.objects.create(
            form=form, label="Idea", key="idea",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True, ordering=1,
        )

        self.submission = _make_submission(self.innovator, self.program, self.field)
        _advance_to_step(self.submission, self.officer, steps=3)
        self.submission.refresh_from_db()

        self.step = getattr(
            getattr(self.submission, "workflow_instance", None),
            "current_step",
            None,
        )

    def _criteria_payload(self, innovation_score, feasibility_score, innovation_comment="", feasibility_comment=""):
        config = getattr(self.step, "evaluation_config", None)
        if not config:
            return []
        criteria = list(config.custom_criteria.order_by("ordering"))
        return [
            {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": innovation_score, "comment": innovation_comment},
            {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": feasibility_score, "comment": feasibility_comment},
        ]



class StageConfigCRUDTests(StageEvalBaseTestCase):

    def test_no_config_returns_null(self):
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/steps/{self.step.id}/evaluation-config/")
        self.assertEqual(r.status_code, 200)
        self.assertIsNone(r.data["data"])

    def test_create_config_via_put(self):
        self.client.force_authenticate(self.officer)
        r = self.client.put(
            f"/api/evaluations/steps/{self.step.id}/evaluation-config/",
            {
                "required_reviewer_count": 2,
                "aggregation_method": "average",
                "threshold_reject_below": "35.00",
                "threshold_pass_above": "75.00",
                "blind_scoring": True,
                "allow_applicant_feedback": True,
            },
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["required_reviewer_count"], 2)
        self.assertEqual(r.data["data"]["threshold_reject_below"], "35.00")

    def test_update_existing_config(self):
        config = _make_stage_config(self.step, required=1)
        self.client.force_authenticate(self.officer)
        r = self.client.put(
            f"/api/evaluations/steps/{self.step.id}/evaluation-config/",
            {"required_reviewer_count": 3, "aggregation_method": "average",
             "threshold_reject_below": "40.00", "threshold_pass_above": "70.00",
             "blind_scoring": False, "allow_applicant_feedback": True},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        config.refresh_from_db()
        self.assertEqual(config.required_reviewer_count, 3)
        self.assertFalse(config.blind_scoring)

    def test_judge_cannot_access_config(self):
        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/evaluations/steps/{self.step.id}/evaluation-config/")
        self.assertEqual(r.status_code, 403)

    def test_add_criterion(self):
        _make_stage_config(self.step, required=1)
        self.client.force_authenticate(self.officer)
        r = self.client.post(
            f"/api/evaluations/steps/{self.step.id}/evaluation-config/criteria/",
            {"name": "Market Potential", "max_score": "20", "min_score": "0", "weight": "2", "ordering": 3},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["data"]["name"], "Market Potential")

    def test_patch_criterion(self):
        config = _make_stage_config(self.step, required=1)
        criterion = config.custom_criteria.first()
        self.client.force_authenticate(self.officer)
        r = self.client.patch(
            f"/api/evaluations/steps/{self.step.id}/evaluation-config/criteria/{criterion.id}/",
            {"name": "Updated Name"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        criterion.refresh_from_db()
        self.assertEqual(criterion.name, "Updated Name")

    def test_delete_criterion(self):
        config = _make_stage_config(self.step, required=1)
        criterion = config.custom_criteria.first()
        criterion_id = criterion.id
        self.client.force_authenticate(self.officer)
        r = self.client.delete(
            f"/api/evaluations/steps/{self.step.id}/evaluation-config/criteria/{criterion_id}/",
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(StageCriterion.objects.filter(id=criterion_id).exists())



class ReviewCycleLifecycleTests(StageEvalBaseTestCase):

    def setUp(self):
        super().setUp()
        self.config = _make_stage_config(self.step, required=1)

    def test_get_or_open_creates_cycle(self):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        self.assertIsNotNone(cycle)
        self.assertEqual(cycle.cycle_number, 1)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_OPEN)
        self.assertEqual(cycle.stage_config, self.config)

    def test_get_or_open_returns_existing_open(self):
        cycle1 = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        cycle2 = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        self.assertEqual(cycle1.id, cycle2.id)
        self.assertEqual(ReviewCycle.objects.filter(submission=self.submission, workflow_step=self.step).count(), 1)

    def test_open_new_cycle_closes_existing(self):
        cycle1 = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        cycle2 = ReviewCycleService.open_new_cycle(submission=self.submission, workflow_step=self.step)
        cycle1.refresh_from_db()
        self.assertEqual(cycle1.status, ReviewCycle.STATUS_CANCELLED)
        self.assertEqual(cycle2.cycle_number, 2)
        self.assertEqual(cycle2.status, ReviewCycle.STATUS_OPEN)



class CycleScoringTests(StageEvalBaseTestCase):

    def setUp(self):
        super().setUp()
        self.config = _make_stage_config(self.step, required=1)
        _assign_and_accept(self.submission, self.judge1, self.officer)

    def _get_cycle(self):
        return ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)

    def test_save_draft_scores_via_api(self):
        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["cycle_number"], 1)

        payload = {"scores": self._criteria_payload(7, 8), "overall_comment": "Looking good"}
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["status"], ScoreSheetStatus.DRAFT)

    def test_score_out_of_range_rejected(self):
        cycle = self._get_cycle()
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge1,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("15"), "comment": ""},
                    {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                ],
            )

    def test_comment_required_below_threshold(self):
        criterion = self.config.custom_criteria.order_by("ordering").first()
        criterion.comment_required_below = Decimal("5")
        criterion.save()
        cycle = self._get_cycle()
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge1,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("3"), "comment": ""},
                    {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                ],
            )

    def test_submit_locks_scorecard(self):
        cycle = self._get_cycle()
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=self.judge1,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("8"), "comment": "Great"},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("7"), "comment": "Good"},
            ],
        )
        sheet = EvaluationService.submit_cycle_scores(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertEqual(sheet.status, ScoreSheetStatus.LOCKED)
        self.assertTrue(sheet.is_final)
        self.assertIsNotNone(sheet.submitted_at)

    def test_resubmit_after_locked_raises(self):
        cycle = self._get_cycle()
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=self.judge1,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("8"), "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("7"), "comment": ""},
            ],
        )
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=self.judge1, review_cycle=cycle)
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge1,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                    {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                ],
            )



class ReviewerBlindnessTests(StageEvalBaseTestCase):

    def setUp(self):
        super().setUp()
        self.config = _make_stage_config(self.step, required=2)
        self.config.blind_scoring = True
        self.config.save()
        _assign_and_accept(self.submission, self.judge1, self.officer)
        _assign_and_accept(self.submission, self.judge2, self.officer)

    def _score_criteria(self, judge, scores):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        return EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=judge,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal(str(scores[0])), "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal(str(scores[1])), "comment": ""},
            ],
        )

    def test_judge1_cannot_see_peer_scores_before_submitting(self):
        self._score_criteria(self.judge2, [8, 9])
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertFalse(data["peer_scores_available"])
        self.assertIsNone(data["aggregate"])

    def test_judge1_can_see_aggregate_after_own_submission(self):
        self._score_criteria(self.judge1, [8, 9])
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=self.judge1, review_cycle=cycle)
        cycle.refresh_from_db()
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertTrue(data["peer_scores_available"])

    def test_blind_scoring_off_shows_aggregate_immediately(self):
        self.config.blind_scoring = False
        self.config.save()
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertTrue(data["peer_scores_available"])



class AutoDecisionThresholdTests(StageEvalBaseTestCase):
    """
    Criteria: max_score=10 each (2 criteria → max total = 20).
    effective_max_score = 20.
    reject_below=40% → 8 points, pass_above=70% → 14 points.
    """

    def setUp(self):
        super().setUp()
        self.config = _make_stage_config(self.step, required=1, reject_below=40, pass_above=70)
        _assign_and_accept(self.submission, self.judge1, self.officer)

    def _full_cycle_with_scores(self, score1, score2):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=self.judge1,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal(str(score1)), "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal(str(score2)), "comment": ""},
            ],
        )
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=self.judge1, review_cycle=cycle)
        cycle.refresh_from_db()
        return cycle

    def test_high_scores_trigger_pass(self):
        cycle = self._full_cycle_with_scores(8, 8)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_PASS)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)
        self.assertAlmostEqual(float(cycle.aggregate_pct), 80.0, places=1)

    def test_low_scores_trigger_reject(self):
        cycle = self._full_cycle_with_scores(3, 3)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_REJECT)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)
        self.assertAlmostEqual(float(cycle.aggregate_pct), 30.0, places=1)

    def test_mid_scores_trigger_return(self):
        cycle = self._full_cycle_with_scores(5, 5)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_RETURN)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)
        self.assertAlmostEqual(float(cycle.aggregate_pct), 50.0, places=1)

    def test_aggregate_not_triggered_before_required_count(self):
        self.config.required_reviewer_count = 2
        self.config.save()
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=self.judge1,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("9"), "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("9"), "comment": ""},
            ],
        )
        cycle.refresh_from_db()
        self.assertEqual(cycle.status, ReviewCycle.STATUS_OPEN)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_PENDING)



class StageEvalAPIIntegrationTests(StageEvalBaseTestCase):

    def setUp(self):
        super().setUp()
        self.config = _make_stage_config(self.step, required=1)
        _assign_and_accept(self.submission, self.judge1, self.officer)

    def test_full_cycle_via_api(self):
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        scores_payload = {
            "scores": [
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": "8.0", "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": "9.0", "comment": ""},
            ],
            "overall_comment": "Solid work",
        }

        self.client.force_authenticate(self.judge1)

        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["cycle_number"], 1)

        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", scores_payload, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["status"], ScoreSheetStatus.DRAFT)

        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/submit/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["status"], ScoreSheetStatus.LOCKED)

    def test_officer_can_list_cycles(self):
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycles/")
        self.assertEqual(r.status_code, 200)

    def test_officer_can_view_cycle_summary(self):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission, judge=self.judge1, review_cycle=cycle,
            scores=[
                {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("7"), "comment": ""},
                {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("8"), "comment": ""},
            ],
        )
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=self.judge1, review_cycle=cycle)

        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycles/{cycle.id}/summary/")
        self.assertEqual(r.status_code, 200)
        data = r.data["data"]
        self.assertEqual(len(data["scorecards"]), 1)
        self.assertIn("aggregate", data)
        self.assertIn("criteria", data)

    def test_judge_without_assignment_cannot_score(self):
        self.client.force_authenticate(self.judge2)
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission, judge=self.judge2, review_cycle=cycle,
                scores=[
                    {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                    {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": Decimal("5"), "comment": ""},
                ],
            )

    def test_criteria_endpoint_listed_correctly(self):
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/steps/{self.step.id}/evaluation-config/criteria/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["data"]), 2)
        names = {c["name"] for c in r.data["data"]}
        self.assertIn("Innovation", names)
        self.assertIn("Feasibility", names)
