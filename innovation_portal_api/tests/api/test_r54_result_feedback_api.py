"""R-54: panel feedback points and Confirm I will attend on My result (2.11), written by staff (3.37)."""

from datetime import timedelta

from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.core.constants import RoleType, SubmissionStatus
from apps.submissions.models import EntryPanelFeedback
from tests.api import test_challenge_entry_u10_api as u10
from tests.api.test_challenges_b5_api import data


class ResultFeedbackTests(u10.EntryTestCase):
    def setUp(self):
        super().setUp()
        self.done = self.challenge("Done", opens_in=-30, closes_in=-2, share_scores_with_entrants=False)
        self.other = User.objects.create_user(email="r54-other@example.com", password="StrongPass123", first_name="Mpho", last_name="Dube")
        RoleService.assign_roles(self.other, [RoleType.INNOVATOR])
        self.winning = self.send(program=self.done, user=self.other, status=SubmissionStatus.WINNER, title="Cool boxes")
        self.mine = self.send(program=self.done, status=SubmissionStatus.SHORTLISTED, title="Solar milk cooler")

    def publish(self, event_in_days=7):
        self.done.results_announced_at = timezone.now()
        self.done.event_date = timezone.now() + timedelta(days=event_in_days)
        self.done.save()

    def test_staff_write_and_entrant_sees_and_attends(self):
        url = f"/api/programs/{self.done.id}/entries/{self.mine.id}/panel-feedback/"
        self.client.force_authenticate(self.officer)
        body = {"liked": ["Clear problem", "  ", "Strong local supply"], "work_on": ["Costs per unit"]}
        saved = data(self.client.put(url, body, format="json"))
        self.assertEqual((saved["liked"], saved["work_on"]), (["Clear problem", "Strong local supply"], ["Costs per unit"]))
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_panel_feedback_saved").exists())

        self.client.force_authenticate(self.innovator)
        before = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertIsNone(before["feedback_points"])  # not until results are out
        self.assertFalse(before["attendance"]["can_confirm"])
        self.assertEqual(self.client.post("/api/programs/public/done/my-result/attend/", {"attending": True}, format="json").status_code, 400)

        self.publish()
        mine = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual(mine["feedback_points"], {"liked": ["Clear problem", "Strong local supply"], "work_on": ["Costs per unit"]})
        self.assertEqual((mine["attendance"]["confirmed"], mine["attendance"]["can_confirm"]), (False, True))
        answer = data(self.client.post("/api/programs/public/done/my-result/attend/", {"attending": True}, format="json"))
        self.assertTrue(answer["confirmed"])
        self.client.force_authenticate(self.officer)
        self.assertTrue(data(self.client.get(url))["attending"])

        # After the event nobody is asked any more.
        self.publish(event_in_days=-1)
        self.client.force_authenticate(self.innovator)
        self.assertFalse(data(self.client.get("/api/programs/public/done/my-result/"))["attendance"]["can_confirm"])

    def test_not_selected_sees_no_points_and_staff_only_write(self):
        from apps.content.models import WinnerSpotlight

        WinnerSpotlight.objects.create(program=self.done, team_name="Mpho Dube", project_name="Cool boxes", position="1st", year=2026, submission=self.winning)
        self.publish()
        EntryPanelFeedback.objects.create(submission=self.winning, liked=["Good"], work_on=[])
        self.client.force_authenticate(self.other)
        theirs = data(self.client.get("/api/programs/public/done/my-result/"))
        self.assertEqual(theirs["feedback_points"], {"liked": ["Good"], "work_on": []})
        self.client.force_authenticate(self.innovator)
        url = f"/api/programs/{self.done.id}/entries/{self.mine.id}/panel-feedback/"
        self.assertEqual(self.client.put(url, {"liked": ["x"]}, format="json").status_code, 403)
