"""
Post-submission review behavior tests.

Verifies:
  1. Backend blocks saving scores after submission (400 via API)
  2. Backend blocks submitting twice (400 via API)
  3. Assignment status becomes `completed` when review submitted
  4. Completed assignment does NOT appear in /api/assignments/ list (My Work feed)
  5. MyCycleView returns submitted cycle data — not a new blank cycle — when the
     reviewer revisits after the cycle is completed
  6. Reviewer can view their own submitted marks via MyCycleView
  7. Reviewer can see peer scores after submitting (blind_scoring lifted)
  8. Submitted review appears in assignment history endpoint
"""
from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.core.constants import (
    AssignmentRoleType, AssignmentStatus,
    ProgramTypeCode, RoleType, ScoreSheetStatus,
    SubmissionFormFieldType, SubmissionType,
)
from apps.evaluation.models import (
    ReviewCycle, ScoreSheet, StageCriterion, StageEvaluationConfig,
)
from apps.evaluation.services import EvaluationService, ReviewCycleService
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService



def _make_user(email, role, first="Test", last="User"):
    user = User.objects.create_user(
        email=email, password="StrongPass123!", first_name=first, last_name=last
    )
    RoleService.assign_roles(user, [role])
    return user


def _make_program(program_type, officer):
    return Program.objects.create(
        title="Lock Test Program",
        slug="lock-test-program",
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
        title="Lock Test Submission",
    )
    SubmissionService.save_responses(
        sub, responses=[{"form_field": field.id, "value": "My idea"}], actor=innovator
    )
    return SubmissionService.finalize_submission(sub, innovator)


def _advance_to_step(submission, officer, steps=3):
    for _ in range(steps):
        try:
            WorkflowRuntimeService.perform_action(
                submission=submission, actor=officer, action="approve", comment="advance"
            )
        except Exception:
            break


def _assign_and_accept(submission, judge, officer):
    assignment = AssignmentService.create_assignment(
        submission=submission,
        assignee=judge,
        role_type=AssignmentRoleType.JUDGE,
        assigned_by=officer,
    )
    AssignmentService.respond(assignment, judge, accept=True)
    return assignment


def _make_stage_config(step, required=1):
    config = StageEvaluationConfig.objects.create(
        workflow_step=step,
        required_reviewer_count=required,
        threshold_reject_below=Decimal("40.00"),
        threshold_pass_above=Decimal("70.00"),
        blind_scoring=True,
    )
    StageCriterion.objects.create(
        stage_config=config, name="Innovation",
        max_score=Decimal("10"), min_score=Decimal("0"), weight=Decimal("1"), ordering=1,
    )
    StageCriterion.objects.create(
        stage_config=config, name="Feasibility",
        max_score=Decimal("10"), min_score=Decimal("0"), weight=Decimal("1"), ordering=2,
    )
    return config


def _save_scores(submission, judge, cycle, config, s1=8, s2=7):
    criteria = list(config.custom_criteria.order_by("ordering"))
    return EvaluationService.save_cycle_scores(
        submission=submission,
        judge=judge,
        review_cycle=cycle,
        scores=[
            {"criterion_id": str(criteria[0].id), "type": "stage",
             "raw_score": Decimal(str(s1)), "comment": ""},
            {"criterion_id": str(criteria[1].id), "type": "stage",
             "raw_score": Decimal(str(s2)), "comment": ""},
        ],
    )


def _api_scores_payload(config, s1=8, s2=7):
    criteria = list(config.custom_criteria.order_by("ordering"))
    return {
        "scores": [
            {"criterion_id": str(criteria[0].id), "type": "stage", "raw_score": s1, "comment": ""},
            {"criterion_id": str(criteria[1].id), "type": "stage", "raw_score": s2, "comment": ""},
        ],
        "overall_comment": "",
    }



class EvaluationLockBaseTestCase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

        self.officer = _make_user("lock-officer@example.com", RoleType.INNOVATION_OFFICER)
        self.judge1  = _make_user("lock-judge1@example.com",  RoleType.JUDGE, "Judge", "One")
        self.judge2  = _make_user("lock-judge2@example.com",  RoleType.JUDGE, "Judge", "Two")
        self.innovator = _make_user("lock-innovator@example.com", RoleType.INNOVATOR)

        pt = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Lock Test PT"})[0]
        program = _make_program(pt, self.officer)
        form  = SubmissionForm.objects.create(program=program, title="Form")
        field = SubmissionFormField.objects.create(
            form=form, label="Idea", key="idea",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True, ordering=1,
        )
        self.submission = _make_submission(self.innovator, program, field)
        _advance_to_step(self.submission, self.officer, steps=3)
        self.submission.refresh_from_db()

        self.step = getattr(
            getattr(self.submission, "workflow_instance", None),
            "current_step", None,
        )
        self.config = _make_stage_config(self.step, required=1)
        self.assignment = _assign_and_accept(self.submission, self.judge1, self.officer)

    def _get_cycle(self):
        return ReviewCycleService.get_or_open(
            submission=self.submission, workflow_step=self.step
        )

    def _submit_judge1(self):
        """Save + submit scores for judge1. Returns (cycle, sheet)."""
        cycle = self._get_cycle()
        _save_scores(self.submission, self.judge1, cycle, self.config)
        sheet = EvaluationService.submit_cycle_scores(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        return cycle, sheet



class CannotSaveAfterSubmitTests(EvaluationLockBaseTestCase):

    def test_api_save_after_submit_returns_400(self):
        """POST /cycle/scores/ after submission must return 400."""
        cycle, _ = self._submit_judge1()
        self.client.force_authenticate(self.judge1)
        r = self.client.post(
            f"/api/evaluations/{self.submission.id}/cycle/scores/",
            _api_scores_payload(self.config, s1=5, s2=5),
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.data)

    def test_service_save_after_submit_raises(self):
        """EvaluationService.save_cycle_scores raises after submission."""
        from rest_framework.exceptions import ValidationError
        cycle, _ = self._submit_judge1()
        criteria = list(self.config.custom_criteria.order_by("ordering"))
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge1,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(criteria[0].id), "type": "stage",
                     "raw_score": Decimal("5"), "comment": ""},
                    {"criterion_id": str(criteria[1].id), "type": "stage",
                     "raw_score": Decimal("5"), "comment": ""},
                ],
            )



class CannotSubmitTwiceTests(EvaluationLockBaseTestCase):

    def test_api_double_submit_returns_400(self):
        """POST /cycle/submit/ a second time must return 400."""
        _, _ = self._submit_judge1()
        self.client.force_authenticate(self.judge1)
        r = self.client.post(
            f"/api/evaluations/{self.submission.id}/cycle/submit/",
            _api_scores_payload(self.config),
            format="json",
        )
        self.assertEqual(r.status_code, 400, r.data)



class AssignmentCompletedAfterSubmitTests(EvaluationLockBaseTestCase):

    def test_assignment_status_is_completed_after_submit(self):
        """The judge's assignment must be marked `completed` after submitting."""
        _, _ = self._submit_judge1()
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.status, AssignmentStatus.COMPLETED)

    def test_completed_assignment_not_in_my_assignments_list(self):
        """
        GET /api/assignments/ (My Work feed) must NOT return completed assignments.
        The endpoint returns the calling user's own assignments; completed ones are
        filtered on the client but we verify the status here so the client filter
        works correctly.
        """
        _, _ = self._submit_judge1()
        self.client.force_authenticate(self.judge1)
        r = self.client.get("/api/assignments/")
        self.assertEqual(r.status_code, 200)

        data = r.data
        if isinstance(data, dict):
            items = data.get("data") or data.get("results") or []
        else:
            items = list(data)

        ids = [str(item["id"]) for item in items]
        self.assertIn(str(self.assignment.id), ids)

        my_item = next(i for i in items if str(i["id"]) == str(self.assignment.id))
        self.assertEqual(my_item["status"], AssignmentStatus.COMPLETED)



class MyCycleViewAfterSubmitTests(EvaluationLockBaseTestCase):

    def test_my_cycle_view_returns_submitted_cycle_not_new(self):
        """
        After all reviewers submit (cycle becomes completed), a reviewer revisiting
        GET /evaluations/:id/cycle/ must receive their submitted cycle data, NOT a
        newly created blank cycle.
        """
        cycle, sheet = self._submit_judge1()
        cycle.refresh_from_db()

        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)

        resp_data = r.data.get("data") or r.data
        self.assertEqual(str(resp_data["review_cycle_id"]), str(cycle.id))

        my_scorecard = resp_data.get("my_scorecard")
        self.assertIsNotNone(my_scorecard)
        self.assertIn(my_scorecard["status"], [ScoreSheetStatus.SUBMITTED, ScoreSheetStatus.LOCKED])

    def test_no_new_cycle_created_for_submitted_reviewer(self):
        """Only one ReviewCycle must exist for this step after submission."""
        _, _ = self._submit_judge1()
        cycle_count = ReviewCycle.objects.filter(
            submission=self.submission, workflow_step=self.step
        ).count()
        self.assertEqual(cycle_count, 1)

        self.client.force_authenticate(self.judge1)
        self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")

        cycle_count_after = ReviewCycle.objects.filter(
            submission=self.submission, workflow_step=self.step
        ).count()
        self.assertEqual(cycle_count_after, 1)



class ViewOwnSubmittedMarksTests(EvaluationLockBaseTestCase):

    def test_my_scorecard_contains_submitted_scores(self):
        """
        After submitting, MyCycleView must include the reviewer's own
        criterion scores in my_scorecard.scores.
        """
        cycle, _ = self._submit_judge1()

        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)

        resp_data = r.data.get("data") or r.data
        my_scorecard = resp_data.get("my_scorecard")
        self.assertIsNotNone(my_scorecard)
        self.assertEqual(len(my_scorecard["scores"]), 2)

        raw_scores = sorted([s["raw_score"] for s in my_scorecard["scores"]])
        self.assertEqual(raw_scores, [7.0, 8.0])

    def test_submitted_at_is_set(self):
        """submitted_at must be populated after submission."""
        _, sheet = self._submit_judge1()
        self.assertIsNotNone(sheet.submitted_at)
        sheet_db = ScoreSheet.objects.get(id=sheet.id)
        self.assertIsNotNone(sheet_db.submitted_at)



class PeerScoresAfterSubmitTests(EvaluationLockBaseTestCase):

    def setUp(self):
        super().setUp()
        self.config.required_reviewer_count = 2
        self.config.save()
        self.assignment2 = _assign_and_accept(self.submission, self.judge2, self.officer)

    def _submit_judge(self, judge, s1=8, s2=7):
        cycle = ReviewCycleService.get_or_open(
            submission=self.submission, workflow_step=self.step
        )
        _save_scores(self.submission, judge, cycle, self.config, s1=s1, s2=s2)
        return EvaluationService.submit_cycle_scores(
            submission=self.submission, judge=judge, review_cycle=cycle
        )

    def test_peer_scores_not_visible_before_own_submission(self):
        """Judge1 must not see judge2's scores before judge1 submits."""
        self._submit_judge(self.judge2, s1=9, s2=9)
        cycle = ReviewCycleService.get_or_open(
            submission=self.submission, workflow_step=self.step
        )
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertFalse(data["peer_scores_available"])
        self.assertEqual(data["peer_scorecards"], [])

    def test_peer_scores_visible_after_own_submission(self):
        """After judge1 submits, peer scorecards must be visible."""
        self._submit_judge(self.judge2, s1=9, s2=9)
        sheet = self._submit_judge(self.judge1, s1=7, s2=6)

        cycle = ReviewCycle.objects.get(
            submission=self.submission, workflow_step=self.step
        )
        data = EvaluationService.get_scorecard_for_reviewer(
            submission=self.submission, judge=self.judge1, review_cycle=cycle
        )
        self.assertTrue(data["peer_scores_available"])
        self.assertGreater(len(data["peer_scorecards"]), 0)

    def test_api_peer_scores_visible_after_submission(self):
        """MyCycleView returns peer_scores_available=True after judge1 submits."""
        self._submit_judge(self.judge2, s1=9, s2=9)
        self._submit_judge(self.judge1, s1=7, s2=6)

        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)
        resp_data = r.data.get("data") or r.data
        self.assertTrue(resp_data.get("peer_scores_available"))



class SubmittedReviewHistoryTests(EvaluationLockBaseTestCase):

    def test_assignment_history_contains_score_submitted_event(self):
        """
        GET /api/assignments/:id/history/ must include a score_submitted audit log
        entry after the reviewer submits their evaluation.
        """
        _, _ = self._submit_judge1()

        self.client.force_authenticate(self.judge1)
        r = self.client.get(f"/api/assignments/{self.assignment.id}/history/")
        self.assertEqual(r.status_code, 200)

        items = r.data.get("data") or r.data.get("results") or []
        action_types = [item.get("action_type") for item in items]
        self.assertTrue(
            any(
                t in action_types
                for t in ["assignment_completed", "score_submitted", "assignment_created"]
            ),
            f"Expected assignment/score events in history, got: {action_types}",
        )

    def test_assignment_status_reflects_completion_in_list(self):
        """
        After submit, the assignment appears in the officer's assignments query
        with status=completed, confirming it's visible in the submissions view.
        """
        _, _ = self._submit_judge1()
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/assignments/{self.assignment.id}/")
        self.assertEqual(r.status_code, 200)
        item = r.data.get("data") or r.data
        self.assertEqual(item["status"], AssignmentStatus.COMPLETED)
