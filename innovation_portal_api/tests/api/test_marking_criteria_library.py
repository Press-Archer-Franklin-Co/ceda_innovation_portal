"""
Tests for the MarkingCriteria library and related features:
  - MarkingCriteria CRUD API
  - MarkingCriteriaItem CRUD API
  - Reusable criteria linked to multiple workflow steps
  - criteria_mode / effective_criteria resolution order
  - Officer scoring without judge assignment
  - Reviewer/specialist scoring with accepted assignment
  - Library criteria items used in scoring flow
  - SubmissionReviewFeedbackView (allow_applicant_feedback flag)
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
from apps.core.constants import (
    AssignmentRoleType,
    AssignmentStatus,
    ProgramTypeCode,
    RoleType,
    ScoreSheetStatus,
    SubmissionFormFieldType,
    SubmissionType,
)
from apps.evaluation.models import (
    MarkingCriteria,
    MarkingCriteriaItem,
    ReviewCycle,
    ScoreSheet,
    StageCriterion,
    StageEvaluationConfig,
)
from apps.evaluation.services import EvaluationService, ReviewCycleService
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
        title="Criteria Library Program",
        slug="criteria-library-program",
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
        title="Criteria Library Submission",
    )
    SubmissionService.save_responses(sub, responses=[{"form_field": field.id, "value": "My idea"}], actor=innovator)
    return SubmissionService.finalize_submission(sub, innovator)


def _advance_to_step(submission, officer, steps=3):
    for _ in range(steps):
        try:
            WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="advance")
        except Exception:
            break


def _assign_and_accept(submission, user, officer, role_type=AssignmentRoleType.JUDGE):
    assignment = AssignmentService.create_assignment(
        submission=submission,
        assignee=user,
        role_type=role_type,
        assigned_by=officer,
    )
    AssignmentService.respond(assignment, user, accept=True)
    return assignment


def _make_library_criteria(title="Evaluation Criteria", officer=None):
    """Create a MarkingCriteria with two items."""
    criteria = MarkingCriteria.objects.create(
        title=title,
        description="Shared evaluation criteria",
        is_active=True,
        created_by=officer,
    )
    MarkingCriteriaItem.objects.create(
        criteria=criteria,
        name="Innovation",
        description="How innovative?",
        max_score=Decimal("10"),
        min_score=Decimal("0"),
        weight=Decimal("1"),
        ordering=1,
    )
    MarkingCriteriaItem.objects.create(
        criteria=criteria,
        name="Feasibility",
        description="Can it be built?",
        max_score=Decimal("10"),
        min_score=Decimal("0"),
        weight=Decimal("1"),
        ordering=2,
    )
    return criteria


def _make_stage_config_with_library(step, criteria, required=1, reject_below=40, pass_above=70):
    return StageEvaluationConfig.objects.create(
        workflow_step=step,
        marking_criteria=criteria,
        required_reviewer_count=required,
        threshold_reject_below=Decimal(str(reject_below)),
        threshold_pass_above=Decimal(str(pass_above)),
        blind_scoring=False,
        allow_applicant_feedback=True,
    )



class LibraryBaseTestCase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

        self.admin = _make_user("lib-admin@example.com", RoleType.ADMINISTRATOR, "Admin", "User")
        self.officer = _make_user("lib-officer@example.com", RoleType.INNOVATION_OFFICER, "Officer", "User")
        self.judge = _make_user("lib-judge@example.com", RoleType.JUDGE, "Judge", "User")
        self.innovator = _make_user("lib-innovator@example.com", RoleType.INNOVATOR, "Innovator", "User")

        self.program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon LC"})[0]
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



class MarkingCriteriaCRUDTests(LibraryBaseTestCase):

    def test_admin_can_list_criteria(self):
        _make_library_criteria("Criteria A", self.admin)
        _make_library_criteria("Criteria B", self.admin)
        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/evaluations/marking-criteria/")
        self.assertEqual(r.status_code, 200)
        self.assertGreaterEqual(len(r.data["data"]), 2)

    def test_officer_can_list_criteria(self):
        self.client.force_authenticate(self.officer)
        r = self.client.get("/api/evaluations/marking-criteria/")
        self.assertEqual(r.status_code, 200)

    def test_judge_cannot_list_criteria(self):
        self.client.force_authenticate(self.judge)
        r = self.client.get("/api/evaluations/marking-criteria/")
        self.assertEqual(r.status_code, 403)

    def test_admin_can_create_criteria(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(
            "/api/evaluations/marking-criteria/",
            {"title": "New Library Criteria", "description": "Test description", "is_active": True},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["data"]["title"], "New Library Criteria")

    def test_officer_cannot_create_criteria(self):
        """Only admins may create library criteria."""
        self.client.force_authenticate(self.officer)
        r = self.client.post(
            "/api/evaluations/marking-criteria/",
            {"title": "Officer Created", "description": "", "is_active": True},
            format="json",
        )
        self.assertEqual(r.status_code, 403)

    def test_admin_can_update_criteria(self):
        criteria = _make_library_criteria("Original Title", self.admin)
        self.client.force_authenticate(self.admin)
        r = self.client.patch(
            f"/api/evaluations/marking-criteria/{criteria.id}/",
            {"title": "Updated Title"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        criteria.refresh_from_db()
        self.assertEqual(criteria.title, "Updated Title")

    def test_admin_can_delete_unused_criteria(self):
        criteria = _make_library_criteria("To Delete", self.admin)
        criteria_id = criteria.id
        self.client.force_authenticate(self.admin)
        r = self.client.delete(f"/api/evaluations/marking-criteria/{criteria_id}/")
        self.assertEqual(r.status_code, 200)
        self.assertFalse(MarkingCriteria.objects.filter(id=criteria_id).exists())

    def test_delete_in_use_criteria_soft_deletes(self):
        """Criteria linked to a step should be soft-deleted (is_active=False) not hard-deleted."""
        criteria = _make_library_criteria("In Use", self.admin)
        _make_stage_config_with_library(self.step, criteria)

        self.client.force_authenticate(self.admin)
        r = self.client.delete(f"/api/evaluations/marking-criteria/{criteria.id}/")
        self.assertEqual(r.status_code, 200)
        criteria.refresh_from_db()
        self.assertFalse(criteria.is_active)

    def test_active_only_filter(self):
        _make_library_criteria("Active", self.admin)
        inactive = _make_library_criteria("Inactive", self.admin)
        inactive.is_active = False
        inactive.save()

        self.client.force_authenticate(self.admin)
        r = self.client.get("/api/evaluations/marking-criteria/?active_only=true")
        self.assertEqual(r.status_code, 200)
        titles = [c["title"] for c in r.data["data"]]
        self.assertIn("Active", titles)
        self.assertNotIn("Inactive", titles)

    def test_get_criteria_includes_items(self):
        criteria = _make_library_criteria("With Items", self.admin)
        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/evaluations/marking-criteria/{criteria.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(len(r.data["data"]["items"]), 2)

    def test_get_criteria_includes_step_count(self):
        criteria = _make_library_criteria("Count Test", self.admin)
        _make_stage_config_with_library(self.step, criteria)
        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/evaluations/marking-criteria/{criteria.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["step_count"], 1)



class MarkingCriteriaItemCRUDTests(LibraryBaseTestCase):

    def setUp(self):
        super().setUp()
        self.criteria = _make_library_criteria("Item Test Criteria", self.admin)

    def test_admin_can_add_item(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(
            f"/api/evaluations/marking-criteria/{self.criteria.id}/items/",
            {"name": "Market Fit", "max_score": "15", "min_score": "0", "weight": "1.5", "ordering": 3},
            format="json",
        )
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["data"]["name"], "Market Fit")

    def test_admin_can_update_item(self):
        item = self.criteria.items.first()
        self.client.force_authenticate(self.admin)
        r = self.client.patch(
            f"/api/evaluations/marking-criteria/{self.criteria.id}/items/{item.id}/",
            {"name": "Renamed Innovation", "max_score": "20"},
            format="json",
        )
        self.assertEqual(r.status_code, 200)
        item.refresh_from_db()
        self.assertEqual(item.name, "Renamed Innovation")
        self.assertEqual(item.max_score, Decimal("20"))

    def test_admin_can_delete_item(self):
        item = self.criteria.items.first()
        item_id = item.id
        self.client.force_authenticate(self.admin)
        r = self.client.delete(
            f"/api/evaluations/marking-criteria/{self.criteria.id}/items/{item_id}/",
        )
        self.assertEqual(r.status_code, 200)
        self.assertFalse(MarkingCriteriaItem.objects.filter(id=item_id).exists())

    def test_total_max_score_aggregates_items(self):
        self.assertEqual(self.criteria.total_max_score, Decimal("20"))

    def test_total_max_score_after_add(self):
        MarkingCriteriaItem.objects.create(
            criteria=self.criteria, name="Extra", max_score=Decimal("5"),
            min_score=Decimal("0"), weight=Decimal("1"), ordering=3,
        )
        self.criteria.refresh_from_db()
        self.assertEqual(self.criteria.total_max_score, Decimal("25"))



class CriteriaModeResolutionTests(LibraryBaseTestCase):

    def test_library_mode_when_marking_criteria_linked(self):
        criteria = _make_library_criteria("Lib", self.admin)
        config = _make_stage_config_with_library(self.step, criteria)
        self.assertEqual(config.criteria_mode, "library")

    def test_custom_mode_when_only_stage_criteria(self):
        config = StageEvaluationConfig.objects.create(
            workflow_step=self.step,
            required_reviewer_count=1,
            threshold_reject_below=Decimal("40"),
            threshold_pass_above=Decimal("70"),
        )
        StageCriterion.objects.create(
            stage_config=config, name="Innovation", max_score=Decimal("10"),
            min_score=Decimal("0"), weight=Decimal("1"), ordering=1,
        )
        self.assertEqual(config.criteria_mode, "custom")

    def test_none_mode_when_no_criteria(self):
        config = StageEvaluationConfig.objects.create(
            workflow_step=self.step,
            required_reviewer_count=1,
            threshold_reject_below=Decimal("40"),
            threshold_pass_above=Decimal("70"),
        )
        self.assertEqual(config.criteria_mode, "none")

    def test_library_takes_precedence_over_custom(self):
        criteria = _make_library_criteria("Lib Priority", self.admin)
        config = StageEvaluationConfig.objects.create(
            workflow_step=self.step,
            marking_criteria=criteria,
            required_reviewer_count=1,
            threshold_reject_below=Decimal("40"),
            threshold_pass_above=Decimal("70"),
        )
        StageCriterion.objects.create(
            stage_config=config, name="Custom", max_score=Decimal("5"),
            min_score=Decimal("0"), weight=Decimal("1"), ordering=1,
        )
        effective = config.effective_criteria
        names = [c.name for c in effective]
        self.assertIn("Innovation", names)
        self.assertNotIn("Custom", names)
        self.assertEqual(config.criteria_mode, "library")

    def test_effective_criteria_returns_library_items(self):
        criteria = _make_library_criteria("Items Check", self.admin)
        config = _make_stage_config_with_library(self.step, criteria)
        effective = config.effective_criteria
        self.assertEqual(len(list(effective)), 2)



class CriteriaReuseTests(LibraryBaseTestCase):

    def test_same_criteria_can_link_to_multiple_configs(self):
        """One MarkingCriteria entity can be linked to more than one StageEvaluationConfig."""
        from apps.workflow.models import WorkflowDefinition, WorkflowStep as WFStep

        criteria = _make_library_criteria("Shared", self.admin)

        config1 = _make_stage_config_with_library(self.step, criteria)

        wf_instance = getattr(self.submission, "workflow_instance", None)
        if wf_instance:
            all_steps = WFStep.objects.filter(
                workflow_definition=wf_instance.workflow_definition
            ).exclude(id=self.step.id)
            step2 = all_steps.first()
        else:
            step2 = None

        if step2 is None:
            self.assertEqual(config1.marking_criteria_id, criteria.id)
            self.assertEqual(criteria.stage_configs.count(), 1)
            return

        config2 = StageEvaluationConfig.objects.create(
            workflow_step=step2,
            marking_criteria=criteria,
            required_reviewer_count=1,
            threshold_reject_below=Decimal("40"),
            threshold_pass_above=Decimal("70"),
        )

        self.assertEqual(config1.marking_criteria_id, config2.marking_criteria_id)
        self.assertEqual(criteria.stage_configs.count(), 2)

    def test_step_count_in_api_reflects_reuse(self):
        from apps.workflow.models import WorkflowStep as WFStep

        criteria = _make_library_criteria("Reuse Count", self.admin)
        _make_stage_config_with_library(self.step, criteria)

        wf_instance = getattr(self.submission, "workflow_instance", None)
        if wf_instance:
            step2 = WFStep.objects.filter(
                workflow_definition=wf_instance.workflow_definition
            ).exclude(id=self.step.id).first()
        else:
            step2 = None

        if step2:
            StageEvaluationConfig.objects.create(
                workflow_step=step2,
                marking_criteria=criteria,
                required_reviewer_count=1,
                threshold_reject_below=Decimal("40"),
                threshold_pass_above=Decimal("70"),
            )
            expected_count = 2
        else:
            expected_count = 1

        self.client.force_authenticate(self.admin)
        r = self.client.get(f"/api/evaluations/marking-criteria/{criteria.id}/")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["step_count"], expected_count)



class OfficerScoringTests(LibraryBaseTestCase):

    def setUp(self):
        super().setUp()
        self.criteria = _make_library_criteria("Officer Scoring Criteria", self.admin)
        self.config = _make_stage_config_with_library(self.step, self.criteria, required=1)

    def _library_scores_payload(self):
        items = list(self.criteria.items.order_by("ordering"))
        return [
            {"criterion_id": str(items[0].id), "type": "library", "raw_score": 8, "comment": ""},
            {"criterion_id": str(items[1].id), "type": "library", "raw_score": 7, "comment": ""},
        ]

    def test_officer_can_score_without_assignment(self):
        """Officers should be able to open and score a cycle with no assignment required."""
        self.client.force_authenticate(self.officer)

        r = self.client.get(f"/api/evaluations/{self.submission.id}/cycle/")
        self.assertEqual(r.status_code, 200)

        payload = {"scores": self._library_scores_payload(), "overall_comment": "Officer review"}
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["status"], ScoreSheetStatus.DRAFT)

    def test_officer_can_submit_scores(self):
        self.client.force_authenticate(self.officer)
        payload = {"scores": self._library_scores_payload(), "overall_comment": ""}
        self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/submit/", {}, format="json")
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data["data"]["status"], ScoreSheetStatus.LOCKED)

    def test_admin_can_score_without_assignment(self):
        self.client.force_authenticate(self.admin)
        payload = {"scores": self._library_scores_payload(), "overall_comment": "Admin review"}
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        self.assertEqual(r.status_code, 200)



def _assign_and_accept_direct(submission, user, officer, role_type, step):
    """Create an accepted assignment directly (bypasses step.assignment_role check)."""
    assignment = Assignment.objects.create(
        submission=submission,
        workflow_step=step,
        assignee=user,
        role_type=role_type,
        assigned_by=officer,
    )
    AssignmentService.respond(assignment, user, accept=True)
    return assignment


class ReviewerSpecialistScoringTests(LibraryBaseTestCase):

    def setUp(self):
        super().setUp()
        self.criteria = _make_library_criteria("Reviewer Scoring Criteria", self.admin)
        self.config = _make_stage_config_with_library(self.step, self.criteria, required=1)
        self.reviewer = _make_user("lib-reviewer@example.com", RoleType.JUDGE, "Reviewer", "User")
        self.specialist = _make_user("lib-specialist@example.com", RoleType.JUDGE, "Specialist", "User")

    def _library_scores_payload(self):
        items = list(self.criteria.items.order_by("ordering"))
        return [
            {"criterion_id": str(items[0].id), "type": "library", "raw_score": 7, "comment": ""},
            {"criterion_id": str(items[1].id), "type": "library", "raw_score": 6, "comment": ""},
        ]

    def test_reviewer_with_accepted_assignment_can_score(self):
        _assign_and_accept_direct(self.submission, self.reviewer, self.officer, AssignmentRoleType.REVIEWER, self.step)
        self.client.force_authenticate(self.reviewer)
        payload = {"scores": self._library_scores_payload(), "overall_comment": "Reviewer notes"}
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        self.assertEqual(r.status_code, 200)

    def test_specialist_with_accepted_assignment_can_score(self):
        _assign_and_accept_direct(self.submission, self.specialist, self.officer, AssignmentRoleType.SPECIALIST, self.step)
        self.client.force_authenticate(self.specialist)
        payload = {"scores": self._library_scores_payload(), "overall_comment": "Specialist notes"}
        r = self.client.post(f"/api/evaluations/{self.submission.id}/cycle/scores/", payload, format="json")
        self.assertEqual(r.status_code, 200)

    def test_judge_without_assignment_cannot_score_library_step(self):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        items = list(self.criteria.items.order_by("ordering"))
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(items[0].id), "type": "library", "raw_score": Decimal("5"), "comment": ""},
                    {"criterion_id": str(items[1].id), "type": "library", "raw_score": Decimal("5"), "comment": ""},
                ],
            )



class LibraryCriteriaScoringFlowTests(LibraryBaseTestCase):

    def setUp(self):
        super().setUp()
        self.criteria = _make_library_criteria("E2E Scoring Criteria", self.admin)
        self.config = _make_stage_config_with_library(
            self.step, self.criteria, required=1, reject_below=40, pass_above=70
        )
        _assign_and_accept(self.submission, self.judge, self.officer)

    def _score_and_submit(self, score1, score2, user=None):
        user = user or self.judge
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        items = list(self.criteria.items.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=user,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(items[0].id), "type": "library", "raw_score": Decimal(str(score1)), "comment": "Good"},
                {"criterion_id": str(items[1].id), "type": "library", "raw_score": Decimal(str(score2)), "comment": "Fair"},
            ],
        )
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=user, review_cycle=cycle)
        cycle.refresh_from_db()
        return cycle

    def test_library_criteria_high_score_triggers_pass(self):
        cycle = self._score_and_submit(8, 8)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_PASS)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)

    def test_library_criteria_low_score_triggers_reject(self):
        cycle = self._score_and_submit(3, 3)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_REJECT)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)

    def test_library_criteria_mid_score_triggers_return(self):
        cycle = self._score_and_submit(5, 5)
        self.assertEqual(cycle.outcome, ReviewCycle.OUTCOME_RETURN)
        self.assertEqual(cycle.status, ReviewCycle.STATUS_COMPLETED)

    def test_effective_max_score_derived_from_library_items(self):
        self.assertEqual(self.config.effective_max_score, Decimal("20"))

    def test_score_out_of_library_item_range_rejected(self):
        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        items = list(self.criteria.items.order_by("ordering"))
        with self.assertRaises(ValidationError):
            EvaluationService.save_cycle_scores(
                submission=self.submission,
                judge=self.judge,
                review_cycle=cycle,
                scores=[
                    {"criterion_id": str(items[0].id), "type": "library", "raw_score": Decimal("15"), "comment": ""},
                    {"criterion_id": str(items[1].id), "type": "library", "raw_score": Decimal("5"), "comment": ""},
                ],
            )

    def test_scorecard_links_criterion_score_to_library_item(self):
        """CriterionScore rows for library criteria must have marking_criteria_item set."""
        cycle = self._score_and_submit(8, 7)
        sheet = ScoreSheet.objects.get(review_cycle=cycle, judge=self.judge)
        for row in sheet.criterion_scores.all():
            self.assertIsNotNone(row.marking_criteria_item_id)



class SubmissionFeedbackViewTests(LibraryBaseTestCase):

    def setUp(self):
        super().setUp()
        self.criteria = _make_library_criteria("Feedback Criteria", self.admin)
        self.config = _make_stage_config_with_library(
            self.step, self.criteria, required=1, reject_below=40, pass_above=70
        )
        self.config.allow_applicant_feedback = True
        self.config.save()
        _assign_and_accept(self.submission, self.judge, self.officer)

        cycle = ReviewCycleService.get_or_open(submission=self.submission, workflow_step=self.step)
        items = list(self.criteria.items.order_by("ordering"))
        EvaluationService.save_cycle_scores(
            submission=self.submission,
            judge=self.judge,
            review_cycle=cycle,
            scores=[
                {"criterion_id": str(items[0].id), "type": "library", "raw_score": Decimal("8"), "comment": "Excellent innovation"},
                {"criterion_id": str(items[1].id), "type": "library", "raw_score": Decimal("9"), "comment": "Very feasible"},
            ],
        )
        EvaluationService.submit_cycle_scores(submission=self.submission, judge=self.judge, review_cycle=cycle)
        self.cycle = cycle

    def test_innovator_can_access_feedback_when_allowed(self):
        self.client.force_authenticate(self.innovator)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200)

    def test_officer_can_access_feedback(self):
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200)

    def test_feedback_blocked_when_flag_disabled(self):
        self.config.allow_applicant_feedback = False
        self.config.save()
        self.client.force_authenticate(self.innovator)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 403)

    def test_staff_can_access_feedback_regardless_of_flag(self):
        """Officers/admins see feedback regardless of allow_applicant_feedback flag."""
        self.config.allow_applicant_feedback = False
        self.config.save()
        self.client.force_authenticate(self.officer)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200)

    def test_feedback_response_contains_criteria_scores(self):
        self.client.force_authenticate(self.innovator)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200)
        data = r.data["data"]
        self.assertIn("criteria_feedback", data)
        self.assertGreater(len(data["criteria_feedback"]), 0)

    def test_feedback_contains_criterion_names_and_scores(self):
        self.client.force_authenticate(self.innovator)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 200)
        feedback = r.data["data"]["criteria_feedback"]
        names = [f["criterion_name"] for f in feedback]
        self.assertIn("Innovation", names)
        self.assertIn("Feasibility", names)
        for entry in feedback:
            self.assertIn("average_score", entry)
            self.assertIn("max_score", entry)

    def test_unauthenticated_cannot_access_feedback(self):
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertEqual(r.status_code, 401)

    def test_other_innovator_cannot_access_feedback(self):
        other = _make_user("lib-other@example.com", RoleType.INNOVATOR, "Other", "User")
        self.client.force_authenticate(other)
        r = self.client.get(f"/api/evaluations/{self.submission.id}/feedback/")
        self.assertIn(r.status_code, [403, 404])
