"""B3: two-way messages, reply-by questions, reminders; R-5 c/d, R-7, R-8, R-16."""

from datetime import timedelta
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.communications.messaging import send_question_reminders
from apps.communications.models import Message, Notification
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionStatus, SubmissionType
from apps.media_library.models import MediaAsset
from apps.media_library.validation import detect_file
from apps.programs.models import Program, ProgramType
from apps.submissions.models import Submission, SubmissionInternalNote


def data(response):
    return response.json()["data"]


class MessagesTestCase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="b3-officer@example.com", password="StrongPass123", first_name="Kago", last_name="Tau")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.applicant = User.objects.create_user(email="b3-applicant@example.com", password="StrongPass123", first_name="Neo", last_name="K")
        RoleService.assign_roles(self.applicant, [RoleType.INNOVATOR])
        self.stranger = User.objects.create_user(email="b3-stranger@example.com", password="StrongPass123")
        RoleService.assign_roles(self.stranger, [RoleType.INNOVATOR])
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea"})
        now = timezone.now()
        self.program = Program.objects.create(
            title="Ideas", slug="ideas-b3", description="x", program_type=program_type, owner=self.officer,
            opening_date=now - timedelta(days=1), closing_date=now + timedelta(days=30), status="published",
        )
        self.submission = Submission.objects.create(
            reference_number="CEDA-IP-2026-00077", program=self.program, innovator=self.applicant, submission_type=SubmissionType.IDEA,
            title="Solar cooler", current_status=SubmissionStatus.SCREENING, submitted_at=now,
        )

    def ask(self, body="Please send a photo of the prototype.", reply_in=5, **extra):
        self.client.force_authenticate(self.officer)
        payload = {"body": body, **extra}
        if reply_in is not None:
            payload["reply_by"] = (timezone.localdate() + timedelta(days=reply_in)).isoformat()
        response = self.client.post(f"/api/submissions/{self.submission.id}/messages/", payload, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)


class ThreadAccessTests(MessagesTestCase):
    def test_applicant_cannot_read_another_persons_thread_and_notes_never_show(self):
        self.ask()
        SubmissionInternalNote.objects.create(submission=self.submission, author=self.officer, note="Weak business case, keep internal")
        self.client.force_authenticate(self.stranger)
        self.assertEqual(self.client.get(f"/api/me/ideas/{self.submission.id}/messages/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"body": "hi"}, format="json").status_code, 404)
        self.assertEqual(self.client.get(f"/api/submissions/{self.submission.id}/messages/").status_code, 403)

        self.client.force_authenticate(self.applicant)
        response = self.client.get(f"/api/me/ideas/{self.submission.id}/messages/")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("Weak business case", response.content.decode())
        thread = data(response)
        self.assertEqual(thread["results"][0]["author"], {"name": "Kago T.", "role": "Innovation officer", "label": "Kago T., Innovation officer"})
        self.client.force_authenticate(self.officer)
        self.assertNotIn("Weak business case", self.client.get(f"/api/submissions/{self.submission.id}/messages/").content.decode())


class QuestionFlowTests(MessagesTestCase):
    def test_question_notifies_shows_as_next_action_and_reply_clears_it(self):
        asked = self.ask()
        self.assertTrue(asked["is_question"])
        note = Notification.objects.get(recipient=self.applicant, notification_type="officer_message")
        self.assertEqual((note.link_type, note.link_id), ("idea", str(self.submission.id)))
        self.assertIsNotNone(note.due_at)

        self.client.force_authenticate(self.applicant)
        summary = data(self.client.get("/api/me/summary/"))
        self.assertEqual(summary["next_action"]["type"], "answer_question")
        self.assertEqual(summary["next_action"]["open_question"]["officer_first_name"], "Kago")
        self.assertEqual(summary["active_idea"]["unread_messages"], 1)
        self.assertEqual(summary["active_idea"]["unread_updates"], 1)
        self.assertEqual(summary["active_idea"]["status"], SubmissionStatus.SCREENING)

        recent = data(self.client.get("/api/me/messages/recent/"))
        self.assertEqual(recent["total_unread"], 1)
        self.assertTrue(recent["results"][0]["has_open_question"])
        self.assertEqual(data(self.client.post(f"/api/me/ideas/{self.submission.id}/messages/read/", {}, format="json"))["updated"], 1)

        reply = self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"body": "Photo attached tomorrow."}, format="json")
        self.assertEqual(reply.status_code, 201)
        self.assertIsNone(data(self.client.get(f"/api/me/ideas/{self.submission.id}/messages/"))["open_question"])
        self.assertIsNotNone(Message.objects.get(id=asked["id"]).answered_at)
        self.assertTrue(Notification.objects.filter(recipient=self.officer, notification_type="applicant_reply").exists())
        self.assertNotEqual(data(self.client.get("/api/me/summary/"))["next_action"], {"type": "answer_question"})

    def test_question_moves_the_submission_when_the_workflow_allows_and_reply_sends_it_back(self):
        with patch("apps.workflow.services.WorkflowRuntimeService.perform_action") as perform, patch(
            "apps.communications.messaging.MessagingService._send_back"
        ) as send_back:
            from apps.workflow.models import WorkflowDefinition, WorkflowInstance, WorkflowStep

            definition = WorkflowDefinition.objects.create(name="wf", program=self.program, status="active", is_active=True)
            step = WorkflowStep.objects.create(workflow_definition=definition, name="Screening", code="screening", order=1)
            WorkflowInstance.objects.create(submission=self.submission, workflow_definition=definition, current_step=step, status=WorkflowInstance.STATUS_IN_PROGRESS)
            self.submission.refresh_from_db()
            self.ask()
            perform.assert_called_once()
            self.assertEqual(perform.call_args.kwargs["action"], "return")
            self.client.force_authenticate(self.applicant)
            self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"body": "Done"}, format="json")
            send_back.assert_called_once()

    def test_question_needs_a_future_date_and_a_plain_message_is_not_a_question(self):
        self.client.force_authenticate(self.officer)
        past = (timezone.localdate() - timedelta(days=1)).isoformat()
        self.assertEqual(self.client.post(f"/api/submissions/{self.submission.id}/messages/", {"body": "x", "reply_by": past}, format="json").status_code, 400)
        message = self.ask(reply_in=None, body="Thanks, we got it.")
        self.assertFalse(message["is_question"])
        self.client.force_authenticate(self.applicant)
        self.assertIsNone(data(self.client.get(f"/api/me/ideas/{self.submission.id}/messages/"))["open_question"])


class AttachmentTests(MessagesTestCase):
    def test_attachments_must_belong_to_the_sender(self):
        mine = MediaAsset.objects.create(kind="audio", file="media/voice.webm", mime_type="audio/webm", uploaded_by=self.applicant, duration_seconds=12)
        theirs = MediaAsset.objects.create(kind="image", file="media/x.png", mime_type="image/png", uploaded_by=self.stranger)
        self.client.force_authenticate(self.applicant)
        bad = self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"attachments": [str(theirs.id)]}, format="json")
        self.assertEqual(bad.status_code, 400)
        good = self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"attachments": [str(mine.id)]}, format="json")
        self.assertEqual(good.status_code, 201, good.content)
        self.assertEqual(data(good)["attachments"][0]["kind"], "audio")
        self.assertEqual(self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"body": ""}, format="json").status_code, 400)

    def test_webm_voice_notes_are_audio(self):
        header = b"\x1a\x45\xdf\xa3" + b"\x00" * 60
        voice = SimpleUploadedFile("voice.webm", header, content_type="audio/webm;codecs=opus")
        self.assertEqual(detect_file(voice).kind, "audio")
        clip = SimpleUploadedFile("clip.webm", header, content_type="video/webm")
        self.assertEqual(detect_file(clip).kind, "video")
        asked = SimpleUploadedFile("note.webm", header, content_type="application/octet-stream")
        self.assertEqual(detect_file(asked, expected_kind="audio").kind, "audio")


class ReminderTests(MessagesTestCase):
    def test_reminders_two_days_before_and_overdue_flags_once(self):
        soon = Message.objects.get(id=self.ask(reply_in=2)["id"])
        other = Submission.objects.create(reference_number="CEDA-IP-2026-00078", program=self.program, innovator=self.applicant, submission_type=SubmissionType.IDEA, title="Other", submitted_at=timezone.now())
        self.submission = other
        later = Message.objects.get(id=self.ask(reply_in=3)["id"])
        result = send_question_reminders()
        self.assertEqual(result, {"reminded": 1, "flagged": 0})
        soon.refresh_from_db()
        later.refresh_from_db()
        self.assertIsNotNone(soon.reminder_sent_at)
        self.assertIsNone(later.reminder_sent_at)
        self.assertEqual(send_question_reminders(), {"reminded": 0, "flagged": 0})

        overdue_day = timezone.localdate() + timedelta(days=4)
        self.assertEqual(send_question_reminders(today=overdue_day), {"reminded": 0, "flagged": 2})
        self.assertTrue(Notification.objects.filter(recipient=self.officer, notification_type="question_overdue").exists())
        self.assertEqual(send_question_reminders(today=overdue_day), {"reminded": 0, "flagged": 0})

    def test_answered_questions_are_not_reminded(self):
        question = Message.objects.get(id=self.ask(reply_in=2)["id"])
        self.client.force_authenticate(self.applicant)
        self.client.post(f"/api/me/ideas/{self.submission.id}/messages/", {"body": "Here it is"}, format="json")
        self.assertEqual(send_question_reminders(), {"reminded": 0, "flagged": 0})
        question.refresh_from_db()
        self.assertIsNone(question.reminder_sent_at)


class NotificationCategoryTests(MessagesTestCase):
    def test_category_link_due_and_filter(self):
        self.ask()
        Notification.objects.create(recipient=self.applicant, notification_type="new_challenge", title="New call", body="x")
        Notification.objects.create(recipient=self.applicant, notification_type="news", title="News", body="x")
        self.client.force_authenticate(self.applicant)
        items = data(self.client.get("/api/notifications/"))
        by_title = {item["title"]: item for item in items}
        question = by_title["CEDA asked you a question"]
        self.assertEqual((question["category"], question["link"]["type"]), ("ideas", "idea"))
        self.assertIsNotNone(question["due_at"])
        self.assertEqual(by_title["New call"]["category"], "challenges")
        self.assertEqual([item["title"] for item in data(self.client.get("/api/notifications/?category=challenges"))], ["New call"])
        self.assertEqual([item["title"] for item in data(self.client.get("/api/notifications/?category=news"))], ["News"])
        self.assertEqual([item["title"] for item in data(self.client.get("/api/notifications/?category=ideas"))], ["CEDA asked you a question"])
        self.assertEqual(self.client.get("/api/notifications/?category=spam").status_code, 400)

    def test_idea_cards_carry_raw_status(self):
        self.client.force_authenticate(self.applicant)
        items = data(self.client.get("/api/me/ideas/"))["results"]
        self.assertEqual(items[0]["status"], SubmissionStatus.SCREENING)
