from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.selectors import SubmissionSelector
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService


class SubmissionSelectorPermissionTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="officer4@example.com", password="StrongPass123", first_name="Officer", last_name="Four")
        self.judge = User.objects.create_user(email="judge2@example.com", password="StrongPass123", first_name="Judge", last_name="Two")
        self.innovator = User.objects.create_user(email="innovator4@example.com", password="StrongPass123", first_name="Innovator", last_name="Four")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Ideas Selector",
            slug="ideas-selector",
            description="Desc",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Hackathon Form")
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
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Visible to Judge",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A valid answer"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to screening.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to shortlisting.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to judge review.")

    def test_judge_only_sees_assigned_submission(self):
        self.assertEqual(SubmissionSelector.for_user(self.judge).count(), 0)
        AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )
        self.assertEqual(SubmissionSelector.for_user(self.judge).count(), 1)
