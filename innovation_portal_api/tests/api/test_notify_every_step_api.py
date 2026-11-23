"""Tell the innovator each time their idea moves to a new step (23 Nov)."""

from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog, Notification
from apps.core.constants import CommunicationChannel, RoleType, SubmissionStatus, SubmissionType
from apps.programs.models import ProgramStage
from apps.submissions.models import Submission
from apps.workflow.builder import save_step_settings, step_settings
from apps.workflow.services import WorkflowDefinitionService, WorkflowRuntimeService
from tests.api.test_challenges_b5_api import B5TestCase, data

OFFICER = RoleType.INNOVATION_OFFICER


def step(name, code, order, status, actions=("approve", "reject", "return"), role=OFFICER, **extra):
    return {"name": name, "code": code, "order": order, "role_required": role, "submission_status": status, "actions_allowed": list(actions), **extra}


class StepNoticeBase(B5TestCase):
    def setUp(self):
        super().setUp()
        self.program = self.challenge("Cold chain")
        self.definition = WorkflowDefinitionService.create_definition(
            program=self.program, name="Steps", actor=self.officer, activate=True,
            steps_data=[
                step("Quick check", "screening", 1, SubmissionStatus.SCREENING),
                step("Officer review", "under_review", 2, SubmissionStatus.UNDER_REVIEW),
                step("Shortlist", "shortlist", 3, SubmissionStatus.SHORTLISTED),
                step("Finalists", "finalists", 4, SubmissionStatus.FINALIST),
            ],
        )

    def idea(self, owner=None, *, channel="web", phone="", title="Solar dryer"):
        count = Submission.objects.count() + 1
        submission = Submission.objects.create(
            reference_number=f"STEP-{count:04d}", program=self.program, innovator=owner, submission_type=SubmissionType.IDEA,
            title=title, submitted_at=timezone.now(), current_status=SubmissionStatus.SUBMITTED, channel=channel, guest_phone=phone,
        )
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService.start_workflow(submission, self.officer)
        return submission

    def act(self, submission, action="approve", comment="Looks good."):
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService.perform_action(submission=submission, actor=self.officer, action=action, comment=comment)
        submission.refresh_from_db()

    def moved(self, user=None):
        return Notification.objects.filter(recipient=user or self.innovator, notification_type="idea_moved_on")


class EveryRouteTests(StepNoticeBase):
    def test_officer_decision_sends_one_message_with_the_public_step_name(self):
        submission = self.idea(self.innovator)
        self.assertEqual(self.moved().count(), 0)  # submitting is not a move
        self.act(submission)
        notes = self.moved()
        self.assertEqual(notes.count(), 1)
        self.assertIn("has moved to Officer review", notes.first().body)
        self.assertIn("Officers look at your idea in detail", notes.first().body)  # what happens next
        self.assertNotIn("under_review", notes.first().body)
        self.assertTrue(CommunicationLog.objects.filter(recipient=self.innovator, channel=CommunicationChannel.EMAIL, subject="Your idea moved on").exists())
        entry = AuditLog.objects.get(action_type="step_notification_sent")
        self.assertEqual((entry.metadata["step"], entry.metadata["channels"]), ("under_review", ["web", "email"]))

    def test_stage_name_wins_and_staff_move_and_send_back_are_moves_too(self):
        ProgramStage.objects.create(program=self.program, code="under_review", name="Detailed review", ordering=2)
        submission = self.idea(self.innovator)
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService.force_advance(submission, self.officer, "Moving it on.")
        self.assertIn("has moved to Detailed review", self.moved().latest("created_at").body)
        self.assertEqual(self.moved().count(), 1)

    def test_automatic_move_after_the_innovator_submit_step(self):
        program = self.challenge("Auto")
        WorkflowDefinitionService.create_definition(
            program=program, name="Auto", actor=self.officer, activate=True,
            steps_data=[step("Your idea", "submit", 1, SubmissionStatus.SUBMITTED, actions=("submit",), role=RoleType.INNOVATOR), step("Quick check", "screening", 2, SubmissionStatus.SCREENING)],
        )
        submission = Submission.objects.create(reference_number="AUTO-0001", program=program, innovator=self.innovator, submission_type=SubmissionType.IDEA, title="Auto idea", submitted_at=timezone.now())
        with self.captureOnCommitCallbacks(execute=True):
            WorkflowRuntimeService.start_workflow(submission, self.innovator)
        self.assertEqual([n.body.split(".")[0] for n in self.moved()], ["Your idea Auto idea has moved to Quick check"])


class SwitchAndDoubleTests(StepNoticeBase):
    def test_stage_switch_off_sends_nothing(self):
        ProgramStage.objects.create(program=self.program, code="under_review", name="Officer review", ordering=2, notify_applicants=False)
        submission = self.idea(self.innovator)
        self.act(submission)
        self.assertEqual(self.moved().count(), 0)
        self.assertFalse(AuditLog.objects.filter(action_type="step_notification_sent").exists())

    def test_step_switch_off_for_steps_without_a_stage(self):
        review = self.definition.steps.get(code="under_review")
        self.assertTrue(step_settings(review)["notify_innovator"])  # on by default
        save_step_settings(review, {"notify_innovator": False}, actor=self.officer)
        self.assertFalse(step_settings(review)["notify_innovator"])
        self.client.force_authenticate(self.officer)
        response = self.client.patch(f"/api/workflow-steps/{review.id}/settings/", {"notify_innovator": False}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(data(response)["notify_innovator"])
        submission = self.idea(self.innovator)
        self.act(submission)
        self.assertEqual(self.moved().count(), 0)

    def test_shortlisted_finalist_returned_rejected_and_finished_send_exactly_one_each(self):
        submission = self.idea(self.innovator)
        self.act(submission)  # Officer review: step message
        self.act(submission)  # Shortlist: only the shortlist news
        self.assertEqual(self.moved().count(), 1)
        self.assertEqual(Notification.objects.filter(recipient=self.innovator, notification_type="idea_shortlisted").count(), 1)
        self.act(submission)  # Finalists: now a step message
        self.assertEqual(self.moved().count(), 2)
        self.assertIn("Finalists", self.moved().latest("created_at").body)
        before = Notification.objects.filter(recipient=self.innovator).count()
        self.act(submission)  # finished: its own single message
        self.assertEqual(Notification.objects.filter(recipient=self.innovator).count(), before + 1)
        self.assertEqual(self.moved().count(), 2)

        other = self.idea(self.innovator, title="Second")
        before = Notification.objects.filter(recipient=self.innovator).count()
        self.act(other, action="return", comment="Add your budget.")
        self.assertEqual(Notification.objects.filter(recipient=self.innovator).count(), before + 1)
        third = self.idea(self.innovator, title="Third")
        before = Notification.objects.filter(recipient=self.innovator).count()
        self.act(third, action="reject", comment="Not a fit.")
        self.assertEqual(Notification.objects.filter(recipient=self.innovator).count(), before + 1)
        self.assertEqual(self.moved().count(), 2)


class ChannelTests(StepNoticeBase):
    def test_whatsapp_idea_also_gets_whatsapp(self):
        person = User.objects.create_user(email=None, password=None, first_name="Mpho", phone_number="+26771234567", phone_verified=True)
        RoleService.assign_roles(person, [RoleType.INNOVATOR])
        submission = self.idea(person, channel="whatsapp")
        self.act(submission)
        self.assertEqual(self.moved(person).count(), 1)
        sent = CommunicationLog.objects.filter(channel=CommunicationChannel.WHATSAPP, related_submission=submission)
        self.assertEqual((sent.count(), sent.first().to_address), (1, "+26771234567"))

    def test_guest_phone_idea_gets_whatsapp_only_and_a_guest_web_idea_nothing(self):
        guest = self.idea(None, channel="whatsapp", phone="+26772222222")
        self.act(guest)
        self.assertEqual(CommunicationLog.objects.filter(channel=CommunicationChannel.WHATSAPP, related_submission=guest).count(), 1)
        nobody = self.idea(None, title="No contact")
        self.act(nobody)
        self.assertEqual(CommunicationLog.objects.filter(related_submission=nobody).count(), 0)
