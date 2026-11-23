"""Reopening drafts and responding to changes: a draft opens where the person stopped with every answer and file
kept; a sent idea changes only through "Respond to changes", which shows the form as sent and resends through the
workflow (#103)."""
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.core.constants import SubmissionStatus
from apps.programs.general_idea import GeneralIdeaProgram, ensure_published_version
from apps.submissions.models import ApplicationDraft
from tests.api import test_innovator_tracking_api as tracking
from tests.api.test_innovator_tracking_api import TrackingBase, data


class ReopenDraftTests(TrackingBase):
    def setUp(self):
        super().setUp()
        self.innovator.email_verified = True
        self.innovator.save(update_fields=["email_verified"])
        self.client.force_authenticate(self.innovator)
        self.general = GeneralIdeaProgram.get()
        created = self.client.post("/api/drafts/", {"title": "Cold rooms for farmers", "program": str(self.general.id)}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.draft_id = created.json().get("data", created.json())["id"]

    def step(self, code, answers):
        response = self.client.put(f"/api/drafts/{self.draft_id}/steps/{code}/", {"answers": answers}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def draft(self):
        body = self.client.get(f"/api/drafts/{self.draft_id}/").json()
        return body.get("data", body)

    def test_a_draft_reopens_at_the_step_the_person_moved_to_with_every_answer_and_file_kept(self):
        # Step 1 answered, including an uploaded file kept with the answers.
        upload = self.client.post(f"/api/documents/drafts/{self.draft_id}/documents/", {"file": SimpleUploadedFile("plan.pdf", b"%PDF-1.4 plan")}, format="multipart")
        self.assertEqual(upload.status_code, 201, upload.content)
        idea = {"problem": "Milk spoils before market.", "solution": "Shared solar cold rooms.", "who_benefits": "Ten farmers"}
        self.step("your-idea", idea)
        # Moving on records the new step even with nothing typed on it (IdeaForm saves the step it moves to).
        self.step("about-you", {})
        reopened = self.draft()
        self.assertEqual(reopened["current_section_code"], "about-you")
        for key, value in idea.items():
            self.assertEqual(reopened["draft_data"][key], value)
        # A refresh (another read) gives the same, and a later step's save does not drop earlier answers.
        self.step("about-you", {"first_name": "Neo"})
        again = self.draft()
        self.assertEqual((again["current_section_code"], again["draft_data"]["problem"], again["draft_data"]["first_name"]), ("about-you", idea["problem"], "Neo"))
        files = self.client.get(f"/api/documents/drafts/{self.draft_id}/documents/")
        self.assertIn("plan.pdf", files.content.decode())

    def test_a_sent_idea_cannot_be_edited_as_a_draft(self):
        self.step("your-idea", {"problem": "Milk spoils.", "solution": "Cold rooms."})
        self.step("about-you", {"first_name": "Neo", "last_name": "Molefe"})
        sent = self.client.post(f"/api/drafts/{self.draft_id}/submit/", {"consent": True}, format="json")
        self.assertIn(sent.status_code, (200, 201), sent.content)
        refused = self.client.put(f"/api/drafts/{self.draft_id}/steps/your-idea/", {"answers": {"problem": "Changed"}}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("draft_sent", refused.content.decode())
        self.assertEqual(ApplicationDraft.objects.get(id=self.draft_id).draft_data["problem"], "Milk spoils.")

    def test_my_ideas_and_home_say_which_challenge_a_draft_is_for(self):
        ensure_published_version(self.program.form)
        self.program.status = "published"
        self.program.save(update_fields=["status"])
        entry = self.client.post("/api/drafts/", {"title": "Mopane entry", "program": str(self.program.id)}, format="json")
        self.assertEqual(entry.status_code, 201, entry.content)
        listed = {r["title"]: r for r in data(self.client.get("/api/me/ideas/?filter=drafts"))["results"]}
        self.assertEqual(listed["Mopane entry"]["program"]["slug"], "track-challenge")
        self.assertTrue(listed["Cold rooms for farmers"]["program"]["is_general_intake"])
        summary = data(self.client.get("/api/me/summary/"))
        self.assertEqual(summary["next_action"]["type"], "finish_draft")
        self.assertIn("slug", summary["next_action"]["program"])


class RespondToChangesTests(TrackingBase):
    send_back = tracking.ReturnedForChangesTests.send_back

    def test_changes_mode_shows_the_form_as_sent_with_the_notes_and_resends_through_the_workflow(self):
        ensure_published_version(self.program.form)
        sub = self.submit()
        self.assertEqual(self.send_back(sub, items=[{"kind": "answer", "field_key": "price", "label": "Give the real price"}]).status_code, 201)
        self.client.force_authenticate(self.innovator)
        returned = data(self.client.get(f"/api/me/ideas/{sub.id}/tracking/"))["returned"]
        # The notes, the whole form as sent and every answer, so the page can show it all and open only "price".
        self.assertEqual(returned["reason"], "Your idea is strong, but we need real costs before the panel.")
        keys = [f["key"] for step in returned["form"]["steps"] for row in step["rows"] for f in row["fields"]] + [f["key"] for f in returned["form"]["loose_fields"]]
        self.assertEqual(sorted(keys), ["district", "idea", "price"])
        self.assertEqual(returned["sent_answers"], {"idea": "Dry mopane in the sun", "price": "P10", "district": "Central"})
        self.assertEqual([f["key"] for f in returned["fields"]], ["price"])
        # Only the flagged question can change.
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"idea": "Changed"}}, format="json").status_code, 400)
        sent = self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P2.40"}}, format="json")
        self.assertEqual(sent.status_code, 200, sent.content)
        sub.refresh_from_db()
        self.assertNotEqual(sub.current_status, SubmissionStatus.RETURNED)
        self.assertEqual(sub.workflow_instance.status, "in_progress")
        self.assertEqual(sub.responses.get(field_key_snapshot="idea").value, "Dry mopane in the sun")
        # Not waiting any more: nothing more can change.
        self.assertIsNone(data(self.client.get(f"/api/me/ideas/{sub.id}/tracking/"))["returned"])
        self.assertEqual(self.client.post(f"/api/me/ideas/{sub.id}/resend/", {"answers": {"price": "P3"}}, format="json").status_code, 400)
