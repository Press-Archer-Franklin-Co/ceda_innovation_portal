from django.test import TestCase
from django.utils import timezone
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType
from apps.programs.models import FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField


class CedaDraftRuntimeAlignmentApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.innovator = User.objects.create_user(
            email="draft-innovator@example.com",
            password="StrongPass123",
            first_name="Draft",
            last_name="User",
        )
        self.officer = User.objects.create_user(
            email="draft-officer@example.com",
            password="StrongPass123",
            first_name="Officer",
            last_name="User",
        )
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])

        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea Submission")
        self.program = Program.objects.create(
            title="Internal Innovation Idea 2026",
            slug="internal-innovation-idea-2026-test",
            description="CEDA draft/runtime alignment test",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Idea Form")
        section = FormSection.objects.create(form=form, title="Overview", code="overview", ordering=1)
        SubmissionFormField.objects.create(
            form=form,
            section=section,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )

    def test_draft_submit_creates_runtime_submission(self):
        self.client.force_authenticate(self.innovator)
        create_response = self.client.post(
            "/api/drafts/",
            {
                "program": str(self.program.id),
                "submission_type": "idea",
                "title": "Separated Draft",
                "draft_data": {"problem_statement": "A fully formed CEDA draft value proposition."},
                "current_section_code": "overview",
            },
            format="json",
        )
        self.assertEqual(create_response.status_code, 201)
        draft_id = create_response.json()["id"]

        submit_response = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertEqual(submit_response.status_code, 200)
        self.assertEqual(submit_response.json()["data"]["current_status"], "submitted")
        self.assertTrue(self.program.submissions.filter(title="Separated Draft").exists())

    def test_runtime_submission_create_endpoint_is_blocked(self):
        self.client.force_authenticate(self.innovator)
        response = self.client.post(
            "/api/submissions/",
            {
                "program": str(self.program.id),
                "submission_type": "idea",
                "title": "Should Not Create Runtime Directly",
            },
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("/api/drafts/", str(response.json()))

    def test_submission_detail_exposes_uploaded_file_documents_in_response_value(self):
        SubmissionFormField.objects.create(
            form=self.program.submission_form,
            section=self.program.submission_form.sections.get(code="overview"),
            label="Supporting Document",
            key="supporting_document",
            field_type=SubmissionFormFieldType.FILE,
            required=False,
            ordering=2,
        )
        self.client.force_authenticate(self.innovator)
        create_response = self.client.post(
            "/api/drafts/",
            {
                "program": str(self.program.id),
                "submission_type": "idea",
                "title": "File-backed Draft",
                "draft_data": {"problem_statement": "A fully formed CEDA draft value proposition."},
                "current_section_code": "overview",
            },
            format="json",
        )
        draft_id = create_response.json()["id"]
        upload = SimpleUploadedFile("supporting-note.pdf", b"pdf-data", content_type="application/pdf")
        upload_response = self.client.post(
            f"/api/documents/drafts/{draft_id}/documents/",
            {"field_key": "supporting_document", "document_type": "file", "file": upload},
        )
        self.assertEqual(upload_response.status_code, 201)

        submit_response = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertEqual(submit_response.status_code, 200)
        submission_id = submit_response.json()["data"]["id"]

        detail_response = self.client.get(f"/api/submissions/{submission_id}/")
        self.assertEqual(detail_response.status_code, 200)
        file_response = next(item for item in detail_response.json()["responses"] if item["field_key"] == "supporting_document")
        self.assertEqual(file_response["field_type"], SubmissionFormFieldType.FILE)
        self.assertEqual(len(file_response["value"]), 1)
        self.assertEqual(file_response["value"][0]["original_filename"], "supporting-note.pdf")
        self.assertTrue(file_response["value"][0]["document_id"])
        self.assertEqual(file_response["value"][0]["file_url"], "", "storage paths must not be exposed")
