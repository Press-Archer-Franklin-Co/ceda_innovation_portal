from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService, UserSecurityTokenService
from apps.audit.models import AuditLog
from apps.communications.models import Notification
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionFormFieldType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService


class WorkflowPublicTrackingNotificationsAuthApiTests(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.innovator = User.objects.create_user(email="public-track@example.com", password="StrongPass123", first_name="Public", last_name="Track")
        self.officer = User.objects.create_user(email="officer-track@example.com", password="StrongPass123", first_name="Officer", last_name="Track")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Public Tracking Program",
            slug="public-tracking-program",
            description="Tracking",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Tracking Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem Statement",
            key="problem_statement",
            field_type=SubmissionFormFieldType.TEXTAREA,
            required=True,
            ordering=1,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.innovator,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Track me",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "Tracking value"}],
            actor=self.innovator,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.innovator)

    def test_public_tracking_endpoint_works_without_login(self):
        response = self.client.get(f"/api/track/{self.submission.reference_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reference_number"], self.submission.reference_number)
        self.assertIn("current_step", response.data)
        self.assertNotIn("innovator_name", response.data)

    def test_notifications_list_and_mark_read(self):
        Notification.objects.create(recipient=self.innovator, notification_type="assignment_created", title="Assigned", body="Assigned to review")
        self.client.force_authenticate(self.innovator)

        list_response = self.client.get("/api/notifications/")
        self.assertEqual(list_response.status_code, 200)
        notification_id = list_response.data["data"][0]["id"]

        mark_response = self.client.post("/api/notifications/mark-read/", {"ids": [notification_id]}, format="json")
        self.assertEqual(mark_response.status_code, 200)
        self.assertTrue(Notification.objects.get(id=notification_id).is_read)

    def test_verify_email_and_reset_password_endpoints(self):
        verify_token = UserSecurityTokenService.issue_token(self.innovator, "email_verification")
        verify_response = self.client.post("/api/auth/verify-email/", {"token": verify_token.token}, format="json")
        self.assertEqual(verify_response.status_code, 200)
        self.innovator.refresh_from_db()
        self.assertTrue(self.innovator.email_verified)
        self.assertTrue(AuditLog.objects.filter(actor=self.innovator, action_type="email_verification_completed").exists())

        reset_token = UserSecurityTokenService.issue_token(self.innovator, "password_reset")
        reset_response = self.client.post(
            "/api/auth/reset-password/",
            {"token": reset_token.token, "password": "NewStrongPass123"},
            format="json",
        )
        self.assertEqual(reset_response.status_code, 200)
        self.innovator.refresh_from_db()
        self.assertTrue(self.innovator.check_password("NewStrongPass123"))
        self.assertTrue(AuditLog.objects.filter(actor=self.innovator, action_type="password_reset_completed").exists())
