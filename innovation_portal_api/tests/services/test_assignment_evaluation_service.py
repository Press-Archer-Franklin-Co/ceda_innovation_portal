from django.test import TestCase
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.evaluation.models import EvaluationRound, Rubric, RubricCriterion
from apps.evaluation.services import EvaluationService
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService


class AssignmentEvaluationFlowTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="officer2@example.com", password="StrongPass123", first_name="Officer", last_name="Two")
        self.judge = User.objects.create_user(email="judge@example.com", password="StrongPass123", first_name="Judge", last_name="One")
        self.innovator = User.objects.create_user(email="innovator3@example.com", password="StrongPass123", first_name="Innovator", last_name="Three")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Hack 2026",
            slug="hack-2026",
            description="Hackathon",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Hack Form")
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
            title="Hack Idea",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A strong hackathon concept"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to screening.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to shortlisting.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to judge review.")
        self.rubric = Rubric.objects.create(title="Hack Rubric", program_type=program_type, total_weight=100)
        self.criterion = RubricCriterion.objects.create(
            rubric=self.rubric,
            name="Innovation",
            weight=100,
            min_score=0,
            max_score=10,
            ordering=1,
        )
        self.evaluation_round = EvaluationRound.objects.create(program=self.program, rubric=self.rubric, name="Round 1", required_judges=1)

    def test_assignment_acceptance_and_score_submission(self):
        assignment = AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )
        AssignmentService.respond(assignment, self.judge, accept=True)
        score_sheet = EvaluationService.save_scores(
            submission=self.submission,
            judge=self.judge,
            evaluation_round=self.evaluation_round,
            scores=[{"criterion": self.criterion.id, "raw_score": 8, "comment": "Strong"}],
        )
        submitted = EvaluationService.submit_scores(submission=self.submission, judge=self.judge, evaluation_round=self.evaluation_round)

        self.assertEqual(float(score_sheet.total_score), 80.0)
        self.assertEqual(submitted.status, "locked")
