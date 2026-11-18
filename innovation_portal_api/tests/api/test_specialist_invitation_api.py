from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.assignments.models import SpecialistInvitation
from apps.core.constants import AssignmentRoleType, ProgramTypeCode, RoleType, SubmissionType
from apps.programs.models import Program, ProgramType
from apps.submissions.models import Submission
from apps.workflow.models import WorkflowDefinition, WorkflowInstance, WorkflowStep


class SpecialistInvitationApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="inv-officer@ceda.co.bw", password="StrongPass123", first_name="Of", last_name="Ficer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.specialist = User.objects.create_user(email="expert@example.com", password="StrongPass123", first_name="Ex", last_name="Pert")
        innovator = User.objects.create_user(email="inv-innovator@ceda.co.bw", password="StrongPass123", first_name="In", last_name="Novator")
        program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.INNOVATION_CHALLENGE, defaults={"name": "Innovation Challenge"})
        now = timezone.now()
        program = Program.objects.create(
            title="Invite Challenge", description="x", program_type=program_type, owner=self.officer,
            opening_date=now - timezone.timedelta(days=2), closing_date=now + timezone.timedelta(days=2), status="published",
        )
        definition = WorkflowDefinition.objects.create(name="Flow", code="flow", program=program, version=1, is_active=True)
        self.step = WorkflowStep.objects.create(
            workflow_definition=definition, name="Judging", code="judging", order=1,
            role_required=RoleType.JUDGE, requires_assignment=True, assignment_role=AssignmentRoleType.JUDGE,
        )
        self.submission = Submission.objects.create(
            program=program, innovator=innovator, submission_type=SubmissionType.INNOVATION_CHALLENGE,
            title="Entry", reference_number="CEDA-IC-2026-000099", submitted_at=now,
        )
        WorkflowInstance.objects.create(submission=self.submission, workflow_definition=definition, current_step=self.step)

    def invite(self):
        self.client.force_authenticate(self.officer)
        return self.client.post(
            f"/api/submissions/{self.submission.id}/invite-specialist/",
            {"invitee_email": "expert@example.com", "invitee_name": "Ex Pert"},
            format="json",
        )

    def test_cannot_invite_specialist_to_a_judge_step(self):
        response = self.invite()
        self.assertEqual(response.status_code, 400)
        self.assertIn("set up for judges", response.data["detail"])
        self.assertFalse(SpecialistInvitation.objects.exists())

    def test_specialist_can_accept_invite_on_specialist_step(self):
        self.step.assignment_role = AssignmentRoleType.SPECIALIST
        self.step.role_required = RoleType.SPECIALIST
        self.step.save(update_fields=["assignment_role", "role_required"])
        self.assertEqual(self.invite().status_code, 201)

        invitation = SpecialistInvitation.objects.get()
        self.client.force_authenticate(self.specialist)
        response = self.client.post(f"/api/assignments/specialist-invite/{invitation.token}/claim/")
        self.assertEqual(response.status_code, 200, response.data)
        invitation.refresh_from_db()
        self.assertEqual(invitation.status, "accepted")

    def test_claim_explains_when_entry_moved_to_a_non_specialist_step(self):
        self.step.assignment_role = AssignmentRoleType.SPECIALIST
        self.step.save(update_fields=["assignment_role"])
        self.assertEqual(self.invite().status_code, 201)
        self.step.assignment_role = AssignmentRoleType.JUDGE
        self.step.save(update_fields=["assignment_role"])

        invitation = SpecialistInvitation.objects.get()
        self.client.force_authenticate(self.specialist)
        response = self.client.post(f"/api/assignments/specialist-invite/{invitation.token}/claim/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("contact the person who invited you", response.data["detail"])
