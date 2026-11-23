"""2.1 (23 Nov): the signed-in home's messages come from real data, most urgent first."""
from datetime import timedelta

from django.test import TestCase
from django.utils import timezone

from apps.communications.models import Message, MessageThread
from apps.core.constants import SubmissionStatus
from apps.submissions.models import ReturnRequest, SubmissionStatusHistory
from apps.workflow.models import WorkflowInstance
from tests.api.test_innovator_dashboard_api import DashboardFixtureMixin, make_user


class HomeMessagesApiTests(DashboardFixtureMixin, TestCase):
    def messages(self):
        return self.client.get("/api/me/summary/").json()["data"]["messages"]

    def test_nothing_to_say_is_an_empty_list(self):
        self.assertEqual(self.messages(), [])

    def test_changes_requested_comes_first_with_the_officer_note(self):
        self.draft("Unfinished", percent=40)
        officer = make_user("kago.officer@example.com")
        officer.first_name, officer.last_name = "Kago", "Tau"
        officer.save()
        sub = self.submission("Mopane snacks", SubmissionStatus.RETURNED, due_at=timezone.now() + timedelta(days=5))
        ReturnRequest.objects.create(submission=sub, step_name="Officer review", reason="Please add your supplier quote.", fix_by=timezone.localdate() + timedelta(days=5), requested_by=officer)

        first = self.messages()[0]
        self.assertEqual(first["type"], "changes_requested")
        self.assertEqual(first["idea_id"], str(sub.id))
        self.assertEqual(first["note"], "Please add your supplier quote.")
        self.assertEqual(first["officer"], "Kago T.")
        self.assertEqual([m["type"] for m in self.messages()], ["changes_requested", "draft"])

    def test_open_question_offers_a_reply(self):
        sub = self.submission("Hair salon booking", SubmissionStatus.UNDER_REVIEW)
        officer = make_user("lorato.officer@example.com")
        officer.first_name = "Lorato"
        officer.save()
        thread = MessageThread.objects.create(submission=sub)
        question = Message.objects.create(thread=thread, author=officer, author_role="officer", body="Who supplies your packaging?", reply_by=timezone.localdate() + timedelta(days=4))
        thread.open_question = question
        thread.save()

        first = self.messages()[0]
        self.assertEqual(first["type"], "question")
        self.assertEqual(first["officer_first_name"], "Lorato")
        self.assertEqual(first["excerpt"], "Who supplies your packaging?")

    def test_draft_says_how_far_it_got(self):
        draft = self.draft("Solar dryer", percent=60)
        first = self.messages()[0]
        self.assertEqual((first["type"], first["kind"], first["idea_id"], first["percent_complete"]), ("draft", "draft", str(draft.id), 60))

    def test_shortlisted_and_a_recent_stage_move(self):
        short = self.submission("Shortlisted idea", SubmissionStatus.SHORTLISTED)
        SubmissionStatusHistory.objects.create(submission=short, from_status="under_review", to_status="shortlisted")
        moved = self.submission("Moved idea", SubmissionStatus.UNDER_REVIEW)
        SubmissionStatusHistory.objects.create(submission=moved, from_status="screening", to_status="under_review")
        old = self.submission("Old move", SubmissionStatus.UNDER_REVIEW)
        row = SubmissionStatusHistory.objects.create(submission=old, from_status="screening", to_status="under_review")
        SubmissionStatusHistory.objects.filter(pk=row.pk).update(created_at=timezone.now() - timedelta(days=30))

        got = [(m["type"], m["idea_id"]) for m in self.messages()]
        self.assertEqual(got, [("shortlisted", str(short.id)), ("stage_moved", str(moved.id))])
        self.assertEqual(self.messages()[1]["status"], "under_review")  # the screen words it from the status code

    def test_upcoming_event_of_a_challenge_i_entered(self):
        program = self.challenge("Agribusiness Value-Add", self.sectors[:1])
        program.event_date = timezone.now() + timedelta(days=9)
        program.save()
        past = self.challenge("Past event", self.sectors[:1])
        past.event_date = timezone.now() - timedelta(days=1)
        past.save()
        for p in (program, past):
            sub = self.submission(f"Entry for {p.title}", SubmissionStatus.UNDER_REVIEW)
            sub.program = p
            sub.save()

        events = [m for m in self.messages() if m["type"] == "event"]
        self.assertEqual([m["challenge"] for m in events], ["Agribusiness Value-Add"])

    def test_finished_ideas_and_other_peoples_ideas_say_nothing(self):
        done = self.submission("Approved idea", SubmissionStatus.APPROVED)
        WorkflowInstance.objects.filter(submission=done).delete()
        other = make_user("someone.else@example.com")
        self.client.force_authenticate(other)
        self.assertEqual(self.messages(), [])
