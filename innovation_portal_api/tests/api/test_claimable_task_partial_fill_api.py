"""
Claimable task visibility — partially-filled multi-reviewer step.

Business rule under test
------------------------
An Available Task must appear in GET /api/reviewer-queue/?unassigned=true for a
user when ALL of the following hold:

  1. The workflow step's assignment_role matches the user's active role.
  2. The step is still open (workflow_instance exists and current_step is set).
  3. minimum_assignments has NOT yet been satisfied (slots_remaining > 0).
  4. The requesting user has NOT already submitted / claimed a slot.

The previous implementation incorrectly required that a TaskExecution with
assignee=None still exist.  In the multi-reviewer model every claimant gets
their own TaskExecution row (assignee = that claimant), so a 2-of-3 filled
step has ZERO TaskExecution rows with assignee=None even though one slot is
still open.  This caused the task to vanish from Available Tasks.

Test matrix
-----------
  A. 0-of-3 filled  → task appears (baseline)
  B. 2-of-3 filled  → task appears for the third eligible officer  ← main bug
  C. 3-of-3 filled  → task does NOT appear (slots exhausted)
  D. user already claimed → task does NOT appear (already has a slot)
"""
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.core.constants import (
    AssignmentRoleType, AssignmentStatus,
    ProgramTypeCode, RoleType, SubmissionStatus, SubmissionType,
)
from apps.programs.models import Program, ProgramType, SubmissionForm
from apps.submissions.models import Submission
from apps.workflow.models import WorkflowDefinition, WorkflowInstance, WorkflowStep



def _make_officer(suffix):
    u = User.objects.create_user(
        email=f"officer{suffix}@claimtest.local",
        password="Pass123!",
        first_name="Officer",
        last_name=str(suffix),
    )
    RoleService.assign_roles(u, [RoleType.INNOVATION_OFFICER])
    return u


def _make_innovator(suffix=""):
    u = User.objects.create_user(
        email=f"innovator{suffix}@claimtest.local",
        password="Pass123!",
        first_name="Inno",
        last_name="Vator",
    )
    RoleService.assign_roles(u, [RoleType.INNOVATOR])
    return u


def _make_step(wf_def, *, minimum_assignments):
    """Create a WorkflowStep configured for officer review."""
    return WorkflowStep.objects.create(
        workflow_definition=wf_def,
        name="Officer Review",
        code="officer_review",
        order=1,
        role_required=RoleType.INNOVATION_OFFICER,
        actions_allowed=["approve", "reject"],
        submission_status=SubmissionStatus.UNDER_REVIEW,
        requires_assignment=True,
        assignment_role=AssignmentRoleType.OFFICER,
        minimum_assignments=minimum_assignments,
        due_in_hours=72,
    )


def _make_submission(officer, program, suffix=""):
    sub = Submission.objects.create(
        program=program,
        innovator=officer,
        submission_type=SubmissionType.HACKATHON_APPLICATION,
        title=f"Claim Test Sub {suffix}",
        current_status=SubmissionStatus.UNDER_REVIEW,
    )
    return sub


def _attach_workflow(submission, step):
    """Attach a WorkflowInstance to the submission and set current_step to step."""
    wi = WorkflowInstance.objects.create(
        submission=submission,
        workflow_definition=step.workflow_definition,
        current_step=step,
        status=WorkflowInstance.STATUS_IN_PROGRESS,
    )
    return wi


def _claim(submission, step, officer, assigning_officer):
    """Create a completed (accepted) assignment for officer — simulates a claimed slot."""
    assignment = Assignment.objects.create(
        submission=submission,
        workflow_step=step,
        assignee=officer,
        role_type=AssignmentRoleType.OFFICER,
        assigned_by=assigning_officer,
        status=AssignmentStatus.ACCEPTED,
    )
    return assignment



class PartialFillClaimableTaskTests(TestCase):
    """
    /api/reviewer-queue/?unassigned=true must honour the business rule:
    slot_remaining > 0  AND  requesting user has not already claimed
    → task is visible regardless of how many others have already claimed.
    """

    @classmethod
    def setUpTestData(cls):
        RoleService.ensure_default_roles()

        cls.officer_a = _make_officer("A")
        cls.officer_b = _make_officer("B")
        cls.officer_c = _make_officer("C")
        cls.officer_d = _make_officer("D")
        cls.innovator  = _make_innovator()

        pt = ProgramType.objects.get_or_create(
            code=ProgramTypeCode.HACKATHON,
            defaults={"name": "Hackathon", "description": ""},
        )[0]
        cls.program = Program.objects.create(
            title="Claim Test Program",
            slug="claim-test-program",
            description="Test",
            program_type=pt,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=30),
            owner=cls.officer_a,
        )
        SubmissionForm.objects.create(program=cls.program, version=1)

        cls.wf_def = WorkflowDefinition.objects.create(
            name="Claim Test Workflow",
            description="",
            program=cls.program,
            created_by=cls.officer_a,
        )
        cls.step = _make_step(cls.wf_def, minimum_assignments=3)

    def _queue_ids(self, officer, extra_params=""):
        client = APIClient()
        client.force_authenticate(officer)
        resp = client.get(
            f"/api/reviewer-queue/?unassigned=true&role=innovation_officer{extra_params}"
        )
        self.assertEqual(resp.status_code, 200)
        items = resp.data.get("data") if isinstance(resp.data, dict) else resp.data
        return {str(item["id"]) for item in (items or [])}

    def _make_test_submission(self, label=""):
        sub = _make_submission(self.officer_a, self.program, label)
        _attach_workflow(sub, self.step)
        return sub


    def test_zero_of_three_filled_task_is_visible(self):
        sub = self._make_test_submission("zero")
        self.assertIn(str(sub.id), self._queue_ids(self.officer_c))


    def test_two_of_three_filled_task_visible_to_third_officer(self):
        """
        2 officers have claimed. 1 slot remains. The 3rd officer must see the
        task in Available Tasks.  Previously broken because the view required
        an unassigned TaskExecution row, but each claimant gets their own row.
        """
        sub = self._make_test_submission("two-of-three")
        _claim(sub, self.step, self.officer_a, self.officer_a)
        _claim(sub, self.step, self.officer_b, self.officer_a)

        ids = self._queue_ids(self.officer_c)
        self.assertIn(
            str(sub.id), ids,
            "officer_c should see the partially-filled task — 1 slot remains",
        )

    def test_two_of_three_filled_can_claim_flag_is_true(self):
        """Serializer can_claim must also agree."""
        sub = self._make_test_submission("can-claim-flag")
        _claim(sub, self.step, self.officer_a, self.officer_a)
        _claim(sub, self.step, self.officer_b, self.officer_a)

        client = APIClient()
        client.force_authenticate(self.officer_c)
        resp = client.get(
            f"/api/reviewer-queue/?unassigned=true&role=innovation_officer"
        )
        items = resp.data.get("data") if isinstance(resp.data, dict) else resp.data
        item = next((i for i in (items or []) if str(i["id"]) == str(sub.id)), None)
        self.assertIsNotNone(item, "Task must be present in queue")
        self.assertTrue(item["can_claim"], "can_claim must be True for the open slot")
        self.assertEqual(item["slots_remaining"], 1)


    def test_three_of_three_filled_task_not_visible(self):
        """Once all slots are filled, no new claimant should see the task."""
        sub = self._make_test_submission("fully-filled")
        _claim(sub, self.step, self.officer_a, self.officer_a)
        _claim(sub, self.step, self.officer_b, self.officer_a)
        _claim(sub, self.step, self.officer_d, self.officer_a)

        ids = self._queue_ids(self.officer_c)
        self.assertNotIn(
            str(sub.id), ids,
            "All 3 slots are filled — task must NOT appear as claimable",
        )


    def test_already_claimed_task_not_shown_to_claimant(self):
        """An officer who already holds a slot must not see the task as claimable again."""
        sub = self._make_test_submission("already-claimed")
        _claim(sub, self.step, self.officer_a, self.officer_a)
        _claim(sub, self.step, self.officer_b, self.officer_a)

        ids = self._queue_ids(self.officer_a)
        self.assertNotIn(
            str(sub.id), ids,
            "officer_a already claimed — task must not re-appear as claimable",
        )
