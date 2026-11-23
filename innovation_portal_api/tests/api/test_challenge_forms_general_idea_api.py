"""Prompt 31 part A: a challenge takes entries only with a published form, and there is one General ideas programme."""
from importlib import import_module

from django.apps import apps as django_apps
from django.db import IntegrityError, transaction

from apps.core.constants import ProgramStatus, ProgramTypeCode
from apps.programs.general_idea import GeneralIdeaProgram, form_ready
from apps.programs.models import Program, ProgramType, SubmissionForm
from apps.submissions.models import ApplicationDraft, Submission
from tests.api.form_helpers import published_form
from tests.api.test_challenge_entry_u10_api import EntryTestCase
from tests.api.test_challenges_b5_api import data


class FormReadyRuleTests(EntryTestCase):
    def unpublished(self, title="No form yet"):
        program = self.challenge(title, with_form=False)
        program.form = SubmissionForm.objects.create(title=f"{title} form")
        program.save(update_fields=["form"])
        return program

    def test_a_challenge_without_a_published_form_says_open_soon_and_creates_no_draft(self):
        program = self.unpublished()
        self.assertFalse(form_ready(program))
        detail = data(self.client.get(f"/api/programs/public/{program.slug}/"))
        self.assertFalse(detail["form_ready"])
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.entry(program.slug))["state"], "not_ready")
        refused = self.client.post(f"/api/programs/public/{program.slug}/eligibility/", {"answers": {}}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("form_not_ready", refused.content.decode())
        self.assertFalse(ApplicationDraft.objects.filter(program=program).exists())
        # Nor through the draft endpoint (as a verified innovator) or the quick start.
        self.innovator.email_verified = True
        self.innovator.save(update_fields=["email_verified"])
        self.assertEqual(self.client.post("/api/drafts/", {"title": "x", "program": str(program.id)}, format="json").status_code, 400)
        self.assertEqual(self.client.post("/api/drafts/quick-start/", {"title": "x", "program_id": str(program.id)}, format="json").status_code, 400)
        self.assertFalse(ApplicationDraft.objects.filter(program=program).exists())

    def test_a_challenge_cannot_be_published_without_a_published_form(self):
        program = self.challenge("Draft call", status=ProgramStatus.DRAFT, with_form=False)
        self.client.force_authenticate(self.officer)
        refused = self.client.post(f"/api/programs/{program.id}/publish/")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("form", refused.json()["errors"])
        published_form(program)
        self.assertEqual(self.client.post(f"/api/programs/{program.id}/publish/").status_code, 200)
        steps = {s["step"]: s["complete"] for s in data(self.client.get(f"/api/programs/{program.id}/setup-status/"))["steps"]}
        self.assertTrue(steps["form"])

    def test_a_form_an_open_challenge_uses_cannot_be_archived(self):
        self.client.force_authenticate(self.officer)
        refused = self.client.post(f"/api/forms/{self.program.form_id}/archive/")
        self.assertEqual(refused.status_code, 400)
        self.assertIn("Cold chain", refused.content.decode())
        self.assertNotEqual(SubmissionForm.objects.get(id=self.program.form_id).status, "archived")
        closed = self.challenge("Done", opens_in=-30, closes_in=-2)
        self.assertEqual(self.client.post(f"/api/forms/{closed.form_id}/archive/").status_code, 200)

    def test_open_challenge_eligibility_form_loads_and_submit(self):
        """End to end: an open challenge, the questions, its own published form, sent."""
        self.innovator.email_verified = True  # sending needs a verified email or phone
        self.innovator.save(update_fields=["email_verified"])
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.entry())["state"], "questions")
        draft_id = data(self.answer({str(self.botswana.id): True, str(self.employee.id): False}))["draft_id"]
        response = self.client.get(f"/api/drafts/{draft_id}/").json()
        draft = response.get("data", response)
        self.assertEqual(draft["form_id"], str(self.program.form_id))
        self.assertIsNotNone(draft["form_version_id"])  # the page shows the form, not "not ready yet"
        version = SubmissionForm.objects.get(id=self.program.form_id).latest_version
        step = version.schema["steps"][0]["code"]
        saved = self.client.put(f"/api/drafts/{draft_id}/steps/{step}/", {"answers": {"idea": "A cold room shared by ten farmers"}}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        sent = self.client.post(f"/api/drafts/{draft_id}/submit/", {"consent": True}, format="json")
        self.assertIn(sent.status_code, (200, 201), sent.content)
        self.assertTrue(Submission.objects.filter(program=self.program, innovator=self.innovator, submitted_at__isnull=False).exists())
        self.assertEqual(data(self.entry())["state"], "entered")


class OneGeneralIdeaProgramTests(EntryTestCase):
    def test_every_general_idea_path_uses_the_same_programme(self):
        general = GeneralIdeaProgram.get()
        self.assertTrue(general.is_general_intake)
        self.assertTrue(form_ready(general))
        from apps.channels.actions import _program
        from apps.submissions.intake import QuickStartService
        from apps.workflow.builder import general_ideas_program

        self.assertEqual(QuickStartService._program_for(None), general)
        self.assertEqual(_program(None), general)
        self.assertEqual(general_ideas_program(), general)
        self.assertEqual(GeneralIdeaProgram.get(), general)  # not created twice

    def test_whatsapp_sends_a_challenge_without_a_form_to_general_ideas(self):
        from apps.channels.actions import _program
        from apps.channels.form_steps import open_programs

        not_ready = self.challenge("Waiting form", with_form=False)
        self.assertEqual(_program(str(not_ready.id)), GeneralIdeaProgram.get())
        self.assertEqual(_program(str(self.program.id)), self.program)
        self.assertNotIn(not_ready, open_programs())
        self.assertIn(self.program, open_programs())

    def test_the_database_allows_only_one_general_ideas_programme(self):
        general = GeneralIdeaProgram.get()
        with self.assertRaises(IntegrityError), transaction.atomic():
            Program.objects.create(title="Another", slug="another-general", program_type=general.program_type, owner=self.officer, is_general_intake=True)

    def test_the_forms_list_marks_the_general_idea_form_and_one_setting_changes_it(self):
        general = GeneralIdeaProgram.get()
        self.client.force_authenticate(self.officer)
        listed = {f["id"]: f["general_ideas"] for f in data(self.client.get("/api/forms/"))["results"]}
        self.assertTrue(listed[str(general.form_id)])
        self.assertFalse(listed[str(self.program.form_id)])
        # Only through the setting, never through the programme's own form endpoint.
        other = published_form(title="Short idea form")
        refused = self.client.put(f"/api/programs/{general.id}/form/", {"form_id": str(other.id)}, format="json")
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(data(self.client.get("/api/forms/general-ideas/"))["form"]["id"], str(general.form_id))
        changed = self.client.put("/api/forms/general-ideas/", {"form_id": str(other.id)}, format="json")
        self.assertEqual(changed.status_code, 200, changed.content)
        general.refresh_from_db()
        self.assertEqual(general.form_id, other.id)
        # It cannot be archived while it is the general idea form; an unpublished form cannot be chosen.
        self.assertEqual(self.client.post(f"/api/forms/{other.id}/archive/").status_code, 400)
        draft = SubmissionForm.objects.create(title="Not published")
        self.assertEqual(self.client.put("/api/forms/general-ideas/", {"form_id": str(draft.id)}, format="json").status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.put("/api/forms/general-ideas/", {"form_id": str(other.id)}, format="json").status_code, 403)

    def test_publishing_an_idea_call_no_longer_closes_the_other_idea_calls(self):
        idea_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea Submission"})
        first = self.challenge("Idea call one")
        second = self.challenge("Idea call two", status=ProgramStatus.DRAFT)
        Program.objects.filter(pk__in=[first.pk, second.pk]).update(program_type=idea_type)
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.post(f"/api/programs/{second.id}/publish/").status_code, 200)
        first.refresh_from_db()
        self.assertEqual(first.status, ProgramStatus.PUBLISHED)


class MigrationTests(EntryTestCase):
    def test_the_data_migration_publishes_forms_and_archives_the_old_idea_programme_without_deleting(self):
        waiting = self.challenge("Waiting call", with_form=False)
        waiting.form = SubmissionForm.objects.create(title="Waiting call form")
        waiting.save(update_fields=["form"])
        idea_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea Submission"})
        old = self.challenge("CEDA Idea Submission", with_form=False)
        Program.objects.filter(pk=old.pk).update(program_type=idea_type)
        old.refresh_from_db()
        old.form = SubmissionForm.objects.create(title="CEDA Idea Submission Form")
        old.save(update_fields=["form"])
        self.assertEqual(old.slug, "ceda-idea-submission")
        kept = self.send(program=old)

        import_module("apps.programs.migrations.0024_challenge_forms_and_general_idea").forwards(django_apps, None)

        waiting.refresh_from_db()
        self.assertTrue(form_ready(waiting))
        old.refresh_from_db()
        self.assertEqual((old.status, old.is_public), (ProgramStatus.ARCHIVED, False))
        self.assertEqual(SubmissionForm.objects.get(id=old.form_id).status, "archived")
        self.assertTrue(Submission.objects.filter(id=kept.id).exists())  # nothing deleted


class BannerSmallLabelTests(EntryTestCase):
    def test_the_small_label_is_a_banner_setting_and_empty_means_the_default(self):
        from apps.content.sections import default_settings, normalize_settings

        self.assertEqual(default_settings("hero_banner")["small_label"], {"en": "", "tn": ""})
        saved = normalize_settings("hero_banner", {"headline": {"en": "Plant the seed"}, "small_label": {"en": "Ideas welcome all year", "tn": "Dikakanyo di a amogelwa"}})
        self.assertEqual(saved["small_label"]["en"], "Ideas welcome all year")
        from apps.content.sections import SettingsError

        with self.assertRaises(SettingsError):
            normalize_settings("hero_banner", {"headline": {"en": "x"}, "small_label": {"en": "x" * 61}})
