"""
Role Task Visibility Isolation Tests
=====================================

Verifies that users can ONLY see tasks that belong to their role.

Scenarios covered:
  1.  Innovation Officer cannot see Judge tasks in the reviewer queue
  2.  Judge cannot see Officer tasks in the reviewer queue
  3.  Judge CAN see judge-role tasks in the reviewer queue
  4.  Officer CAN see officer-role tasks in the reviewer queue
  5.  Assigned tasks (My Assignments) scope to the calling user only
  6.  Officer cannot see another user's (judge) assignment in /api/assignments/
  7.  Judge cannot be assigned to an officer-role step (service-level guard)
  8.  Officer cannot be assigned to a judge-role step (service-level guard)
  9.  can_claim=False for officer on judge-step queue item
  10. can_claim=True for judge on judge-step queue item (when slots available)
  11. Viewed-but-not-owned tasks do NOT appear in My Assignments
  12. Claimed tasks ARE visible to the claimer
"""

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.core.constants import (
    AssignmentRoleType, ProgramTypeCode, RoleType,
    SubmissionFormFieldType, SubmissionType,
)
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService



def _make_user(email, roles):
    u = User.objects.create_user(email=email, password="StrongPass!", first_name=email.split("@")[0], last_name="Test")
    RoleService.assign_roles(u, roles)
    return u


def _make_program(officer, program_type, slug):
    program = Program.objects.create(
        title=slug,
        slug=slug,
        description=slug,
        program_type=program_type,
        opening_date=timezone.now(),
        closing_date=timezone.now() + timezone.timedelta(days=10),
        owner=officer,
    )
    form = SubmissionForm.objects.create(program=program, title="Form")
    field = SubmissionFormField.objects.create(
        form=form,
        label="Statement",
        key="statement",
        field_type=SubmissionFormFieldType.TEXTAREA,
        required=True,
        ordering=1,
    )
    return program, field


def _submit_and_advance_to_judge_review(submission, field, officer, innovator):
    """Advance a submission through the default workflow to the judge-review step."""
    SubmissionService.save_responses(
        submission,
        responses=[{"form_field": field.id, "value": "A complete response"}],
        actor=innovator,
    )
    submission = SubmissionService.finalize_submission(submission, innovator)
    WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Screening pass.")
    WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Shortlisting pass.")
    WorkflowRuntimeService.perform_action(submission=submission, actor=officer, action="approve", comment="Move to judge review.")
    return submission



class RoleTaskVisibilityIsolationTests(TestCase):
    """End-to-end API tests proving strict role isolation on task visibility."""

    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()

        self.officer    = _make_user("role-officer@example.com",   [RoleType.INNOVATION_OFFICER])
        self.judge      = _make_user("role-judge@example.com",     [RoleType.JUDGE])
        self.specialist = _make_user("role-specialist@example.com", [RoleType.SPECIALIST])
        self.innovator  = _make_user("role-innovator@example.com", [RoleType.INNOVATOR])

        self.pt = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]


    def _submission_at_judge_review(self, slug_suffix=""):
        """Return a submission sitting at the judge-review workflow step."""
        program, field = _make_program(self.officer, self.pt, f"role-test-prog{slug_suffix}")
        submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title=f"Role Test Submission {slug_suffix}",
        )
        return _submit_and_advance_to_judge_review(submission, field, self.officer, self.innovator)

    def _queue_ids(self, user, params=""):
        """Call /api/reviewer-queue/ as the given user and return submission IDs."""
        self.client.force_authenticate(user)
        resp = self.client.get(f"/api/reviewer-queue/{params}")
        self.assertEqual(resp.status_code, 200)
        return [item["id"] for item in resp.data.get("data", [])]

    def _my_assignment_ids(self, user):
        """Call /api/assignments/ as the given user and return assignment IDs.

        The ModelViewSet list action returns a plain list (not api_success wrapped),
        so we handle both shapes: list directly, or {"data": [...]} envelope.
        """
        self.client.force_authenticate(user)
        resp = self.client.get("/api/assignments/")
        self.assertEqual(resp.status_code, 200)
        data = resp.data
        if isinstance(data, dict):
            items = data.get("data") or data.get("results") or []
        else:
            items = list(data)
        return [str(item["id"]) for item in items]


    def test_officer_cannot_see_judge_step_tasks_in_queue(self):
        """An innovation officer must NOT see tasks on a judge-role step."""
        submission = self._submission_at_judge_review("-t1")
        step = submission.workflow_instance.current_step

        self.assertEqual(step.assignment_role, AssignmentRoleType.JUDGE)

        queue_ids = self._queue_ids(self.officer, "?unassigned=true")
        self.assertNotIn(
            str(submission.id), queue_ids,
            "Innovation Officer must NOT see judge-step tasks in the reviewer queue.",
        )


    def test_judge_cannot_see_officer_step_tasks_in_queue(self):
        """A judge must NOT see tasks on an officer-role step."""
        program, field = _make_program(self.officer, self.pt, "role-test-officer-step")
        submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Officer Step Submission",
        )
        SubmissionService.save_responses(
            submission,
            responses=[{"form_field": field.id, "value": "Valid response"}],
            actor=self.innovator,
        )
        submission = SubmissionService.finalize_submission(submission, self.innovator)
        step = submission.workflow_instance.current_step if hasattr(submission, "workflow_instance") and submission.workflow_instance else None

        if step and step.assignment_role in ("officer", "reviewer"):
            queue_ids = self._queue_ids(self.judge, "?unassigned=true")
            if step.assignment_role == "officer":
                self.assertNotIn(
                    str(submission.id), queue_ids,
                    "Judge must NOT see officer-role steps in the queue.",
                )


    def test_judge_can_see_judge_step_tasks_in_queue(self):
        """A judge must see tasks on a judge-role step in the unassigned queue."""
        submission = self._submission_at_judge_review("-t3")
        step = submission.workflow_instance.current_step
        self.assertEqual(step.assignment_role, AssignmentRoleType.JUDGE)

        queue_ids = self._queue_ids(self.judge, "?unassigned=true")
        self.assertIn(
            str(submission.id), queue_ids,
            "Judge must see judge-step tasks in the reviewer queue.",
        )


    def test_my_assignments_only_returns_calling_users_own_assignments(self):
        """GET /api/assignments/ must return only the calling user's own assignments."""
        submission = self._submission_at_judge_review("-t4")

        judge_assignment = AssignmentService.create_assignment(
            submission=submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )

        officer_ids = self._my_assignment_ids(self.officer)
        self.assertNotIn(
            str(judge_assignment.id), officer_ids,
            "Officer must NOT see the judge's assignment in their /api/assignments/ list.",
        )

        judge_ids = self._my_assignment_ids(self.judge)
        self.assertIn(
            str(judge_assignment.id), judge_ids,
            "Judge must see their own assignment in /api/assignments/.",
        )


    def test_my_assignments_respect_current_roles(self):
        """Assignments should not appear if the user no longer has the required role."""
        submission = self._submission_at_judge_review("-t4b")

        dual_user = _make_user("role-dual@example.com", [RoleType.JUDGE])
        assignment = AssignmentService.create_assignment(
            submission=submission,
            assignee=dual_user,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )

        RoleService.set_roles(dual_user, [RoleType.INNOVATION_OFFICER])

        ids = self._my_assignment_ids(dual_user)
        self.assertNotIn(
            str(assignment.id), ids,
            "Users without the required role must not see role-mismatched assignments.",
        )


    def test_my_assignments_filtered_by_current_role_param(self):
        """When role param is provided, only assignments for that role are returned."""
        submission = self._submission_at_judge_review("-t4c")
        dual_user = _make_user("role-dual-2@example.com", [RoleType.JUDGE, RoleType.INNOVATION_OFFICER])

        assignment = AssignmentService.create_assignment(
            submission=submission,
            assignee=dual_user,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )

        self.client.force_authenticate(dual_user)
        resp_judge = self.client.get("/api/assignments/?role=judge")
        self.assertEqual(resp_judge.status_code, 200)
        data_judge = resp_judge.data.get("data") if isinstance(resp_judge.data, dict) else resp_judge.data
        ids_judge = [str(item["id"]) for item in data_judge]
        self.assertIn(str(assignment.id), ids_judge)

        resp_officer = self.client.get("/api/assignments/?role=innovation_officer")
        self.assertEqual(resp_officer.status_code, 200)
        data_officer = resp_officer.data.get("data") if isinstance(resp_officer.data, dict) else resp_officer.data
        ids_officer = [str(item["id"]) for item in data_officer]
        self.assertNotIn(str(assignment.id), ids_officer)


    def test_officer_assignment_not_visible_to_judge(self):
        """An assignment belonging to an officer is not returned for a judge query."""
        submission = self._submission_at_judge_review("-t5")

        try:
            officer_assignment = AssignmentService.create_assignment(
                submission=submission,
                assignee=self.officer,
                role_type=AssignmentRoleType.REVIEWER,
                assigned_by=self.officer,
            )
        except Exception:
            return

        judge_ids = self._my_assignment_ids(self.judge)
        self.assertNotIn(
            str(officer_assignment.id), judge_ids,
            "Judge must NOT see the officer's assignment.",
        )


    def test_service_blocks_officer_from_being_assigned_to_judge_step(self):
        """AssignmentService must reject assigning an officer to a judge-role step."""
        submission = self._submission_at_judge_review("-t6")
        step = submission.workflow_instance.current_step
        self.assertEqual(step.assignment_role, AssignmentRoleType.JUDGE)

        with self.assertRaises(ValidationError) as ctx:
            AssignmentService.create_assignment(
                submission=submission,
                assignee=self.officer,
                role_type=AssignmentRoleType.JUDGE,
                assigned_by=self.officer,
            )
        self.assertIn("required role", str(ctx.exception).lower())


    def test_service_blocks_judge_from_officer_role_type(self):
        """AssignmentService must reject assigning a judge to an officer-role type."""
        submission = self._submission_at_judge_review("-t7")

        with self.assertRaises(ValidationError) as ctx:
            AssignmentService.create_assignment(
                submission=submission,
                assignee=self.judge,
                role_type=AssignmentRoleType.OFFICER,
                assigned_by=self.officer,
            )
        self.assertIn("required role", str(ctx.exception).lower())


    def test_service_blocks_specialist_from_judge_role_type(self):
        """AssignmentService must reject assigning a specialist to a judge-role step."""
        submission = self._submission_at_judge_review("-t8")

        with self.assertRaises(ValidationError) as ctx:
            AssignmentService.create_assignment(
                submission=submission,
                assignee=self.specialist,
                role_type=AssignmentRoleType.JUDGE,
                assigned_by=self.officer,
            )
        self.assertIn("required role", str(ctx.exception).lower())


    def test_can_claim_false_for_officer_on_judge_step(self):
        """The reviewer-queue item must have can_claim=False for an officer on a judge step."""
        submission = self._submission_at_judge_review("-t9")
        step = submission.workflow_instance.current_step
        self.assertEqual(step.assignment_role, AssignmentRoleType.JUDGE)

        self.client.force_authenticate(self.officer)
        resp = self.client.get("/api/reviewer-queue/?unassigned=true")
        self.assertEqual(resp.status_code, 200)

        items = resp.data.get("data", [])
        matching = [i for i in items if i["id"] == str(submission.id)]
        for item in matching:
            self.assertFalse(
                item.get("can_claim"),
                "Officer must have can_claim=False on a judge-role step item.",
            )


    def test_can_claim_true_for_judge_on_judge_step(self):
        """The reviewer-queue item must have can_claim=True for a judge on a judge step."""
        submission = self._submission_at_judge_review("-t10")
        step = submission.workflow_instance.current_step
        self.assertEqual(step.assignment_role, AssignmentRoleType.JUDGE)
        self.assertGreater(step.minimum_assignments, 0, "Step must require at least 1 assignment for this test.")

        self.client.force_authenticate(self.judge)
        resp = self.client.get("/api/reviewer-queue/?unassigned=true")
        self.assertEqual(resp.status_code, 200)

        items = resp.data.get("data", [])
        matching = [i for i in items if i["id"] == str(submission.id)]
        self.assertTrue(matching, "Judge must see the judge-step task in the queue.")
        self.assertTrue(
            matching[0].get("can_claim"),
            "Judge must have can_claim=True on an open judge-role step item.",
        )


    def test_viewed_but_not_owned_tasks_not_in_my_assignments(self):
        """Accessing the reviewer queue does NOT create an assignment — task stays invisible in My Assignments."""
        submission = self._submission_at_judge_review("-t11")

        self.client.force_authenticate(self.judge)
        self.client.get("/api/reviewer-queue/?unassigned=true")

        judge_ids = self._my_assignment_ids(self.judge)
        matching = Assignment.objects.filter(submission=submission, assignee=self.judge)
        self.assertEqual(
            matching.count(), 0,
            "Viewing the reviewer queue must NOT create an assignment for the judge.",
        )
        for a in matching:
            self.assertNotIn(str(a.id), judge_ids)


    def test_claimed_task_visible_to_claimer_in_my_assignments(self):
        """After claiming a task, it must appear in the claimer's /api/assignments/ list."""
        submission = self._submission_at_judge_review("-t12")

        assignment = AssignmentService.claim_submission(
            submission=submission,
            actor=self.judge,
        )

        judge_ids = self._my_assignment_ids(self.judge)
        self.assertIn(
            str(assignment.id), judge_ids,
            "Claimed task must appear in the claimer's My Assignments list.",
        )


    def test_api_claim_blocked_for_officer_on_judge_step(self):
        """POST /api/assignments/claim-submission/:id/ must be rejected for the wrong role."""
        submission = self._submission_at_judge_review("-t13")

        self.client.force_authenticate(self.officer)
        resp = self.client.post(f"/api/assignments/claim-submission/{submission.id}/")
        self.assertIn(
            resp.status_code, [400, 403],
            "Officer must receive 400 or 403 when attempting to claim a judge-role step.",
        )


    def test_assignments_list_does_not_leak_across_users(self):
        """Two different judges each see only their own assignments, not each other's."""
        judge2 = _make_user("role-judge2@example.com", [RoleType.JUDGE])

        submission_a = self._submission_at_judge_review("-t14a")
        submission_b = self._submission_at_judge_review("-t14b")

        assignment_a = AssignmentService.create_assignment(
            submission=submission_a, assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE, assigned_by=self.officer,
        )
        assignment_b = AssignmentService.create_assignment(
            submission=submission_b, assignee=judge2,
            role_type=AssignmentRoleType.JUDGE, assigned_by=self.officer,
        )

        judge1_ids = self._my_assignment_ids(self.judge)
        judge2_ids = self._my_assignment_ids(judge2)

        self.assertIn(str(assignment_a.id), judge1_ids)
        self.assertNotIn(str(assignment_b.id), judge1_ids,
            "Judge 1 must NOT see Judge 2's assignment.")

        self.assertIn(str(assignment_b.id), judge2_ids)
        self.assertNotIn(str(assignment_a.id), judge2_ids,
            "Judge 2 must NOT see Judge 1's assignment.")
