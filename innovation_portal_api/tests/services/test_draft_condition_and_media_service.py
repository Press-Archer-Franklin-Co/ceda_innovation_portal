from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType, SubmissionType, SubmissionFormFieldType
from apps.documents.models import DocumentCategory, SubmissionDocument
from apps.programs.condition_services import FormConditionService
from apps.programs.models import FieldValidationRule, FormSection, Program, ProgramType, SubmissionForm, SubmissionFormField
from apps.profiles.models import InnovatorProfile
from apps.submissions.draft_services import ApplicationDraftService


class DraftConditionAndMediaServiceTests(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.user = User.objects.create_user(email="condition@example.com", password="StrongPass123", first_name="Cond", last_name="User")
        RoleService.assign_roles(self.user, [RoleType.INNOVATOR, RoleType.INNOVATION_OFFICER])
        program_type = ProgramType.objects.create(code=ProgramTypeCode.IDEA, name="Idea")
        self.program = Program.objects.create(
            title="Conditional Form Program",
            slug="conditional-form-program",
            description="Conditional form program",
            program_type=program_type,
            opening_date=timezone.now() - timezone.timedelta(days=1),
            closing_date=timezone.now() + timezone.timedelta(days=2),
            opens_at=timezone.now() - timezone.timedelta(days=1),
            closes_at=timezone.now() + timezone.timedelta(days=2),
            owner=self.user,
            status="published",
        )
        form = SubmissionForm.objects.create(program=self.program, title="Conditional Form")
        section = FormSection.objects.create(form=form, title="Main", code="main", ordering=1)
        self.flag = SubmissionFormField.objects.create(
            form=form,
            section=section,
            label="Needs Deck",
            key="needs_deck",
            field_type=SubmissionFormFieldType.BOOLEAN,
            required=False,
            ordering=1,
        )
        self.deck = SubmissionFormField.objects.create(
            form=form,
            section=section,
            label="Pitch Deck",
            key="pitch_deck",
            field_type=SubmissionFormFieldType.FILE,
            required=False,
            required_if={"operator": "OR", "conditions": [{"field": "needs_deck", "operator": "equals", "value": True}]},
            media_config={"min_files": 1, "max_files": 1},
            ordering=2,
        )
        FieldValidationRule.objects.create(field=self.deck, rule_type="file_type", rule_value="application/pdf")
        self.category = DocumentCategory.objects.create(name="Pitch Deck", code="pitch_deck")

    def test_conditional_required_media_field_validation(self):
        draft = ApplicationDraftService.save_draft(
            program=self.program,
            innovator=self.user,
            submission_type=SubmissionType.IDEA,
            title="Conditional Draft",
            draft_data={"needs_deck": True},
            current_section_code="main",
        )
        with self.assertRaises(ValidationError):
            ApplicationDraftService.validate_draft_data(draft, draft.draft_data)

        SubmissionDocument.objects.create(
            application_draft=draft,
            category=self.category,
            field_key="pitch_deck",
            document_type="file",
            original_filename="deck.pdf",
            mime_type="application/pdf",
            size_bytes=1024,
            uploaded_by=self.user,
        )
        ApplicationDraftService.validate_draft_data(draft, draft.draft_data)

    def test_condition_engine_supports_contains_and_debug(self):
        result = FormConditionService.evaluate(
            {
                "operator": "AND",
                "conditions": [
                    {"field": "tags", "operator": "contains", "value": "ceda"},
                    {"field": "score", "operator": "greater_than", "value": 5},
                ],
            },
            {"tags": ["ceda", "innovation"], "score": 7},
            debug=True,
        )
        self.assertTrue(result["result"])
        self.assertGreaterEqual(len(result["evaluated_conditions"]), 2)

    def test_condition_engine_rejects_invalid_schema(self):
        with self.assertRaises(ValidationError):
            FormConditionService.evaluate({"operator": "invalid", "conditions": []}, {"score": 1})

    def test_save_draft_syncs_shared_general_information_into_user_profile(self):
        profile, _ = InnovatorProfile.objects.get_or_create(user=self.user)
        draft = ApplicationDraftService.save_draft(
            program=self.program,
            innovator=self.user,
            submission_type=SubmissionType.IDEA,
            title="Profile Sync Draft",
            draft_data={
                "first_name": "Updated",
                "last_name": "Innovator",
                "contact_number": "+26771112222",
                "country_code": "+267",
                "country": "BW",
                "id_passport_number": "OMANG12345",
                "gender": "male",
                "person_type": "entrepreneur",
                "linkedin_link": "https://linkedin.com/in/updated-innovator",
                "website_link": "https://example.com",
                "age_group": "1998-05-21",
            },
            current_section_code="main",
        )

        self.user.refresh_from_db()
        profile.refresh_from_db()
        draft.refresh_from_db()

        self.assertEqual(draft.draft_data["contact_number"], "+26771112222")
        self.assertEqual(self.user.first_name, "Updated")
        self.assertEqual(self.user.last_name, "Innovator")
        self.assertEqual(self.user.phone_number, "+26771112222")
        self.assertEqual(profile.country_code, "+267")
        self.assertEqual(profile.country, "BW")
        self.assertEqual(profile.national_id, "OMANG12345")
        self.assertEqual(profile.gender, "male")
        self.assertEqual(profile.person_type, "entrepreneur")
        self.assertEqual(profile.linkedin_url, "https://linkedin.com/in/updated-innovator")
        self.assertEqual(profile.portfolio_url, "https://example.com")
        self.assertEqual(str(profile.date_of_birth), "1998-05-21")

    def test_save_draft_does_not_overwrite_profile_with_blank_values(self):
        profile, _ = InnovatorProfile.objects.get_or_create(user=self.user)
        profile.country_code = "+267"
        profile.national_id = "EXISTING123"
        profile.save(update_fields=["country_code", "national_id", "updated_at"])
        self.user.phone_number = "+26770000000"
        self.user.save(update_fields=["phone_number", "updated_at"])

        ApplicationDraftService.save_draft(
            program=self.program,
            innovator=self.user,
            submission_type=SubmissionType.IDEA,
            title="Blank Values Draft",
            draft_data={
                "contact_number": "",
                "country_code": "",
                "id_passport_number": "",
                "age_group": "under_18",
            },
            current_section_code="main",
        )

        self.user.refresh_from_db()
        profile.refresh_from_db()

        self.assertEqual(self.user.phone_number, "+26770000000")
        self.assertEqual(profile.country_code, "+267")
        self.assertEqual(profile.national_id, "EXISTING123")
