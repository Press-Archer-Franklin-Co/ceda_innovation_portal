"""Copilot helpers (no AI): reading file text, drafts from a document or spec, and the workflow dry run."""

import io
import tempfile
from unittest.mock import patch

import docx
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from fpdf import FPDF

from apps.assignments.models import ReviewPanel
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog, Notification
from apps.documents.models import DocumentCategory, DocumentVersion, SubmissionDocument
from apps.documents.text import MAX_PAGES, extract_for_document, extract_text
from apps.programs.models import SubmissionForm
from apps.programs.services import create_draft_form_from_document
from apps.workflow.builder import create_draft_workflow_from_spec
from apps.workflow.catalogue import catalogue as workflow_catalogue
from apps.workflow.dry_run import WorkflowDryRunService
from apps.workflow.models import WorkflowDefinition, WorkflowInstance, WorkflowNode, WorkflowTransition
from tests.api.test_challenges_b5_api import B5TestCase, data
from tests.api.test_form_builder_api import sample_document

MB = 1024 * 1024


def pdf_bytes(pages=("Hello from page one.", "Budget is on page two."), text=True) -> bytes:
    pdf = FPDF()
    for line in pages:
        pdf.add_page()
        if text:
            pdf.set_font("Helvetica", size=12)
            pdf.cell(0, 10, line)
        else:
            pdf.rect(10, 10, 100, 60, style="F")  # a picture of a page, no text layer
    return bytes(pdf.output())


def docx_bytes() -> bytes:
    document = docx.Document()
    document.add_paragraph("Our idea dries mopane worms with the sun.")
    table = document.add_table(rows=1, cols=2)
    table.rows[0].cells[0].text = "Cost"
    table.rows[0].cells[1].text = "P 12,000"
    buffer = io.BytesIO()
    document.save(buffer)
    return buffer.getvalue()


class ExtractTextTests(B5TestCase):
    def test_pdf_keeps_pages(self):
        result = extract_text(io.BytesIO(pdf_bytes()), mime="application/pdf")
        self.assertEqual(result.status, "ok")
        self.assertEqual(len(result.pages), 2)
        self.assertIn("page two", result.pages[1])
        self.assertIn("page one", result.text)

    def test_scanned_pdf_is_empty_not_an_error(self):
        result = extract_text(io.BytesIO(pdf_bytes(text=False)), mime="application/pdf")
        self.assertEqual((result.status, result.text), ("empty", ""))
        self.assertEqual(len(result.pages), 2)

    def test_too_many_pages_reads_the_first_200(self):
        result = extract_text(io.BytesIO(pdf_bytes(pages=[f"Page {n}" for n in range(MAX_PAGES + 3)])), mime="application/pdf")
        self.assertEqual((result.status, len(result.pages)), ("ok", MAX_PAGES))
        self.assertIn("first 200", result.detail)

    def test_word_text_and_csv(self):
        word = extract_text(io.BytesIO(docx_bytes()), mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
        self.assertEqual(word.status, "ok")
        self.assertIn("mopane", word.text)
        self.assertIn("Cost | P 12,000", word.text)
        self.assertEqual(extract_text(io.BytesIO("Pula, thank you".encode()), mime="text/plain").text, "Pula, thank you")
        self.assertIn("district,count", extract_text(io.BytesIO(b"district,count\nGaborone,4"), mime="text/csv").text)
        with tempfile.NamedTemporaryFile(suffix=".txt") as handle:
            handle.write(b"From a path")
            handle.flush()
            self.assertEqual(extract_text(handle.name, mime="").text, "From a path")

    @override_settings(MEDIA_UPLOAD_SIZE_LIMITS={"document": 10})
    def test_too_large(self):
        self.assertEqual(extract_text(io.BytesIO(b"x" * 11), mime="text/plain").status, "too_large")

    def test_unsupported_and_broken(self):
        self.assertEqual(extract_text(io.BytesIO(b"\x89PNG"), mime="image/png").status, "unsupported")
        self.assertEqual(extract_text(io.BytesIO(b"%PDF-1.4 broken"), mime="application/pdf").status, "failed")
        self.assertEqual(extract_text(io.BytesIO(b"not a zip"), mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document").status, "failed")

    def test_stored_on_the_document_version(self):
        media = tempfile.mkdtemp()
        with override_settings(MEDIA_ROOT=media), patch("apps.documents.tasks.extract_document_text.delay") as queued:
            category = DocumentCategory.objects.create(name="Pitch deck", code="pitch")
            with self.captureOnCommitCallbacks(execute=True):
                document = SubmissionDocument.objects.create(
                    category=category, file=SimpleUploadedFile("pitch.pdf", pdf_bytes(), content_type="application/pdf"),
                    original_filename="pitch.pdf", mime_type="application/pdf", uploaded_by=self.officer,
                )
            queued.assert_called_once_with(str(document.id))
            version = extract_for_document(document)
            self.assertEqual((version.text_status, len(version.extracted_pages)), ("ok", 2))
            self.assertIn("Budget", version.extracted_text)
            self.assertIsNotNone(version.text_extracted_at)
            self.assertEqual(DocumentVersion.objects.filter(document=document).count(), 1)
            self.assertEqual(extract_for_document(document).pk, version.pk)  # not read twice


class DraftFormTests(B5TestCase):
    def test_good_document_makes_a_draft(self):
        before = SubmissionForm.objects.count()
        form, errors = create_draft_form_from_document(sample_document(), title="Youth agri entry", actor=self.officer)
        self.assertEqual(errors, [])
        self.assertEqual(SubmissionForm.objects.count(), before + 1)
        self.assertEqual(form.status, SubmissionForm.Status.DRAFT)
        self.assertTrue(form.fields.filter(key="company_name").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="form_draft_created", actor=self.officer, target_id=str(form.id)).exists())

    def test_bad_document_saves_nothing(self):
        before = SubmissionForm.objects.count()
        bad = sample_document()
        bad["steps"][0]["rows"][0]["fields"][0]["type"] = "hologram"
        form, errors = create_draft_form_from_document(bad, title="Broken", actor=self.officer)
        self.assertIsNone(form)
        self.assertTrue(errors and all({"path", "message"} <= set(item) for item in errors))
        self.assertEqual(SubmissionForm.objects.count(), before)
        self.assertEqual(create_draft_form_from_document({"steps": "no"}, title="X", actor=self.officer)[1][0]["path"], "steps")


SPEC = {
    "name": "Agri or general route",
    "stages": [
        {"code": "screening", "name": "Quick check", "who": {"role": "innovation_officer"}, "due_days": 3},
        {"code": "agri_panel", "name": "Agri panel", "kind": "review", "who": {"team": "Agribusiness panel"}, "due_days": 7},
        {"code": "general_review", "name": "Officer review", "who": "innovation_officer"},
    ],
    "approval_steps": [{"code": "sign_off", "name": "Manager sign-off", "who": {"role": "innovation_manager"}}],
    "transitions": [
        {"from": "screening", "decision": "approve", "when": {"==": [{"var": "payload.sector"}, "agriculture"]}, "to": "agri_panel"},
        {"from": "screening", "decision": "approve", "to": "general_review"},
        {"from": "screening", "decision": "reject", "to": "rejected"},
        {"from": "agri_panel", "decision": "approve", "to": "sign_off"},
        {"from": "agri_panel", "decision": "reject", "to": "rejected"},
        {"from": "general_review", "decision": "approve", "to": "sign_off"},
        {"from": "general_review", "decision": "reject", "to": "rejected"},
        {"from": "sign_off", "decision": "approve", "to": "end"},
        {"from": "sign_off", "decision": "reject", "to": "rejected"},
    ],
}


class DraftWorkflowTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")
        ReviewPanel.objects.create(name="Agribusiness panel")

    def test_spec_makes_a_valid_draft_that_is_never_active(self):
        definition, errors = create_draft_workflow_from_spec(SPEC, program=self.program, actor=self.officer)
        self.assertEqual(errors, [])
        self.assertEqual((definition.status, definition.is_active, definition.published_at), (WorkflowDefinition.STATUS_DRAFT, False, None))
        self.assertEqual(list(definition.steps.order_by("order").values_list("code", flat=True)), ["screening", "agri_panel", "general_review", "sign_off"])
        self.assertEqual(definition.nodes.get(code="sign_off").node_type, WorkflowNode.TYPE_APPROVAL_TASK)
        self.assertEqual(definition.steps.get(code="agri_panel").settings_json["who_has_it"]["mode"], "team")
        self.assertTrue(AuditLog.objects.filter(action_type="workflow_draft_created", target_id=str(definition.id)).exists())
        self.assertIn("roles", workflow_catalogue())

    def test_unknown_role_or_team_is_a_path_error_and_nothing_is_saved(self):
        before = WorkflowDefinition.objects.count()
        spec = {**SPEC, "stages": [*SPEC["stages"][:2], {"code": "general_review", "name": "Officer review", "who": {"team": "Finance"}}]}
        _, errors = create_draft_workflow_from_spec(spec, program=self.program, actor=self.officer)
        self.assertIn({"path": "stages[2].who", "message": 'there is no team "Finance"'}, errors)
        spec = {**SPEC, "approval_steps": [{"name": "Sign", "who": {"role": "wizard"}}]}
        self.assertIn({"path": "approval_steps[0].who", "message": 'there is no role "wizard"'}, create_draft_workflow_from_spec(spec, program=self.program, actor=self.officer)[1])
        spec = {**SPEC, "transitions": [{"from": "screening", "to": "space", "when": {"regex": ["a", "b"]}}]}
        paths = {item["path"] for item in create_draft_workflow_from_spec(spec, program=self.program, actor=self.officer)[1]}
        self.assertTrue({"transitions[0].to", "transitions[0].when"} <= paths)
        self.assertEqual(WorkflowDefinition.objects.count(), before)
        self.assertFalse(ReviewPanel.objects.filter(name="Finance").exists())

    def test_validation_problems_save_nothing(self):
        before = WorkflowDefinition.objects.count()
        # general_review has no way out: a dead end the validator refuses.
        spec = {**SPEC, "transitions": [item for item in SPEC["transitions"] if item["from"] != "general_review"]}
        definition, errors = create_draft_workflow_from_spec(spec, program=self.program, actor=self.officer)
        self.assertIsNone(definition)
        self.assertTrue(any("general_review" in item["path"] for item in errors), errors)
        self.assertEqual(WorkflowDefinition.objects.count(), before)

    def test_linear_spec_without_transitions(self):
        definition, errors = create_draft_workflow_from_spec(
            {"name": "Simple", "stages": [{"name": "Check", "who": "innovation_officer"}, {"name": "Decide", "who": "innovation_manager"}]},
            program=self.program, actor=self.officer,
        )
        self.assertEqual(errors, [])
        self.assertEqual(WorkflowDryRunService.run(definition, answers={}, actor=self.officer)["finished"], "end")


class DryRunTests(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")
        ReviewPanel.objects.create(name="Agribusiness panel")
        self.definition, errors = create_draft_workflow_from_spec(SPEC, program=self.program, actor=self.officer)
        assert not errors, errors
        self.client.force_authenticate(self.officer)
        self.url = f"/api/workflow-definitions/{self.definition.id}/dry-run/"

    def counts(self):
        return (WorkflowDefinition.objects.count(), WorkflowNode.objects.count(), WorkflowTransition.objects.count(), WorkflowInstance.objects.count(), Notification.objects.count(), CommunicationLog.objects.count(), AuditLog.objects.count())

    def test_condition_picks_the_branch(self):
        before = self.counts()
        agri = data(self.client.post(self.url, {"answers": {"sector": "agriculture"}}, format="json"))
        self.assertEqual([step["code"] for step in agri["path"]], ["screening", "agri_panel", "sign_off", "end"])
        self.assertEqual(agri["path"][1]["who"], "Agribusiness panel")
        self.assertEqual((agri["problems"], agri["finished"]), ([], "end"))
        other = data(self.client.post(self.url, {"answers": {"sector": "tourism"}}, format="json"))
        self.assertEqual([step["code"] for step in other["path"]], ["screening", "general_review", "sign_off", "end"])
        rejected = data(self.client.post(self.url, {"answers": {"decisions": {"screening": "reject"}}}, format="json"))
        self.assertEqual(rejected["finished"], "rejected")
        self.assertEqual(self.counts(), before)

    def test_dead_end_is_a_problem(self):
        WorkflowTransition.objects.filter(workflow_definition=self.definition, from_node__code="general_review").delete()
        result = WorkflowDryRunService.run(self.definition, answers={"sector": "tourism"}, actor=self.officer)
        self.assertIsNone(result["finished"])
        self.assertTrue(any("Dead end" in problem["message"] and problem["path"] == "general_review" for problem in result["problems"]))

    def test_unknown_decision_and_permission(self):
        self.assertTrue(data(self.client.post(self.url, {"answers": {"decisions": {"screening": "maybe"}}}, format="json"))["problems"])
        self.client.force_authenticate(self.judge if hasattr(self, "judge") else None)
        self.assertIn(self.client.post(self.url, {}, format="json").status_code, (401, 403))


class AILaneNamesTests(B5TestCase):
    """R-68: the names and shapes the AI lane's code calls."""

    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")

    def test_extract_text_with_filename_and_mime_type(self):
        from apps.documents.text import extract_text as read

        result = read(io.BytesIO(pdf_bytes()), filename="deck.pdf", mime_type="")
        self.assertEqual((result.ok, result.error, result.language), (True, "", ""))
        empty = read(io.BytesIO(pdf_bytes(text=False)), filename="scan.pdf")
        self.assertFalse(empty.ok)
        self.assertIn("scan", empty.error)
        self.assertEqual(read(io.BytesIO(b"# Notes"), filename="notes.md").text, "# Notes")

    def test_form_from_form_builder_and_revise_in_place(self):
        from apps.programs.form_builder import create_draft_form_from_document as create

        form, errors = create(document=sample_document(), actor=self.officer, program=self.program)
        self.assertEqual(errors, [])
        self.assertEqual(form.title, "Youth agri challenge entry")
        revised = sample_document()
        revised["steps"] = revised["steps"][:1]
        again, errors = create(document={**revised, "id": str(form.id)}, actor=self.officer)
        self.assertEqual((errors, again.pk), ([], form.pk))
        self.assertFalse(again.fields.filter(key="company_name", is_active=True).exists())
        self.assertEqual(create(document={**revised, "id": "nope"}, actor=self.officer)[1][0]["path"], "id")

    def test_steps_shape_revise_in_place_and_dry_run(self):
        from apps.workflow.services import create_draft_workflow_from_spec as create
        from apps.workflow.services import run_workflow_dry_run

        spec = {
            "name": "AI flow",
            "steps": [
                {"name": "Check", "code": "check", "role_required": "innovation_officer", "actions_allowed": ["approve", "reject"], "due_in_hours": 72},
                {"name": "Decide", "code": "decide", "role_required": "innovation_manager", "actions_allowed": ["approve", "reject"], "submission_status": "shortlisted"},
            ],
        }
        workflow, errors = create(spec=spec, actor=self.officer, program=self.program)
        self.assertEqual(errors, [])
        self.assertEqual(workflow.steps.get(code="decide").submission_status, "shortlisted")
        result = run_workflow_dry_run(workflow=workflow, answers={})
        self.assertEqual([item["step"] for item in result["path"]], ["check", "decide", "end"])
        self.assertTrue(all({"stage", "step", "outcome", "why"} <= set(item) for item in result["path"]))
        self.assertEqual(result["problems"], [])

        spec["steps"] = spec["steps"][:1]
        again, errors = create(spec={**spec, "id": str(workflow.id)}, actor=self.officer)
        self.assertEqual((errors, again.pk), ([], workflow.pk))
        self.assertEqual(list(again.steps.values_list("code", flat=True)), ["check"])
        bad = {**spec, "steps": [{"name": "Who?", "code": "x", "role_required": "wizard", "actions_allowed": ["approve"]}]}
        self.assertIn({"path": "steps[0].who", "message": 'there is no role "wizard"'}, create(spec=bad, actor=self.officer, program=self.program)[1])
