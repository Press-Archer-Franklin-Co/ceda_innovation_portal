"""R-48 a and b: eligibility rule blocks, required documents (3.6b) and stages (3.6c)."""

from apps.audit.models import AuditLog
from apps.programs.challenge_judging import ChallengeJudgingService
from apps.programs.form_builder import FormPublishService
from apps.programs.models import EligibilityRule, FormSection, ProgramStage, SubmissionForm, SubmissionFormField
from apps.reference.models import District
from tests.api.test_challenge_entry_u10_api import EntryTestCase
from tests.api.test_challenges_b5_api import data


class EligibilityBlockTests(EntryTestCase):
    def setUp(self):
        super().setUp()
        self.url = f"/api/programs/{self.program.id}/eligibility/"
        self.gaborone, self.francistown = District.objects.create(name={"en": "Gaborone", "tn": "Gaborone"}, slug="r48-gab"), District.objects.create(
            name={"en": "Francistown", "tn": "Francistown"}, slug="r48-ftown"
        )

    def put(self, body):
        self.client.force_authenticate(self.officer)
        return self.client.put(self.url, body, format="json")

    def test_blocks_documents_and_sentence(self):
        body = {
            "rules": [
                {"field": "age", "operator": "is_between", "value": [18, 35]},
                {"field": "citizenship", "operator": "is", "value": "citizen"},
                {"field": "district", "operator": "is_one_of", "value": [str(self.gaborone.id), str(self.francistown.id)]},
                {"field": "registered_company", "operator": "is", "value": False},
            ],
            "documents": [
                {"name": "Omang copy", "hint": "PDF or photo, up to 5 MB", "accept": ["application/pdf", "image/jpeg"], "max_mb": 5},
                {"name": "Company papers", "required": False, "translations": {"tn": {"name": "Dipampiri tsa khampani"}}},
            ],
        }
        response = self.put(body)
        self.assertEqual(response.status_code, 200, response.content)
        saved = data(response)
        self.assertEqual([rule["field"] for rule in saved["rules"]], ["age", "citizenship", "district", "registered_company"])
        self.assertEqual(saved["rules"][0]["value"], [18, 35])
        self.assertEqual(saved["rules"][0]["sentence"]["en"], "You can enter if you are 18 to 35 years old.")
        self.assertEqual(
            saved["sentence"]["en"],
            "You can enter if you are 18 to 35 years old, are a citizen of Botswana, live in Gaborone or Francistown and do not have a registered company.",
        )
        self.assertTrue(saved["sentence"]["tn"].startswith("O ka tsenela fa o na le dingwaga di le 18 go ya go 35"))
        self.assertEqual([doc["name"] for doc in saved["documents"]], ["Omang copy", "Company papers"])
        self.assertEqual((saved["documents"][0]["max_mb"], saved["documents"][1]["required"]), (5, False))
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_documents_updated").exists())

        # Leaving documents out keeps them.
        self.put({"rules": body["rules"][:1]})
        again = data(self.client.get(self.url))
        self.assertEqual((len(again["rules"]), len(again["documents"])), (1, 2))

    def test_public_page_asks_the_block_questions(self):
        self.put(
            {
                "rules": [
                    {"field": "age", "operator": "is_at_least", "value": 18},
                    {"field": "district", "operator": "is_not", "value": str(self.gaborone.id)},
                    {"question": "Is your idea your own?", "required_answer": True},
                ],
                "documents": [{"name": "Omang copy", "translations": {"tn": {"name": "Khopi ya Omang"}}}],
            }
        )
        self.client.force_authenticate(self.innovator)
        state = data(self.entry())
        self.assertEqual(
            [q["question"] for q in state["questions"]], ["Are you at least 18 years old?", "Do you live in Gaborone?", "Is your idea your own?"]
        )
        self.assertEqual(
            state["eligibility_sentence"],
            'You can enter if you are at least 18 years old, do not live in Gaborone and answer "yes" to "Is your idea your own?".',
        )
        self.assertEqual(state["documents"][0]["name"], "Omang copy")
        tn = data(self.entry(lang="tn"))
        self.assertEqual(tn["questions"][0]["question"], "A o na le dingwaga di le 18 kgotsa go feta?")
        self.assertEqual(tn["documents"][0]["name"], "Khopi ya Omang")

        ids = [q["id"] for q in state["questions"]]
        # "Is not Gaborone" asks "Do you live in Gaborone?" and needs no.
        failed = data(self.answer({ids[0]: True, ids[1]: True, ids[2]: True}))
        self.assertFalse(failed["eligible"])
        self.assertEqual(failed["reasons"][0]["reason"], "You can enter if you do not live in Gaborone.")
        self.assertTrue(data(self.answer({ids[0]: True, ids[1]: False, ids[2]: True}))["eligible"])

    def test_bad_blocks_are_refused(self):
        for rule in (
            {"field": "age", "operator": "is_between", "value": [40, 18]},
            {"field": "age", "operator": "is_one_of", "value": [18]},
            {"field": "citizenship", "operator": "is", "value": "visitor"},
            {"field": "district", "operator": "is_one_of", "value": ["00000000-0000-0000-0000-000000000000"]},
            {"field": "business_stage", "operator": "is_at_least", "value": "famous"},
            {"field": "registered_company", "operator": "is", "value": "yes"},
            {"field": "age", "value": 18},
        ):
            self.assertEqual(self.put({"rules": [rule]}).status_code, 400, rule)
        self.assertEqual(EligibilityRule.objects.filter(program=self.program).count(), 2)

    def test_business_stage_at_least(self):
        saved = data(self.put({"rules": [{"field": "business_stage", "operator": "is_at_least", "value": "testing"}]}))
        self.assertEqual(saved["sentence"]["en"], "You can enter if you have a business at the Testing stage or further.")


class StageTests(EntryTestCase):
    def setUp(self):
        super().setUp()
        ChallengeJudgingService.sync_workflow(self.program)
        self.url = f"/api/programs/{self.program.id}/stages/"
        self.client.force_authenticate(self.officer)

    def published_form(self, title="Pitch deck"):
        form = SubmissionForm.objects.create(title=title, translations={"tn": {"title": title}})
        section = FormSection.objects.create(form=form, title="Pitch", code="pitch", ordering=1, translations={"tn": {"title": "Pitch"}})
        SubmissionFormField.objects.create(form=form, section=section, label="Upload your pitch", key="pitch", field_type="textarea", ordering=1, translations={"tn": {"label": "Romela pitch"}})
        version, problems = FormPublishService.publish(form, actor=self.officer)
        self.assertIsNotNone(version, problems)
        return form

    def test_stages_follow_the_workflow_with_defaults(self):
        result = data(self.client.get(self.url))
        self.assertEqual(result["workflow"]["step_count"], 1)
        stage = result["stages"][0]
        self.assertEqual((stage["order"], stage["name"], stage["form"], stage["takes_part"]), (1, "Judging", None, "all"))
        self.assertEqual(stage["moves_on"]["kind"], "panel_score")
        self.assertEqual(stage["reviewers_label"], "Judging panel")
        self.assertTrue(stage["notify_applicants"])

    def test_patch_a_stage(self):
        step_id = data(self.client.get(self.url))["stages"][0]["step_id"]
        form = self.published_form()
        body = {
            "form": str(form.id),
            "opens_at": "2026-12-01T08:00:00Z",
            "closes_at": "2026-12-10T17:00:00Z",
            "takes_part": "shortlisted",
            "moves_on": {"kind": "panel_score", "pass_mark": 65},
            "notify_applicants": False,
        }
        response = self.client.patch(f"{self.url}{step_id}/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        stage = data(response)
        self.assertEqual(stage["form"], {"id": str(form.id), "title": "Pitch deck", "version": 1})
        self.assertEqual((stage["takes_part"], stage["moves_on"], stage["notify_applicants"]), ("shortlisted", {"kind": "panel_score", "pass_mark": 65.0}, False))
        self.program.refresh_from_db()
        self.assertEqual(float(self.program.pass_mark), 65.0)  # the judging step reads the challenge's pass mark
        self.assertEqual(ProgramStage.objects.filter(program=self.program).count(), 1)
        self.assertEqual(data(self.client.get(self.url))["stages"][0]["form"]["id"], str(form.id))
        self.assertTrue(AuditLog.objects.filter(action_type="challenge_stage_updated").exists())

        # The entry form is untouched: U10's flow still uses Program.form.
        self.client.force_authenticate(self.innovator)
        self.assertEqual(data(self.entry())["state"], "questions")

    def test_bad_patches(self):
        self.client.force_authenticate(self.officer)
        step_id = data(self.client.get(self.url))["stages"][0]["step_id"]
        draft = SubmissionForm.objects.create(title="Not published")
        for body in (
            {"form": str(draft.id)},
            {"opens_at": "2026-12-10T08:00:00Z", "closes_at": "2026-12-01T08:00:00Z"},
            {"moves_on": {"kind": "panel_score"}},
            {"moves_on": {"kind": "coin_toss"}},
            {"takes_part": "friends"},
        ):
            self.assertEqual(self.client.patch(f"{self.url}{step_id}/", body, format="json").status_code, 400, body)
        self.assertEqual(self.client.patch(f"{self.url}00000000-0000-0000-0000-000000000000/", {"takes_part": "all"}, format="json").status_code, 400)
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(self.url).status_code, 403)
