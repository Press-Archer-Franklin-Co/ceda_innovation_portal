from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.services import AssignmentService
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.documents.models import DocumentCategory
from apps.programs.models import FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService
from apps.workflow.services import WorkflowDefinitionService


class TaskExecutionAndProgramWindowApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.innovator = User.objects.create_user(email="task-innovator@example.com", password="StrongPass123", first_name="Task", last_name="Innovator")
        self.officer = User.objects.create_user(email="task-officer@example.com", password="StrongPass123", first_name="Task", last_name="Officer")
        self.judge = User.objects.create_user(email="task-judge@example.com", password="StrongPass123", first_name="Task", last_name="Judge")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        RoleService.assign_roles(self.judge, [RoleType.JUDGE])

        program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        now = timezone.now()
        self.program = Program.objects.create(
            title="Task Runtime Program",
            slug="task-runtime-program",
            description="Task runtime program",
            program_type=program_type,
            opening_date=now - timezone.timedelta(days=1),
            closing_date=now + timezone.timedelta(days=5),
            owner=self.officer,
            status="published",
            opens_at=now - timezone.timedelta(days=1),
            closes_at=now + timezone.timedelta(days=5),
            evaluation_opens_at=now - timezone.timedelta(days=1),
            evaluation_closes_at=now + timezone.timedelta(days=5),
            allow_team_submission=True,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Task Form")
        section = FormSection.objects.create(form=form, title="Overview", code="overview", ordering=1)
        SubmissionFormField.objects.create(form=form, section=section, label="Problem", key="problem", field_type=SubmissionFormFieldType.TEXTAREA, required=True, ordering=1)

        WorkflowDefinitionService.create_definition(
            program=self.program,
            name="Task Flow",
            steps_data=[
                {"name": "Intake", "code": "intake", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "submitted"},
                {"name": "Judging", "code": "judging_review", "order": 2, "role_required": RoleType.INNOVATION_OFFICER, "actions_allowed": ["approve", "reject", "return"], "submission_status": "judging_review", "requires_assignment": True, "assignment_role": AssignmentRoleType.JUDGE, "minimum_assignments": 1},
            ],
            activate=True,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Task Submission",
        )
        field = self.program.submission_form.fields.get(key="problem")
        SubmissionService.save_responses(self.submission, [{"form_field": field.id, "value": "A real problem"}], actor=self.innovator)
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)
        from apps.workflow.services import WorkflowRuntimeService

        WorkflowRuntimeService.perform_action(submission=self.submission, actor=self.officer, action="approve", comment="Advance to judging.")
        self.assignment = AssignmentService.create_assignment(
            submission=self.submission,
            assignee=self.judge,
            role_type=AssignmentRoleType.JUDGE,
            assigned_by=self.officer,
            deadline=timezone.now() + timezone.timedelta(days=2),
        )
        self.task = self.assignment.tasks.first()

    def test_task_claim_and_complete_endpoints(self):
        self.client.force_authenticate(self.judge)
        claim = self.client.post(f"/api/tasks/{self.task.id}/claim/", {}, format="json")
        complete = self.client.post(f"/api/tasks/{self.task.id}/complete/", {"outcome": "approve", "comment": "Done."}, format="json")
        list_response = self.client.get(f"/api/submissions/{self.submission.id}/tasks/")

        self.assertEqual(claim.status_code, 200)
        self.assertEqual(complete.status_code, 200)
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["data"][0]["status"], "completed")

    def test_submission_blocked_when_program_closed(self):
        self.program.closes_at = timezone.now() - timezone.timedelta(hours=1)
        self.program.save(update_fields=["closes_at", "updated_at"])
        submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Blocked Submission",
        )
        field = self.program.submission_form.fields.get(key="problem")
        SubmissionService.save_responses(submission, [{"form_field": field.id, "value": "Another valid problem"}], actor=self.innovator)
        with self.assertRaisesMessage(Exception, "not currently open"):
            SubmissionService.finalize_submission(submission, self.innovator)

    def test_submission_outcome_and_analytics_endpoints(self):
        self.client.force_authenticate(self.officer)
        self.client.post(f"/api/tasks/{self.task.id}/reassign/", {"assignee": str(self.judge.id), "reason": "Keep current judge"}, format="json")
        self.client.force_authenticate(self.judge)
        self.client.post(f"/api/tasks/{self.task.id}/complete/", {"outcome": "approve", "comment": "Done."}, format="json")
        self.client.force_authenticate(self.officer)
        self.client.post(f"/api/submissions/{self.submission.id}/workflow-action/", {"action": "approve", "comment": "Finalize review"}, format="json")

        outcome = self.client.get(f"/api/submissions/{self.submission.id}/outcome/")
        program_outcomes = self.client.get(f"/api/programs/{self.program.id}/outcomes/")
        summary = self.client.get(f"/api/analytics/programs/{self.program.id}/summary/")
        pipeline = self.client.get(f"/api/analytics/programs/{self.program.id}/pipeline/")
        performance = self.client.get("/api/analytics/reviewer-performance/")
        bottlenecks = self.client.get("/api/analytics/bottlenecks/")

        self.assertEqual(outcome.status_code, 200)
        self.assertEqual(program_outcomes.status_code, 200)
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(pipeline.status_code, 200)
        self.assertEqual(performance.status_code, 200)
        self.assertEqual(bottlenecks.status_code, 200)

    def test_document_replace_and_grouped_listing(self):
        self.client.force_authenticate(self.innovator)
        category = DocumentCategory.objects.create(name="Architecture", code="architecture")
        upload_one = SimpleUploadedFile("diagram-v1.pdf", b"pdf-one", content_type="application/pdf")
        upload_two = SimpleUploadedFile("diagram-v2.pdf", b"pdf-two", content_type="application/pdf")
        create_one = self.client.post(
            f"/api/submissions/{self.submission.id}/documents/",
            {"category": str(category.id), "field_key": "architecture_diagram", "document_type": "file", "file": upload_one},
        )
        self.assertEqual(create_one.status_code, 201)
        doc_id = create_one.data["id"]
        create_two = self.client.post(
            f"/api/submissions/{self.submission.id}/documents/",
            {"category": str(category.id), "field_key": "architecture_diagram", "document_type": "file", "file": upload_two, "replace_document_id": doc_id},
        )
        grouped = self.client.get(f"/api/submissions/{self.submission.id}/documents/?grouped=true")
        self.assertEqual(create_two.status_code, 201)
        self.assertEqual(grouped.status_code, 200)
        self.assertIn("architecture_diagram", grouped.json()["data"]["grouped_by_field"])
