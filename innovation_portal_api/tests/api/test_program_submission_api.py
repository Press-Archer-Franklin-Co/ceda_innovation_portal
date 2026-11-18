from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType
from apps.programs.models import ProgramType


class ProgramApiTests(APITestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.officer = User.objects.create_user(email="officer3@example.com", password="StrongPass123", first_name="Officer", last_name="Three")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.program_type = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})[0]
        self.client.force_authenticate(self.officer)

    def test_officer_can_create_and_publish_program(self):
        create_payload = {
            "title": "CEDA Hackathon 2026",
            "description": "Innovation hackathon",
            "program_type_id": str(self.program_type.id),
            "opening_date": timezone.now().isoformat(),
            "closing_date": (timezone.now() + timezone.timedelta(days=10)).isoformat(),
            "allow_team_submission": True,
            "allow_individual_submission": False,
            "is_public": False,
        }
        create_response = self.client.post("/api/programs/", create_payload, format="json")
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)

        publish_response = self.client.post(f"/api/programs/{create_response.data['id']}/publish/")
        self.assertEqual(publish_response.status_code, status.HTTP_200_OK)
        self.assertEqual(publish_response.data["status"], "published")
