from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionType
from apps.programs.models import Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.submissions.services import SubmissionService


class TrackingAndSupportApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.user = User.objects.create_user(
            email="innovator.track@example.com",
            password="StrongPass123",
            first_name="Track",
            last_name="User",
        )
        RoleService.assign_roles(self.user, [RoleType.INNOVATOR])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Tracking Call",
            slug="tracking-call",
            description="Tracking call",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=5),
            owner=self.user,
            is_public=True,
        )
        form = SubmissionForm.objects.create(program=self.program, title="Tracking Form")
        self.field = SubmissionFormField.objects.create(
            form=form,
            label="Problem",
            key="problem",
            field_type="textarea",
            required=True,
            ordering=1,
        )
        self.submission = SubmissionService.create_draft(
            innovator=self.user,
            program=self.program,
            submission_type=SubmissionType.IDEA,
            title="Trackable idea",
        )
        SubmissionService.save_responses(
            self.submission,
            responses=[{"form_field": self.field.id, "value": "A valid response"}],
            actor=self.user,
        )
        self.submission = SubmissionService.finalize_submission(self.submission, self.user)

    def test_authenticated_user_can_track_submission_by_reference(self):
        self.client.force_authenticate(self.user)
        response = self.client.get(f"/api/track/{self.submission.reference_number}/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["reference_number"], self.submission.reference_number)
        self.assertEqual(response.data["current_status"], "submitted")

    def test_guest_can_create_support_request(self):
        response = self.client.post(
            "/api/support/requests/",
            {
                "request_type": "technical_support",
                "subject": "Need help opening my draft",
                "description": "The draft screen is unavailable.",
                "email": "guest@example.com",
            },
            format="json",
        )

        self.assertEqual(response.status_code, 201)
