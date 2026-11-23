"""R-83: the AI helper reads files uploaded on the idea form (MediaAsset references in the answers)."""

from django.core.files.uploadedfile import SimpleUploadedFile

from apps.assistant.models import DocumentReview
from apps.audit.models import AuditLog
from apps.core.constants import RoleType
from apps.documents.models import DocumentCategory, SubmissionDocument
from apps.media_library.models import MediaAsset
from apps.submissions.intake import DraftTokenService
from apps.submissions.models import SubmissionResponse
from tests.api.test_assistant_api import BASE, DRAFT_ANSWER, AssistantTestCase, data, message

REVIEW = {"language": "en", "file_language": "en", "summary": "A cost sheet.", "key_points": [{"text": "P4.20 a pack", "page": 1}], "missing": ["Selling price"]}


class FormUploadReviewTests(AssistantTestCase):
    def setUp(self):
        super().setUp()
        self.fake(message(REVIEW))
        self.switch_on()

    def asset(self, owner=None, text="Page one says each pack costs P4.20 to make.", name="costs.txt"):
        return MediaAsset.objects.create(
            kind="document", file=SimpleUploadedFile(name, text.encode()), original_filename=name, mime_type="text/plain",
            size_bytes=len(text), sha256="sha-" + name, uploaded_by=owner,
        )

    def answer(self, asset):
        return {"id": str(asset.pk), "filename": asset.original_filename, "kind": "document", "url": f"/media/{asset.pk}"}

    def review(self, asset_or_id, **headers):
        return self.client.post(f"{BASE}/documents/{getattr(asset_or_id, 'pk', asset_or_id)}/review/", {}, format="json", **headers)

    def test_owner_draft_and_cache(self):
        asset = self.asset(self.innovator)
        self.draft(self.innovator, plan=[self.answer(asset)])
        self.as_user(self.innovator)
        first = data(self.review(asset))
        self.assertEqual((first["summary"], first["document"]["name"], first["cached"]), ("A cost sheet.", "costs.txt", False))
        self.assertTrue(data(self.review(asset))["cached"])
        row = DocumentReview.objects.get()
        self.assertEqual((row.media_asset_id, row.document_id), (asset.pk, None))
        # Audited like a SubmissionDocument review: the usage audit names the file.
        self.assertTrue(AuditLog.objects.filter(target_model="UsageRecord", metadata__target=f"media:{asset.pk}").exists())

    def test_guest_with_the_resume_token(self):
        asset = self.asset()
        draft = self.draft(None, plan=self.answer(asset))
        self.client.force_authenticate(None)
        self.assertEqual(self.review(asset).status_code, 404)
        response = self.review(asset, HTTP_X_DRAFT_TOKEN=DraftTokenService.issue(draft))
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(data(response)["summary"], "A cost sheet.")

    def test_other_people_and_unattached_assets_get_404(self):
        asset = self.asset(self.innovator)
        self.draft(self.innovator, plan=self.answer(asset))
        self.as_user(self.other_innovator)
        self.assertEqual(self.review(asset).status_code, 404)
        loose = self.asset(self.innovator, name="loose.txt")  # uploaded by them, but in no answers
        self.as_user(self.innovator)
        self.assertEqual(self.review(loose).status_code, 404)
        self.assertEqual(self.review("not-an-id").status_code, 404)

    def test_sent_idea_owner_and_staff_with_and_without_access(self):
        asset = self.asset(self.innovator)
        submission = self.idea("Snacks", owner=self.innovator)
        SubmissionResponse.objects.create(submission=submission, field_key_snapshot="plan", field_label_snapshot="Plan", field_type_snapshot="file", value=[self.answer(asset)])
        self.as_user(self.innovator)
        self.assertEqual(self.review(asset).status_code, 200)
        self.as_user(self.officer)
        self.assertEqual(self.review(asset).status_code, 200)
        judge = self.person("r83-judge@example.com", RoleType.JUDGE)
        self.as_user(judge)  # not assigned to this idea
        self.assertEqual(self.review(asset).status_code, 404)

    def test_cache_rows_never_collide_and_documents_still_work(self):
        category = DocumentCategory.objects.first() or DocumentCategory.objects.create(name="Supporting", code="supporting")
        submission = self.idea("Snacks", owner=self.innovator)
        document = SubmissionDocument.objects.create(
            submission=submission, category=category, file=SimpleUploadedFile("plan.txt", b"Page one says each pack costs P4.20."),
            original_filename="plan.txt", mime_type="text/plain", size_bytes=10, sha256="abc",
        )
        asset = self.asset(self.innovator)
        SubmissionResponse.objects.create(submission=submission, field_key_snapshot="plan", field_label_snapshot="Plan", field_type_snapshot="file", value=self.answer(asset))
        self.as_user(self.innovator)
        self.assertEqual(data(self.review(document))["document"]["name"], "plan.txt")
        self.assertEqual(data(self.review(asset))["document"]["name"], "costs.txt")
        self.assertEqual(DocumentReview.objects.filter(document=document).count(), 1)
        self.assertEqual(DocumentReview.objects.filter(media_asset=asset).count(), 1)

    def test_draft_check_lists_form_uploads(self):
        asset = self.asset(self.innovator)
        fake = self.fake(lambda kwargs: message({**DRAFT_ANSWER, "files": [{"document_id": str(asset.pk), "covers": "Costs.", "key_points": [], "missing": []}]}))
        draft = self.draft(self.innovator, plan=self.answer(asset))
        self.as_user(self.innovator)
        result = data(self.draft_check(draft))
        self.assertIn("each pack costs P4.20", fake.last["messages"][0]["content"])
        self.assertEqual((result["files"][0]["document_id"], result["files"][0]["name"]), (str(asset.pk), "costs.txt"))
