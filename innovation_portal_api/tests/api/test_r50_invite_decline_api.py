"""R-50: judge and specialist invitations say who invited and what is involved, and can be declined (1.15)."""

from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone

from apps.assignments.models import SpecialistInvitation, SpecialistInvitationStatus
from apps.audit.models import AuditLog
from apps.communications.models import Notification
from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.models import ChallengeJudge
from tests.api import test_challenge_judging_api as judging


class JudgeInviteTests(TestCase):
    setUp = judging.ChallengeJudgingFlowTests.setUp
    accept = judging.ChallengeJudgingFlowTests.accept

    def invite(self):
        with patch(judging.SEND):
            ChallengeJudgingService.process_due()
        return ChallengeJudge.objects.get(email="kabo@ceda.co.bw")

    def test_details_decline_and_no_accept_after(self):
        judge = self.invite()
        self.client.force_authenticate(None)
        details = self.client.get(f"/api/programs/judge-invite/{judge.token}/").json()["data"]
        self.assertEqual(details["invited_by"]["name"], f"{self.officer.first_name} {self.officer.last_name[:1]}." if self.officer.last_name else self.officer.first_name)
        self.assertEqual((details["idea_count"], details["criteria_count"]), (2, 2))
        self.assertIsNotNone(details["invited_at"])
        self.assertEqual((details["declined"], details["can_decline"]), (False, True))

        response = self.client.post(f"/api/programs/judge-invite/{judge.token}/decline/", {"reason": "Away that week."}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        details = self.client.get(f"/api/programs/judge-invite/{judge.token}/").json()["data"]
        self.assertEqual((details["declined"], details["can_decline"]), (True, False))
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_judge_declined").exists())
        self.assertIn("Away that week.", Notification.objects.get(recipient=self.officer, notification_type="challenge_judge_declined").body)
        self.assertEqual(self.accept(self.judge_users[0], judge).status_code, 400)

        # No more reminders, and the panel needs one judge fewer.
        judge.refresh_from_db()
        with patch.object(ChallengeJudgingService, "send_reminder") as remind:
            ChallengeJudgingService.process_due(now=timezone.now() + timedelta(days=4))
        self.assertNotIn(judge, [call.args[0] for call in remind.call_args_list])

    def test_accepted_cannot_decline(self):
        judge = self.invite()
        self.assertEqual(self.accept(self.judge_users[0], judge).status_code, 200)
        self.client.force_authenticate(None)
        self.assertFalse(self.client.get(f"/api/programs/judge-invite/{judge.token}/").json()["data"]["can_decline"])
        self.assertEqual(self.client.post(f"/api/programs/judge-invite/{judge.token}/decline/", {}, format="json").status_code, 400)


class SpecialistInviteTests(TestCase):
    setUp = judging.ChallengeJudgingFlowTests.setUp

    def test_decline(self):
        invitation = SpecialistInvitation.objects.create(
            submission=self.entries[0], invited_by=self.officer, invitee_email="vet@example.com", invitee_name="Dr Vet", expires_at=timezone.now() + timedelta(days=7)
        )
        self.client.force_authenticate(None)
        url = f"/api/assignments/specialist-invite/{invitation.token}/"
        self.assertTrue(self.client.get(url).json()["data"]["can_decline"])
        self.assertEqual(self.client.post(f"{url}decline/", {"reason": "Conflict of interest."}, format="json").status_code, 200)
        invitation.refresh_from_db()
        self.assertEqual((invitation.status, invitation.decline_reason), (SpecialistInvitationStatus.DECLINED, "Conflict of interest."))
        data = self.client.get(url).json()["data"]
        self.assertEqual((data["declined"], data["can_decline"]), (True, False))
        self.assertTrue(Notification.objects.filter(recipient=self.officer, notification_type="specialist_invitation_declined").exists())
