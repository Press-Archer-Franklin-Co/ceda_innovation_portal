"""Prompt 37: questions that map to the signed-in person's profile are filled, shown "From your profile" with Edit,
never replace what they typed, never fill hidden questions, and WhatsApp shows a known answer to confirm."""
from datetime import date

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.core.constants import ProgramTypeCode, RoleType
from apps.organizations.models import OrganizationProfile
from apps.profiles.models import InnovatorProfile
from apps.programs.form_schema import build_form_schema
from apps.programs.general_idea import GeneralIdeaProgram
from apps.programs.models import FormSection, FormVersion, Program, ProgramType, SubmissionForm, SubmissionFormField, SubmissionFormFieldOption
from apps.reference.models import District
from apps.submissions.models import ApplicationDraft
from tests.api.test_channels_full_flow_api import FlowTestCase, form_journey, make_challenge


def body(response):
    data = response.json()
    return data.get("data", data)


class PrefillBase(TestCase):
    def setUp(self):
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.district = District.objects.filter(active=True).order_by("name").first()
        self.user = User.objects.create_user(email="neo@example.co.bw", password="StrongPass123!", first_name="Neo", last_name="Molefe", phone_number="+26771234567", email_verified=True)
        RoleService.assign_roles(self.user, [RoleType.INNOVATOR])
        InnovatorProfile.objects.update_or_create(user=self.user, defaults={"district": self.district, "gender": "Female", "date_of_birth": date(1998, 5, 1), "national_id": "123456789"})
        OrganizationProfile.objects.create(owner=self.user, legal_name="Sun Water (Pty) Ltd")
        ptype, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.HACKATHON, defaults={"name": "Hackathon"})
        owner = User.objects.create_user(email="officer@example.co.bw", password="StrongPass123!", first_name="Kago", last_name="Tau")
        self.program = Program.objects.create(title="Water Hack", slug="water-hack", description="x", program_type=ptype, owner=owner, status="published", is_public=True,
                                              opening_date=timezone.now() - timezone.timedelta(days=1), closing_date=timezone.now() + timezone.timedelta(days=10))
        form = SubmissionForm.objects.create(title="Water Hack form", status=SubmissionForm.Status.LIVE)
        self.program.form = form
        self.program.save(update_fields=["form"])
        section = FormSection.objects.create(form=form, title="About you", code="about", ordering=1)
        order = iter(range(1, 50))

        def add(key, kind, profile_field="", **extra):
            return SubmissionFormField.objects.create(form=form, section=section, key=key, label=key.replace("_", " ").title(), field_type=kind, profile_field=profile_field, ordering=next(order), **extra)

        add("given", "text", "first_name")
        add("family", "text", "last_name")
        add("mobile", "phone")
        add("mail", "email")
        add("where", "district")
        add("omang", "omang_id")
        add("company", "text", "organisation")
        gender = add("gender", "radio", "gender")
        for i, (v, label) in enumerate([("male", "Male"), ("female", "Female")], start=1):
            SubmissionFormFieldOption.objects.create(field=gender, value=v, label=label, ordering=i)
        age = add("age", "select", "age_group")
        for i, (v, label) in enumerate([("u18", "Under 18"), ("18-35", "18 to 35"), ("36+", "36 and over")], start=1):
            SubmissionFormFieldOption.objects.create(field=age, value=v, label=label, ordering=i)
        add("notes", "text")  # not a profile question
        add("work_phone", "phone", "none")  # switched off
        add("has_team", "yes_no")
        add("team_lead_phone", "phone", visible_if={"all": [{"field": "has_team", "op": "equals", "value": "yes"}]})
        FormVersion.objects.create(form=form, number=1, schema=build_form_schema(form, include_inactive=False))
        self.client.force_authenticate(self.user)
        created = self.client.post("/api/drafts/", {"title": "Solar pump", "program": str(self.program.id)}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        self.draft_id = body(created)["id"]

    def prefill(self):
        return body(self.client.get(f"/api/drafts/{self.draft_id}/"))["profile_prefill"]


class FormPrefillTests(PrefillBase):
    def test_profile_questions_are_filled_by_setting_and_by_type(self):
        filled = self.prefill()
        values = {key: item["value"] for key, item in filled.items()}
        self.assertEqual(values, {
            "given": "Neo", "family": "Molefe", "mobile": "+26771234567", "mail": "neo@example.co.bw", "where": self.district.slug,
            "omang": "123456789", "company": "Sun Water (Pty) Ltd", "gender": "female", "age": "18-35",
        })
        self.assertEqual(filled["where"]["display"], self.district.name)
        self.assertEqual(filled["gender"]["display"], "Female")
        self.assertEqual(filled["mobile"]["source"], "phone")

    def test_never_replaces_what_the_person_typed_and_edit_keeps_their_answer(self):
        # "Edit": the person types their own number; it is kept and no longer comes from the profile.
        saved = self.client.put(f"/api/drafts/{self.draft_id}/steps/about/", {"answers": {"mobile": "+26772000000", "given": "Neoh"}}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        filled = self.prefill()
        self.assertNotIn("mobile", filled)
        self.assertNotIn("given", filled)
        draft = ApplicationDraft.objects.get(id=self.draft_id)
        self.assertEqual((draft.draft_data["mobile"], draft.draft_data["given"]), ("+26772000000", "Neoh"))

    def test_hidden_questions_and_switched_off_ones_are_never_filled(self):
        filled = self.prefill()
        self.assertNotIn("team_lead_phone", filled)  # hidden until "has a team" is yes
        self.assertNotIn("work_phone", filled)  # Profile field set to "never"
        self.assertNotIn("notes", filled)
        self.client.put(f"/api/drafts/{self.draft_id}/steps/about/", {"answers": {"has_team": "yes"}}, format="json")
        self.assertIn("team_lead_phone", self.prefill())  # shown now, so it can be filled

    def test_only_the_owner_gets_their_profile_and_a_guest_draft_gets_nothing(self):
        other = User.objects.create_user(email="other@example.co.bw", password="StrongPass123!", first_name="Lesego", last_name="O", email_verified=True)
        RoleService.assign_roles(other, [RoleType.INNOVATOR])
        self.client.force_authenticate(other)
        self.assertIn(self.client.get(f"/api/drafts/{self.draft_id}/").status_code, (403, 404))
        self.client.force_authenticate(None)
        quick = self.client.post("/api/drafts/quick-start/", {"title": "Guest idea"}, format="json")
        if quick.status_code == 201:
            data = body(quick)
            guest = self.client.get(f"/api/drafts/{data['draft_id']}/", HTTP_X_DRAFT_TOKEN=data["resume_token"])
            self.assertEqual(body(guest)["profile_prefill"], {})

    def test_the_general_idea_form_fills_the_name_and_phone(self):
        general = GeneralIdeaProgram.get()
        created = self.client.post("/api/drafts/", {"title": "General one", "program": str(general.id)}, format="json")
        filled = body(self.client.get(f"/api/drafts/{body(created)['id']}/"))["profile_prefill"]
        self.assertEqual({k: v["value"] for k, v in filled.items()}, {"first_name": "Neo", "last_name": "Molefe", "contact_number": "+26771234567"})

    def test_staff_choose_the_profile_field_in_the_builder_and_a_wrong_one_is_refused(self):
        from apps.programs.form_builder import FormDocumentService

        form = self.program.form
        document = build_form_schema(form)
        document["steps"][0]["rows"][0]["fields"][0]["profile_field"] = "nickname"
        from rest_framework.exceptions import ValidationError

        with self.assertRaises(ValidationError):
            FormDocumentService.save_document(form, document, actor=None)
        document["steps"][0]["rows"][0]["fields"][0]["profile_field"] = "full_name"
        FormDocumentService.save_document(form, document, actor=None)
        self.assertEqual(SubmissionFormField.objects.get(form=form, key="given").profile_field, "full_name")


class WhatsAppConfirmTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        self.program = make_challenge(self.admin)
        self.journey = form_journey(program=self.program)
        self.use_journey(self.journey)

    def reach_email(self):
        self.say("hi")
        self.say("Solar pump")
        draft = ApplicationDraft.objects.get(program=self.program)
        User.objects.filter(pk=draft.innovator_id).update(email="neo@example.com")  # the profile now knows the email
        self.say("Pumps water with the sun")
        self.say("3")
        return draft

    def test_a_known_answer_is_shown_to_confirm_instead_of_asked(self):
        draft = self.reach_email()
        self.assertIn("From your profile: neo@example.com. Is that right?", self.last_text())
        self.say("1")
        draft.refresh_from_db()
        self.assertEqual(draft.draft_data["email"], "neo@example.com")
        self.assertIn("When did you start?", self.last_text())

    def test_change_it_asks_the_question_as_usual(self):
        draft = self.reach_email()
        self.say("2")
        self.assertIn("Your email", self.last_text())
        self.assertNotIn("From your profile", self.last_text())
        self.say("other@example.com")
        draft.refresh_from_db()
        self.assertEqual(draft.draft_data["email"], "other@example.com")
