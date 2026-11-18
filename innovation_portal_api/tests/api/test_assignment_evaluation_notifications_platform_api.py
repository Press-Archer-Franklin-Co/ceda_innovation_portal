from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import Assignment
from apps.assignments.services import AssignmentService
from apps.communications.models import Notification
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.evaluation.models import EvaluationRound, Rubric, RubricCriterion
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowRuntimeService


class AssignmentEvaluationNotificationsPlatformApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="platform-officer@example.com", password="StrongPass123", first_name="Officer", last_name="Platform")
        self.judge = User.objects.create_user(email="platform-judge@example.com", password="StrongPass123", first_name="Judge", last_name="Platform")
        self.innovator = User.objects.create_user(email="platform-innovator@example.com", password="StrongPass123", first_name="Innovator", last_name="Platform")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])

        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.program = Program.objects.create(
            title="Platform Hackathon",
            slug="platform-hackathon",
            description="Platform Hackathon",
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
            title="Platform Submission",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A strong hackathon proposal"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to screening.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to shortlisting.")
        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Move to judge review.")

        self.rubric = Rubric.objects.create(title="Platform Rubric", program_type=program_type, total_weight=100)
        self.criterion = RubricCriterion.objects.create(
            rubric=self.rubric,
            name="Innovation",
            weight=100,
            min_score=0,
            max_score=10,
            ordering=1,
        )
        self.evaluation_round = EvaluationRound.objects.create(
            program=self.program,
            rubric=self.rubric,
            name="Round 1",
            required_judges=1,
        )

    def test_reviewer_queue_and_my_assigned_include_assignment_before_evaluation(self):
        assignment = AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )
        AssignmentService.respond(assignment, self.judge, accept=True)

        self.client.force_authenticate(self.judge)
        queue_response = self.client.get("/api/reviewer-queue/?mine=true")
        assigned_response = self.client.get("/api/evaluations/my-assigned/")

        self.assertEqual(queue_response.status_code, 200)
        self.assertEqual(assigned_response.status_code, 200)
        self.assertEqual(queue_response.data["data"][0]["reference_number"], self.submission.reference_number)
        self.assertEqual(assigned_response.data["data"][0]["reference_number"], self.submission.reference_number)
        self.assertEqual(assigned_response.data["data"][0]["latest_score_status"], "not_started")

    def test_evaluation_submission_locks_score_and_supports_ranking_shortlist(self):
        assignment = AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
        )
        AssignmentService.respond(assignment, self.judge, accept=True)

        self.client.force_authenticate(self.judge)
        evaluate_response = self.client.post(
            f"/api/submissions/{self.submission.id}/evaluate/",
            {
                "criterion_scores": [{"criterion": str(self.criterion.id), "raw_score": 8, "comment": "Strong"}],
                "comment": "Good quality",
                "submit": True,
            },
            format="json",
        )
        self.assertEqual(evaluate_response.status_code, 200)
        self.assertEqual(evaluate_response.data["data"]["status"], "locked")

        self.client.force_authenticate(self.officer)
        ranking_response = self.client.get(f"/api/programs/{self.program.id}/ranking/")
        shortlist_response = self.client.post(
            f"/api/programs/{self.program.id}/generate-shortlist/",
            {"limit": 1, "apply_workflow": False},
            format="json",
        )
        self.assertEqual(ranking_response.status_code, 200)
        self.assertEqual(shortlist_response.status_code, 200)
        self.assertEqual(ranking_response.data["data"][0]["reference_number"], self.submission.reference_number)
        self.assertEqual(shortlist_response.data["data"][0]["reference_number"], self.submission.reference_number)

    def test_notifications_unread_count_and_single_mark_read(self):
        starting_count = Notification.objects.filter(recipient=self.innovator, is_read=False).count()
        notification = Notification.objects.create(
            recipient=self.innovator,
            notification_type="submission_submitted",
            title="Submitted",
            body="Your submission has been received.",
        )
        self.client.force_authenticate(self.innovator)

        unread_response = self.client.get("/api/notifications/unread-count/")
        mark_one_response = self.client.post(f"/api/notifications/{notification.id}/mark-read/", {}, format="json")

        self.assertEqual(unread_response.status_code, 200)
        self.assertEqual(unread_response.data["data"]["unread_count"], starting_count + 1)
        self.assertEqual(mark_one_response.status_code, 200)
        notification.refresh_from_db()
        self.assertTrue(notification.is_read)
