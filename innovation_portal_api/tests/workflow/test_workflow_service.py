from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import StepCompletionEvaluator, SubmissionWorkflowService, WorkflowDefinitionService, WorkflowRuntimeService


class WorkflowBypassProtectionTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.innovator = User.objects.create_user(email="innovator2@example.com", password="StrongPass123", first_name="A", last_name="B")
        self.officer = User.objects.create_user(email="officer@example.com", password="StrongPass123", first_name="Officer", last_name="One")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Idea Program",
            slug="idea-program",
            description="Desc",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Idea Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Idea Draft",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A valid answer"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)

    def test_legacy_service_transition_is_blocked(self):
        with self.assertRaises(ValidationError):
            SubmissionWorkflowService.transition(self.submission, "requires_more_information", self.officer)

    def test_legacy_change_status_endpoint_removed(self):
        self.client.force_authenticate(self.officer)
        response = self.client.post(
            f"/api/submissions/{self.submission.id}/change-status/",
            {"status": "under_review"},
            format="json",
        )

        self.assertEqual(response.status_code, 404)


class ParallelStepCompletionEvaluatorTests(TestCase):
    """Decision 6: review steps follow execution_mode, and move on by themselves only with advance_automatically."""

    def setUp(self):
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="parallel-officer@example.com", password="StrongPass123", first_name="Parallel", last_name="Officer")
        self.judges = []
        for number in range(3):
            judge = User.objects.create_user(email=f"parallel-judge{number}@example.com", password="StrongPass123", first_name="Judge", last_name=str(number))
            RoleService.assign_roles(judge, [RoleType.JUDGE])
            self.judges.append(judge)
        self.innovator = User.objects.create_user(email="parallel-innovator@example.com", password="StrongPass123", first_name="Parallel", last_name="Innovator")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        self.program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]

    def build(self, mode, *, minimum=1, auto=False):
        program = Program.objects.create(
            title=f"Parallel {mode} {minimum} {auto}", slug=f"parallel-{mode}-{minimum}-{int(auto)}", description="Desc", program_type=self.program_type,
            opening_date=timezone.now() - timezone.timedelta(days=1), closing_date=timezone.now() + timezone.timedelta(days=5),
            owner=self.officer, status="published",
        )
        form = SubmissionForm.objects.create(program=program, title="Flow Form")
        field = SubmissionFormField.objects.create(form=form, label="Problem", key="problem", field_type=SubmissionFormFieldType.TEXTAREA, required=True, ordering=1)
        WorkflowDefinitionService.create_definition(
            program=program,
            name="Parallel Flow",
            steps_data=[
                {"name": "Intake", "code": "intake", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "submitted"},
                {
                    "name": "Review", "code": "review", "order": 2, "role_required": RoleType.INNOVATION_OFFICER,
                    "actions_allowed": ["approve", "reject", "return"], "submission_status": "judging_review",
                    "execution_mode": mode, "minimum_completions_required": minimum, "advance_automatically": auto,
                    "requires_assignment": True, "assignment_role": AssignmentRoleType.JUDGE, "minimum_assignments": 3,
                },
                {"name": "Decision", "code": "decision", "order": 3, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "shortlisted"},
            ],
            activate=True,
        )
        submission = SubmissionService.create_draft(innovator=self.innovator, program=program, submission_type=SubmissionType.HACKATHON_APPLICATION, title="Parallel Submission")
        SubmissionService.save_responses(submission, [{"form_field": field.id, "value": "A valid problem statement"}], actor=self.innovator)
        submission = SubmissionService.finalize_submission(submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=submission, actor=self.officer, action="approve", comment="To review.")
        for judge in self.judges:
            AssignmentService.create_assignment(submission=submission, assignee=judge, role_type=AssignmentRoleType.JUDGE, assigned_by=self.officer)
        return submission

    def approve_by(self, submission, count):
        from apps.workflow.services import TaskExecutionService

        tasks = list(submission.workflow_instance.tasks.filter(workflow_step__code="review").order_by("created_at"))
        for task in tasks[:count]:
            TaskExecutionService.complete(task, task.assignee, outcome="approve", comment="Approved.")
        submission.refresh_from_db()
        return StepCompletionEvaluator.evaluate(instance=submission.workflow_instance)

    def status(self, submission):
        submission.refresh_from_db()
        return submission.current_status

    def test_parallel_any_advances_after_one_successful_task(self):
        # Setting off: one approval is enough, but the officer moves the idea on.
        submission = self.build("parallel_any")
        summary = self.approve_by(submission, 1)
        self.assertTrue(summary["may_advance"])
        self.assertFalse(summary["advance_automatically"])
        self.assertEqual(self.status(submission), "judging_review")
        WorkflowRuntimeService.perform_action(submission=submission, actor=self.officer, action="approve", comment="Advance on first successful review.")
        self.assertEqual(self.status(submission), "shortlisted")

    def test_parallel_any_moves_on_by_itself_when_set(self):
        submission = self.build("parallel_any", auto=True)
        self.approve_by(submission, 1)
        self.assertEqual(self.status(submission), "shortlisted")

    def test_parallel_all_waits_for_every_judge(self):
        for auto in (False, True):
            with self.subTest(auto=auto):
                submission = self.build("parallel_all", auto=auto)
                self.assertFalse(self.approve_by(submission, 2)["may_advance"])
                self.assertEqual(self.status(submission), "judging_review")
                summary = self.approve_by(submission, 3)
                if auto:
                    self.assertEqual(self.status(submission), "shortlisted")
                else:
                    self.assertTrue(summary["may_advance"])
                    self.assertEqual(self.status(submission), "judging_review")

    def test_parallel_minimum_needs_the_set_number(self):
        for auto in (False, True):
            with self.subTest(auto=auto):
                submission = self.build("parallel_minimum", minimum=2, auto=auto)
                self.assertFalse(self.approve_by(submission, 1)["may_advance"])
                self.assertEqual(self.status(submission), "judging_review")
                summary = self.approve_by(submission, 2)
                self.assertEqual(self.status(submission), "shortlisted" if auto else "judging_review")
                if not auto:
                    self.assertTrue(summary["may_advance"])
