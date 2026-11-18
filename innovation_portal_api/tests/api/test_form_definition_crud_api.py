from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType
from apps.programs.models import Program, ProgramType, SubmissionForm


class FormDefinitionCrudApiTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="forms-officer@example.com", password="StrongPass123", first_name="Forms", last_name="Officer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Form CRUD Program",
            slug="form-crud-program",
            description="Form CRUD program",
            program_type=program_type,
            opening_date=timezone.now(),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
        )
        SubmissionForm.objects.create(program=self.program, title="Program Form")

    def test_section_field_rule_option_crud(self):
        self.client.force_authenticate(self.officer)
        section = self.client.post(f"/api/programs/{self.program.id}/form-sections/", {"title": "Overview", "code": "overview", "ordering": 1}, format="json")
        self.assertEqual(section.status_code, 201)
        section_id = section.json()["id"]

        field = self.client.post(f"/api/programs/form-sections/{section_id}/fields/", {"label": "Theme", "key": "theme", "field_type": "select", "ordering": 1, "required": True}, format="json")
        self.assertEqual(field.status_code, 201)
        field_id = field.json()["data"]["id"]

        option = self.client.post(f"/api/programs/form-fields/{field_id}/options/", {"label": "Connectivity", "value": "connectivity", "ordering": 1}, format="json")
        rule = self.client.post(f"/api/programs/form-fields/{field_id}/rules/", {"rule_type": "min_length", "rule_value": "3"}, format="json")
        detail = self.client.get(f"/api/programs/form-fields/{field_id}/")

        self.assertEqual(option.status_code, 201)
        self.assertEqual(rule.status_code, 201)
        self.assertEqual(detail.status_code, 200)
