from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService


class WorkflowRuntimeServiceTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.innovator = User.objects.create_user(email="workflow-innovator@example.com", password="StrongPass123", first_name="Work", last_name="Flow")
        self.officer = User.objects.create_user(email="workflow-officer@example.com", password="StrongPass123", first_name="Officer", last_name="Flow")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea Workflow")
        self.program = Program.objects.create(
            title="Workflow Program",
            slug="workflow-program",
            description="Workflow test",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Workflow Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )

    def test_submit_creates_workflow_instance_and_approve_advances_step(self):
        submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Workflow idea",
        )
        SubmissionService.save_responses(
            submission,
            responses=[{"form_field": self.field.id, "value": "A problem worth solving"}],
            actor=self.innovator,
        )
        submission = SubmissionService.finalize_submission(submission, self.innovator)

        self.assertEqual(submission.workflow_instance.current_step.code, "intake")
        self.assertEqual(submission.current_status, "submitted")

        WorkflowRuntimeService.perform_action(submission=submission, actor=self.officer, action="approve", comment="Move to screening.")
        submission.refresh_from_db()

        self.assertEqual(submission.workflow_instance.current_step.code, "screening")
        self.assertEqual(submission.current_status, "screening")

    def test_return_for_correction_unlocks_submission(self):
        submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Return idea",
        )
        SubmissionService.save_responses(
            submission,
            responses=[{"form_field": self.field.id, "value": "Needs more detail"}],
            actor=self.innovator,
        )
        submission = SubmissionService.finalize_submission(submission, self.innovator)

        WorkflowRuntimeService.perform_action(submission=submission, actor=self.officer, action="return", comment="Add more market evidence.")
        submission.refresh_from_db()

        self.assertEqual(submission.current_status, "returned")
        self.assertFalse(submission.locked_for_editing)
        self.assertEqual(submission.workflow_instance.status, "returned")
