from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionStatus, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService


class SubmissionServiceTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.user = User.objects.create_user(
            email="innovator@example.com",
            password="StrongPass123",
            first_name="Inno",
            last_name="Vator",
        )
        RoleService.assign_roles(self.user, [RoleType.INNOVATOR])
        self.program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea Program")
        self.program = Program.objects.create(
            title="Ideas 2026",
            slug="ideas-2026",
            description="Idea challenge",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.user,
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

    def test_finalize_submission_generates_reference_and_locks(self):
        submission = SubmissionService.create_draft(
            innovator=self.user,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="My Idea",
        )
        SubmissionService.save_responses(
            submission,
            responses=[{"form_field": self.field.id, "value": "A strong problem statement"}],
            actor=self.user,
        )

        finalized = SubmissionService.finalize_submission(submission, self.user)

        self.assertTrue(finalized.reference_number.startswith("CEDA-INNOV-"))
        self.assertEqual(finalized.current_status, SubmissionStatus.SUBMITTED)
        self.assertTrue(finalized.locked_for_editing)

    def test_reference_numbers_are_unique_across_programs_of_same_type(self):
        other_program = Program.objects.create(
            title="Ideas 2027",
            slug="ideas-2027",
            description="Another idea challenge",
            program_type=self.program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.user,
        )
        other_form = SubmissionForm.objects.create(program=other_program, title="Idea Form Two")
        other_field = SubmissionFormField.objects.create(
            form=other_form,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )

        first_submission = SubmissionService.create_draft(
            innovator=self.user,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Program One Idea",
        )
        SubmissionService.save_responses(
            first_submission,
            responses=[{"form_field": self.field.id, "value": "Problem one"}],
            actor=self.user,
        )
        first_submission = SubmissionService.finalize_submission(first_submission, self.user)

        second_submission = SubmissionService.create_draft(
            innovator=self.user,
            program=other_program,
            submission_type=SubmissionType.IDEA,
            title="Program Two Idea",
        )
        SubmissionService.save_responses(
            second_submission,
            responses=[{"form_field": other_field.id, "value": "Problem two"}],
            actor=self.user,
        )
        second_submission = SubmissionService.finalize_submission(second_submission, self.user)

        self.assertNotEqual(first_submission.reference_number, second_submission.reference_number)
