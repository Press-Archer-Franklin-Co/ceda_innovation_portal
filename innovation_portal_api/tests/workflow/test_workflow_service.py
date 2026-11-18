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
    def setUp(self):
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="parallel-officer@example.com", password="StrongPass123", first_name="Parallel", last_name="Officer")
        self.judge_one = User.objects.create_user(email="parallel-judge1@example.com", password="StrongPass123", first_name="Judge", last_name="One")
        self.judge_two = User.objects.create_user(email="parallel-judge2@example.com", password="StrongPass123", first_name="Judge", last_name="Two")
        self.innovator = User.objects.create_user(email="parallel-innovator@example.com", password="StrongPass123", first_name="Parallel", last_name="Innovator")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge_one, [RoleType.JUDGE])
        RoleService.assign_roles(self.judge_two, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Parallel Flow Program",
            slug="parallel-flow-program",
            description="Desc",
            program_type=program_type,
            opening_date=timezone.now() - timezone.timedelta(days=1),
            closing_date=timezone.now() + timezone.timedelta(days=5),
            owner=self.officer,
            status="published",
        )
        form = SubmissionForm.objects.create(program=self.program, title="Flow Form")
        field = SubmissionFormField.objects.create(
            form=form,
            label="Problem",
            key="problem",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )
        WorkflowDefinitionService.create_definition(
            program=self.program,
            name="Parallel Flow",
            steps_data=[
                {"name": "Intake", "code": "intake", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "submitted"},
                {"name": "Review", "code": "review", "order": 2, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "judging_review", "execution_mode": "parallel_any", "minimum_completions_required": 1, "requires_assignment": True, "assignment_role": AssignmentRoleType.JUDGE, "minimum_assignments": 2},
            ],
            activate=True,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Parallel Submission",
        )
        SubmissionService.save_responses(self.submission, [{"form_field": field.id, "value": "A valid problem statement"}], actor=self.innovator)
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="To review.")
        self.a1 = AssignmentService.create_assignment(submission=self.submission, assignee=self.judge_one, role_type=AssignmentRoleType.JUDGE, assigned_by=self.officer)
        self.a2 = AssignmentService.create_assignment(submission=self.submission, assignee=self.judge_two, role_type=AssignmentRoleType.JUDGE, assigned_by=self.officer)

    def test_parallel_any_advances_after_one_successful_task(self):
        task = self.a1.tasks.first()
        from apps.workflow.services import TaskExecutionService

        TaskExecutionService.complete(task, self.judge_one, outcome="approve", comment="Approved.")
        summary = StepCompletionEvaluator.evaluate(instance=self.submission.workflow_instance)
        self.assertTrue(summary["may_advance"])
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Advance on first successful review.")
        self.submission.refresh_from_db()
        self.assertEqual(self.submission.current_status, "judging_review")
