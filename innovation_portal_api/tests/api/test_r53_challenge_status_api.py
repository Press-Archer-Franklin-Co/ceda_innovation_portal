"""R-53: challenge status numbers and updates to everyone who started an entry (3.6)."""

from unittest.mock import patch

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.communications.models import CommunicationLog, Notification
from apps.core.constants import RoleType, SubmissionStatus
from apps.submissions.models import ApplicationDraft
from tests.api.test_challenge_entry_u10_api import EntryTestCase
from tests.api.test_challenges_b5_api import data


class ChallengeStatusTests(EntryTestCase):
    def setUp(self):
        super().setUp()
        self.other = User.objects.create_user(email="r53-other@example.com", password="StrongPass123", first_name="Tumelo", preferred_language="tn")
        RoleService.assign_roles(self.other, [RoleType.INNOVATOR])
        ApplicationDraft.objects.create(program=self.program, innovator=self.other, title="Draft", status=ApplicationDraft.STATUS_DRAFT)
        self.send(status=SubmissionStatus.SHORTLISTED)
        self.send(user=self.other, title="Second")

    def test_numbers(self):
        self.client.force_authenticate(self.officer)
        numbers = data(self.client.get(f"/api/programs/{self.program.id}/status-numbers/"))
        self.assertEqual((numbers["started"], numbers["submitted"], numbers["to_panel"], numbers["reviewed"]), (3, 2, 1, 0))
        self.assertGreaterEqual(numbers["days_left"], 1)
        self.assertIsNotNone(numbers["closes_at"])
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(f"/api/programs/{self.program.id}/status-numbers/").status_code, 403)

    def test_update_reaches_everyone_who_started(self):
        self.client.force_authenticate(self.officer)
        url = f"/api/programs/{self.program.id}/updates/"
        with patch("apps.communications.services.CommunicationService._dispatch_or_enqueue"):
            result = data(self.client.post(url, {"body": "The deadline moved to Friday.", "body_tn": "Letlha le fetogetse ka Labotlhano."}, format="json"))
        self.assertEqual(result["recipients"], 2)
        self.assertEqual(result["sent"]["web"], 2)
        self.assertEqual(Notification.objects.get(recipient=self.other, notification_type="challenge_update").body, "Letlha le fetogetse ka Labotlhano.")
        self.assertEqual(Notification.objects.get(recipient=self.innovator, notification_type="challenge_update").body, "The deadline moved to Friday.")
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_update_posted").exists())

        with patch("apps.communications.services.CommunicationService._dispatch_or_enqueue"):
            only_email = data(self.client.post(url, {"body": "Again", "channels": ["email"]}, format="json"))
        self.assertEqual(only_email["sent"]["email"], 2)
        self.assertEqual(CommunicationLog.objects.filter(subject__startswith="Update on", channel="email").count(), 2 + result["sent"]["email"])
        self.assertEqual(self.client.post(url, {"body": "x", "channels": ["pigeon"]}, format="json").status_code, 400)
        self.assertEqual(self.client.post(url, {"body": ""}, format="json").status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.post(url, {"body": "Hi"}, format="json").status_code, 403)
