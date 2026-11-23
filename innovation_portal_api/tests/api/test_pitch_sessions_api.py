"""Shortlisting news and pitch session details (23 Nov demo)."""

from datetime import datetime
from zoneinfo import ZoneInfo

from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog, Notification
from apps.core.constants import CommunicationChannel, RoleType, SubmissionStatus, SubmissionType
from apps.programs.models import PitchSession, ProgramStage
from apps.submissions.models import Submission
from apps.workflow.builder import create_from
from apps.workflow.services import WorkflowRuntimeService
from tests.api.test_challenges_b5_api import B5TestCase, data

GABORONE = ZoneInfo("Africa/Gaborone")
SESSION = {
    "starts_at": "2026-11-28T09:00:00+02:00",
    "duration_minutes": 20,
    "format": "in_person",
    "place": {"en": "CEDA House, Gaborone, room 2", "tn": "Ntlo ya CEDA, Gaborone, phaposi 2"},
    "instructions": {"en": "Bring a 5-slide deck.", "tn": ""},
}


class PitchBase(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")
        self.workflow = create_from(name="Panel", program=self.program, from_template="challenge_with_panel", actor=self.officer)
        self.idea = self.entry(self.innovator, "Solar dryer")

    def entry(self, owner, title, *, channel="web", status=SubmissionStatus.UNDER_JUDGING, phone=""):
        count = Submission.objects.count() + 1
        return Submission.objects.create(
            reference_number=f"PITCH-{count:04d}", program=self.program, innovator=owner, submission_type=SubmissionType.IDEA,
            title=title, submitted_at=timezone.now(), current_status=status, channel=channel, guest_phone=phone,
        )

    def shortlist(self, idea):
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService._sync_submission(idea, status_value=SubmissionStatus.SHORTLISTED, locked=True)
        idea.refresh_from_db()

    def final_step(self):
        return self.workflow.steps.get(code="final_decision")

    def as_innovator(self, user=None):
        self.client.force_authenticate(user or self.innovator)
        return self.client


class ShortlistTests(PitchBase):
    def test_shortlist_sets_status_and_tells_the_person_once(self):
        self.shortlist(self.idea)
        self.assertEqual(self.idea.current_status, SubmissionStatus.SHORTLISTED)
        notes = Notification.objects.filter(recipient=self.innovator, notification_type="idea_shortlisted")
        self.assertEqual(notes.count(), 1)
        self.assertIn("shortlist", notes.first().body)
        self.assertTrue(CommunicationLog.objects.filter(recipient=self.innovator, channel=CommunicationChannel.EMAIL).exists())
        self.assertFalse(CommunicationLog.objects.filter(channel=CommunicationChannel.WHATSAPP).exists())  # came from the website
        # Moving within the shortlist (finalist) does not send it again.
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService._sync_submission(self.idea, status_value=SubmissionStatus.FINALIST, locked=True)
        self.assertEqual(Notification.objects.filter(notification_type="idea_shortlisted").count(), 1)
        self.assertTrue(AuditLog.objects.filter(action_type="shortlist_notification_sent", target_id=str(self.idea.id)).exists())

    def test_real_workflow_approve_into_the_shortlist_step(self):
        from apps.workflow.services import WorkflowDefinitionService

        steps = [
            {"name": "Review", "code": "review", "order": 1, "role_required": RoleType.INNOVATION_OFFICER, "submission_status": SubmissionStatus.UNDER_REVIEW, "actions_allowed": ["approve", "reject"]},
            {"name": "Shortlist", "code": "shortlist", "order": 2, "role_required": RoleType.INNOVATION_OFFICER, "submission_status": SubmissionStatus.SHORTLISTED, "actions_allowed": ["approve", "reject"]},
        ]
        WorkflowDefinitionService.create_definition(program=self.program, name="Real path", actor=self.officer, steps_data=steps, activate=True)
        idea = self.entry(self.innovator, "Through the workflow", status=SubmissionStatus.SUBMITTED)
        WorkflowRuntimeService.start_workflow(idea, self.officer)
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService.perform_action(submission=idea, actor=self.officer, action="approve", comment="Strong idea.")
        idea.refresh_from_db()
        self.assertEqual(idea.current_status, SubmissionStatus.SHORTLISTED)
        self.assertTrue(idea.outcomes.filter(is_current=True, outcome_type="shortlisted").exists())
        self.assertEqual(Notification.objects.filter(recipient=self.innovator, notification_type="idea_shortlisted", body__contains="Through the workflow").count(), 1)
        row = next(item for item in data(self.as_innovator().get("/api/me/ideas/"))["results"] if item["id"] == str(idea.id))
        self.assertEqual((row["status"], row["shortlisted"]), ("shortlisted", True))

    def test_whatsapp_only_when_the_idea_came_from_whatsapp(self):
        phone_person = User.objects.create_user(email=None, password=None, first_name="Mpho", phone_number="+26771234567", phone_verified=True)
        RoleService.assign_roles(phone_person, [RoleType.INNOVATOR])
        idea = self.entry(phone_person, "Goat milk", channel="whatsapp")
        self.shortlist(idea)
        sent = CommunicationLog.objects.filter(channel=CommunicationChannel.WHATSAPP, related_submission=idea)
        self.assertEqual(sent.count(), 1)
        self.assertEqual(sent.first().to_address, "+26771234567")

    def test_innovator_api_says_shortlisted_without_a_made_up_date(self):
        self.shortlist(self.idea)
        ideas = data(self.as_innovator().get("/api/me/ideas/"))["results"]
        row = next(item for item in ideas if item["id"] == str(self.idea.id))
        self.assertEqual((row["shortlisted"], row["pitch_session"]), (True, None))
        tracking = data(self.client.get(f"/api/me/ideas/{self.idea.id}/tracking/"))
        self.assertEqual((tracking["shortlisted"], tracking["pitch_session"]), (True, None))


class PitchSessionTests(PitchBase):
    def set_stage(self, body):
        self.client.force_authenticate(self.officer)
        return self.client.patch(f"/api/programs/{self.program.id}/stages/{self.final_step().id}/", {"pitch": body}, format="json")

    def test_stage_session_saves_audits_and_reaches_the_innovator_in_gaborone_time(self):
        self.shortlist(self.idea)
        instance = self.idea
        response = self.set_stage(SESSION)
        self.assertEqual(response.status_code, 200, response.content)
        pitch = data(response)["pitch"]
        self.assertEqual((pitch["starts_at"], pitch["time"], pitch["timezone"]), ("2026-11-28T07:00:00Z", "09:00", "Africa/Gaborone"))
        stored = PitchSession.objects.get(stage__program=self.program)
        self.assertEqual(stored.starts_at, datetime(2026, 11, 28, 7, 0, tzinfo=ZoneInfo("UTC")))
        self.assertTrue(AuditLog.objects.filter(action_type="pitch_session_set", target_id=str(self.program.id)).exists())

        # The final step's stage is "shortlisted only", so shortlisted ideas see it wherever they are.
        ProgramStage.objects.filter(pitch_session=stored).update(takes_part="shortlisted")
        self.client.force_authenticate(self.innovator)
        row = next(item for item in data(self.client.get("/api/me/ideas/?lang=tn"))["results"] if item["id"] == str(instance.id))
        self.assertEqual(row["pitch_session"]["date"], "2026-11-28")
        self.assertEqual(row["pitch_session"]["time"], "09:00")
        self.assertEqual(row["pitch_session"]["place"], "Ntlo ya CEDA, Gaborone, phaposi 2")
        self.assertEqual(row["pitch_session"]["instructions"], "Bring a 5-slide deck.")  # English when Setswana is empty
        summary = data(self.client.get("/api/me/summary/"))
        self.assertEqual(summary["active_idea"]["pitch_session"]["time"], "09:00")

        # Changing it tells the person.
        before = Notification.objects.filter(notification_type="pitch_session").count()
        with self.captureOnCommitCallbacks(execute=True):
            self.set_stage({**SESSION, "starts_at": "2026-11-28T11:30"})  # no zone: Gaborone time
        self.assertEqual(Notification.objects.filter(notification_type="pitch_session").count(), before + 1)
        self.assertIn("11:30", Notification.objects.filter(notification_type="pitch_session").latest("created_at").body)

    def test_idea_session_and_privacy(self):
        self.shortlist(self.idea)
        other = User.objects.create_user(email="pitch-other@example.com", password="StrongPass123", first_name="Lesedi")
        RoleService.assign_roles(other, [RoleType.INNOVATOR])
        others_idea = self.entry(other, "Other idea")
        self.shortlist(others_idea)
        self.client.force_authenticate(self.officer)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.put(f"/api/programs/{self.program.id}/entries/{self.idea.id}/pitch/", {**SESSION, "format": "online", "meeting_link": "https://meet.example.com/ceda"}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(Notification.objects.filter(recipient=self.innovator, notification_type="pitch_session").exists())
        self.assertFalse(Notification.objects.filter(recipient=other, notification_type="pitch_session").exists())

        mine = data(self.as_innovator().get(f"/api/me/ideas/{self.idea.id}/tracking/"))
        self.assertEqual((mine["pitch_session"]["format"], mine["pitch_session"]["meeting_link"]), ("online", "https://meet.example.com/ceda"))
        theirs = data(self.as_innovator(other).get(f"/api/me/ideas/{others_idea.id}/tracking/"))
        self.assertIsNone(theirs["pitch_session"])
        self.assertEqual(self.as_innovator(other).get(f"/api/me/ideas/{self.idea.id}/tracking/").status_code, 404)
        self.assertEqual(self.as_innovator().get(f"/api/programs/{self.program.id}/entries/{self.idea.id}/pitch/").status_code, 403)

    def test_bad_details_are_refused(self):
        for body, field in (({**SESSION, "starts_at": "soon"}, "starts_at"), ({**SESSION, "format": "online"}, "meeting_link"),
                            ({**SESSION, "place": {"en": ""}}, "place"), ({**SESSION, "duration_minutes": 0}, "duration_minutes")):
            response = self.set_stage(body)
            self.assertEqual(response.status_code, 400, body)
            self.assertIn(field, response.content.decode(), body)
        self.assertFalse(PitchSession.objects.exists())

    def test_own_session_shows_before_shortlisting(self):
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.put(f"/api/programs/{self.program.id}/entries/{self.idea.id}/pitch/", SESSION, format="json").status_code, 200)
        row = next(item for item in data(self.as_innovator().get("/api/me/ideas/"))["results"] if item["id"] == str(self.idea.id))
        self.assertEqual((row["shortlisted"], row["pitch_session"]["time"]), (False, "09:00"))

    def test_not_shortlisted_sees_no_session(self):
        self.set_stage(SESSION)
        ProgramStage.objects.update(takes_part="shortlisted")
        row = next(item for item in data(self.as_innovator().get("/api/me/ideas/"))["results"] if item["id"] == str(self.idea.id))
        self.assertEqual((row["shortlisted"], row["pitch_session"]), (False, None))


class SeedTests(PitchBase):
    def test_seed_gives_demo_innovators_a_session_and_leaves_real_people_alone(self):
        from io import StringIO

        from django.core.management import call_command

        demo = User.objects.create_user(email="demo-innovator@example.com", password=None, first_name="Demo", is_demo_account=True)
        RoleService.assign_roles(demo, [RoleType.INNOVATOR])
        call_command("seed_pitch_demo", stdout=StringIO())
        call_command("seed_pitch_demo", stdout=StringIO())  # again: no second idea
        ideas = Submission.objects.filter(innovator=demo)
        self.assertEqual(ideas.count(), 1)
        idea = ideas.first()
        self.assertEqual(idea.current_status, SubmissionStatus.SHORTLISTED)
        self.assertEqual(PitchSession.objects.get(submission=idea).starts_at.astimezone(GABORONE).strftime("%H:%M"), "10:00")
        self.idea.refresh_from_db()
        self.assertEqual(self.idea.current_status, SubmissionStatus.UNDER_JUDGING)  # a real person's idea is untouched
