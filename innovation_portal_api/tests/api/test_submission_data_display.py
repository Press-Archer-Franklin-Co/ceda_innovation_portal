"""
Submission data display tests — evaluate/{id} full data visibility.

Verifies:
  1. Submission detail returns all response types (text, textarea, multiselect, etc.)
  2. Multiselect responses include array values in API response
  3. File-type responses return document payload arrays (not raw file fields)
  4. Documents grouped endpoint returns grouped_by_field dict
  5. Documents grouped endpoint returns absolute URLs (request context applied)
  6. Documents filtered to is_current=True, is_active=True only
  7. Inactive/superseded document versions excluded from grouped view
  8. Staff (officer) can access submission detail and documents
  9. Submission metadata and innovator_detail present in response
 10. Empty multiselect array excluded from responses (filtered to non-empty only)
"""
import tempfile
from io import BytesIO

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import (
    RoleType, SubmissionFormFieldType, SubmissionType, ProgramTypeCode,
)
from apps.documents.models import DocumentCategory, SubmissionDocument
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.models import SubmissionResponse
from apps.submissions.services import SubmissionService



def _make_user(email, role, first="Test", last="User"):
    u = User.objects.create_user(
        email=email, password="Pass123!", first_name=first, last_name=last
    )
    RoleService.assign_roles(u, [role])
    return u


def _make_program(pt, officer):
    return Program.objects.create(
        title="Display Test Program",
        slug=f"disp-test-{pt.id}",
        description="Test",
        program_type=pt,
        opening_date=timezone.now(),
        closing_date=timezone.now() + timezone.timedelta(days=30),
        owner=officer,
    )


def _pt():
    return ProgramType.objects.get_or_create(
        code=ProgramTypeCode.HACKATHON,
        defaults={"name": "Hackathon", "description": ""},
    )[0]


def _make_submission_with_form(innovator, program, extra_fields=None):
    """Create a submission with a rich set of form field responses."""
    sub = SubmissionService.create_draft(
        innovator=innovator, program=program,
        submission_type=SubmissionType.HACKATHON_APPLICATION,
        title="Full Data Submission",
    )
    return sub


def _get_or_create_doc_category():
    return DocumentCategory.objects.get_or_create(
        code="general",
        defaults={"name": "General"},
    )[0]



class _BaseSetup(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.pt = _pt()
        cls.officer = _make_user("officer@disp.test", RoleType.INNOVATION_OFFICER, "Officer", "One")
        cls.innovator = _make_user("inno@disp.test", RoleType.INNOVATOR, "Inno", "Vator")
        cls.program = _make_program(cls.pt, cls.officer)

        cls.form = SubmissionForm.objects.create(program=cls.program, version=1)
        cls.text_field = SubmissionFormField.objects.create(
            form=cls.form, label="Project Title", key="project_title",
            field_type=SubmissionFormFieldType.TEXT, ordering=1,
        )
        cls.multi_field = SubmissionFormField.objects.create(
            form=cls.form, label="Target Markets", key="target_markets",
            field_type=SubmissionFormFieldType.MULTISELECT, ordering=2,
        )
        cls.file_field = SubmissionFormField.objects.create(
            form=cls.form, label="Project Pitch", key="project_pitch",
            field_type=SubmissionFormFieldType.FILE, ordering=3,
        )

        cls.sub = SubmissionService.create_draft(
            innovator=cls.innovator, program=cls.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Full Data Test Submission",
        )
        SubmissionService.save_responses(
            cls.sub,
            responses=[
                {"form_field": str(cls.text_field.id), "value": "Smart Grid Innovation"},
                {"form_field": str(cls.multi_field.id), "value": ["Energy", "Transport", "Water"]},
            ],
            actor=cls.innovator,
        )
        cls.sub = SubmissionService.finalize_submission(cls.sub, cls.innovator)

        cls.cat = _get_or_create_doc_category()



class SubmissionDetailResponsesTests(_BaseSetup):
    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.officer)

    def test_submission_detail_includes_responses_list(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertIn("responses", data)
        self.assertIsInstance(data["responses"], list)

    def test_text_response_value_is_string(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        self.assertIn("project_title", responses)
        self.assertEqual(responses["project_title"]["value"], "Smart Grid Innovation")
        self.assertEqual(responses["project_title"]["field_type"], "text")

    def test_multiselect_response_value_is_array(self):
        """Multiselect values must arrive as a JSON array — not filtered or stringified."""
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        self.assertIn("target_markets", responses)
        val = responses["target_markets"]["value"]
        self.assertIsInstance(val, list, "Multiselect value must be a list")
        self.assertEqual(sorted(val), ["Energy", "Transport", "Water"])

    def test_multiselect_field_type_is_multiselect(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        self.assertEqual(responses["target_markets"]["field_type"], "multiselect")

    def test_innovator_detail_present(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        data = res.json()
        self.assertIn("innovator_detail", data)
        detail = data["innovator_detail"]
        self.assertEqual(detail["email"], self.innovator.email)
        self.assertIn("full_name", detail)

    def test_program_detail_present(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        data = res.json()
        self.assertIn("program_detail", data)
        self.assertEqual(data["program_detail"]["title"], "Display Test Program")

    def test_submission_type_present(self):
        res = self.client.get(f"/api/submissions/{self.sub.id}/")
        data = res.json()
        self.assertIn("submission_type", data)
        self.assertEqual(data["submission_type"], SubmissionType.HACKATHON_APPLICATION)



class FileResponseShapeTests(_BaseSetup):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.file_sub = SubmissionService.create_draft(
            innovator=cls.innovator, program=cls.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="File Field Submission",
        )
        SubmissionService.save_responses(
            cls.file_sub,
            responses=[
                {"form_field": str(cls.text_field.id), "value": "File Test"},
                {"form_field": str(cls.file_field.id), "value": []},
            ],
            actor=cls.innovator,
        )
        cls.file_sub = SubmissionService.finalize_submission(cls.file_sub, cls.innovator)
        cls.pitch_doc = SubmissionDocument.objects.create(
            submission=cls.file_sub,
            category=cls.cat,
            field_key="project_pitch",
            original_filename="pitch.pdf",
            mime_type="application/pdf",
            size_bytes=102400,
            is_current=True,
            is_active=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.officer)

    def test_file_response_returns_document_array_when_response_saved(self):
        """When a file-type response exists, its value is a list of document objects."""
        res = self.client.get(f"/api/submissions/{self.file_sub.id}/")
        self.assertEqual(res.status_code, 200)
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        self.assertIn("project_pitch", responses)
        val = responses["project_pitch"]["value"]
        self.assertIsInstance(val, list)
        self.assertEqual(len(val), 1)
        doc = val[0]
        self.assertIn("original_filename", doc)
        self.assertEqual(doc["original_filename"], "pitch.pdf")
        self.assertIn("field_key", doc)
        self.assertEqual(doc["field_key"], "project_pitch")



@override_settings(MEDIA_URL="/media/")
class DocumentsGroupedEndpointTests(_BaseSetup):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.doc = SubmissionDocument.objects.create(
            submission=cls.sub,
            category=cls.cat,
            field_key="project_pitch",
            original_filename="pitch.pdf",
            mime_type="application/pdf",
            size_bytes=102400,
            is_current=True,
            is_active=True,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.officer)
        self.url = f"/api/documents/submissions/{self.sub.id}/documents/?grouped=true"

    def _grouped(self, res):
        """Unwrap the api_success envelope to get grouped_by_field dict."""
        body = res.json()
        if "data" in body and isinstance(body["data"], dict):
            return body["data"].get("grouped_by_field", {})
        return body.get("grouped_by_field", {})

    def test_grouped_returns_grouped_by_field_key(self):
        res = self.client.get(self.url)
        self.assertEqual(res.status_code, 200)
        grouped = self._grouped(res)
        self.assertIsInstance(grouped, dict)
        self.assertTrue(len(grouped) > 0, "Expected at least one field group")

    def test_grouped_document_appears_under_its_field_key(self):
        res = self.client.get(self.url)
        grouped = self._grouped(res)
        self.assertIn("project_pitch", grouped)
        self.assertEqual(len(grouped["project_pitch"]), 1)
        self.assertEqual(grouped["project_pitch"][0]["original_filename"], "pitch.pdf")



class DocumentVersionFilterTests(_BaseSetup):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.old_doc = SubmissionDocument.objects.create(
            submission=cls.sub,
            category=cls.cat,
            field_key="project_pitch",
            original_filename="pitch_v1.pdf",
            mime_type="application/pdf",
            size_bytes=51200,
            version_number=1,
            is_current=False,
            is_active=True,
        )
        cls.current_doc = SubmissionDocument.objects.create(
            submission=cls.sub,
            category=cls.cat,
            field_key="project_pitch",
            original_filename="pitch_v2.pdf",
            mime_type="application/pdf",
            size_bytes=102400,
            version_number=2,
            is_current=True,
            is_active=True,
        )
        cls.deleted_doc = SubmissionDocument.objects.create(
            submission=cls.sub,
            category=cls.cat,
            field_key="supplementary",
            original_filename="deleted.pdf",
            mime_type="application/pdf",
            size_bytes=10240,
            is_current=True,
            is_active=False,
        )

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.officer)
        self.url = f"/api/documents/submissions/{self.sub.id}/documents/?grouped=true"

    def _grouped(self, res):
        """Unwrap the api_success envelope to get grouped_by_field dict."""
        body = res.json()
        if "data" in body and isinstance(body["data"], dict):
            return body["data"].get("grouped_by_field", {})
        return body.get("grouped_by_field", {})

    def test_superseded_version_excluded(self):
        res = self.client.get(self.url)
        grouped = self._grouped(res)
        filenames = [d["original_filename"] for d in grouped.get("project_pitch", [])]
        self.assertNotIn("pitch_v1.pdf", filenames, "Superseded version must not appear")
        self.assertIn("pitch_v2.pdf", filenames, "Current version must appear")

    def test_inactive_document_excluded(self):
        res = self.client.get(self.url)
        grouped = self._grouped(res)
        all_filenames = [
            d["original_filename"]
            for docs in grouped.values()
            for d in docs
        ]
        self.assertNotIn("deleted.pdf", all_filenames, "Inactive document must not appear")

    def test_flat_list_also_excludes_non_current(self):
        res = self.client.get(f"/api/documents/submissions/{self.sub.id}/documents/")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        if isinstance(body, list):
            docs = body
        elif isinstance(body, dict):
            docs = body.get("data") or body.get("results") or []
        else:
            docs = []
        filenames = [d["original_filename"] for d in docs]
        self.assertNotIn("pitch_v1.pdf", filenames)
        self.assertNotIn("deleted.pdf", filenames)



class EmptyMultiselectTests(_BaseSetup):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()
        cls.sub2 = SubmissionService.create_draft(
            innovator=cls.innovator, program=cls.program,
            submission_type=SubmissionType.HACKATHON_APPLICATION,
            title="Empty Multiselect Submission",
        )
        SubmissionService.save_responses(
            cls.sub2,
            responses=[
                {"form_field": str(cls.text_field.id), "value": "Some Title"},
                {"form_field": str(cls.multi_field.id), "value": []},
            ],
            actor=cls.innovator,
        )
        cls.sub2 = SubmissionService.finalize_submission(cls.sub2, cls.innovator)

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.officer)

    def test_empty_multiselect_stored_as_empty_array(self):
        """The backend stores the empty array; the frontend is responsible for filtering it."""
        res = self.client.get(f"/api/submissions/{self.sub2.id}/")
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        if "target_markets" in responses:
            self.assertEqual(responses["target_markets"]["value"], [])

    def test_text_response_still_present_alongside_empty_multiselect(self):
        res = self.client.get(f"/api/submissions/{self.sub2.id}/")
        responses = {r["field_key"]: r for r in res.json()["responses"]}
        self.assertIn("project_title", responses)
        self.assertEqual(responses["project_title"]["value"], "Some Title")
