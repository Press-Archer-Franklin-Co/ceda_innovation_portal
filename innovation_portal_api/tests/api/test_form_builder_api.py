"""B4: standalone forms, draft document, publish, translations, templates, export."""

import csv
import io

from django.core.cache import cache
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.core.constants import ProgramTypeCode, RoleType
from apps.communications.models import Notification
from apps.programs.condition_services import FormConditionService
from apps.programs.field_types import omang_error
from apps.programs.models import FormVersion, Program, ProgramType, SubmissionForm
from apps.submissions.models import Submission, SubmissionResponse

FORMS = "/api/forms/"


def text(en, tn=""):
    return {"en": en, "tn": tn}


def field(key, label, type_="text", **extra):
    doc = {
        "key": key,
        "type": type_,
        "label": label if isinstance(label, dict) else text(label),
        "help_text": text(""),
        "placeholder": text(""),
        "required": False,
        "is_challenge_question": False,
        "width": "full",
        "is_active": True,
        "link_url": "",
        "visible_if": {},
        "required_if": {},
        "enabled_if": {},
        "validation_rules": {},
        "media_config": {},
        "default_value": {},
        "example_value": {},
        "options": [],
        "rules": [],
    }
    doc.update(extra)
    return doc


def sample_document(tn=True):
    """A two-step form; every text has Setswana when tn is True."""
    t = (lambda en, tn_text: text(en, tn_text)) if tn else (lambda en, tn_text: text(en))
    return {
        "name": t("Youth agri challenge entry", "Kopo ya kgaisano ya temothuo"),
        "description": text(""),
        "languages": ["en", "tn"],
        "steps": [
            {
                "code": "about-you",
                "title": t("About you", "Ka ga gago"),
                "description": text(""),
                "tips": [t("Use the name on your Omang.", "Dirisa leina le le mo Omang ya gago.")],
                "is_active": True,
                "rows": [
                    {"fields": [field("first_name", t("First name", "Leina"), width="half", required=True), field("last_name", t("Last name", "Sefane"), width="half")]},
                    {"fields": [field("omang", t("Omang number", "Nomoro ya Omang"), "omang_id", width="half")]},
                ],
            },
            {
                "code": "your-idea",
                "title": t("Your idea", "Kakanyo ya gago"),
                "description": text(""),
                "tips": [],
                "is_active": True,
                "rows": [
                    {
                        "fields": [
                            field(
                                "stage",
                                t("How far along are you?", "O gorogile kae?"),
                                "radio",
                                required=True,
                                options=[
                                    {"value": "idea", "label": t("Just an idea", "Ke kakanyo fela"), "description": t("Not tried yet", "Ga e ise e lekwe")},
                                    {"value": "selling", "label": t("Already selling", "Ke a rekisa"), "description": text("")},
                                ],
                            )
                        ]
                    },
                    {"fields": [field("has_company", t("Registered company?", "A o na le khampani?"), "yes_no", width="half", is_challenge_question=True)]},
                    {
                        "fields": [
                            field(
                                "company_name",
                                t("Company name", "Leina la khampani"),
                                visible_if={"all": [{"field": "has_company", "op": "equals", "value": "yes"}]},
                            )
                        ]
                    },
                ],
            },
        ],
        "loose_fields": [],
    }


def strip_ids(document):
    """The document without ids, version or status, to compare a PUT with the GET after it."""
    document = {key: value for key, value in document.items() if key not in {"id", "version", "status"}}
    steps = []
    for step in document["steps"]:
        step = {key: value for key, value in step.items() if key != "id"}
        rows = []
        for row in step["rows"]:
            fields = []
            for item in row["fields"]:
                item = {key: value for key, value in item.items() if key != "id"}
                item["options"] = [{key: value for key, value in option.items() if key != "id"} for option in item["options"]]
                fields.append(item)
            rows.append({"fields": fields})
        step["rows"] = rows
        steps.append(step)
    document["steps"] = steps
    return document


class FormBuilderTestCase(TestCase):
    def setUp(self):
        cache.clear()
        RoleService.ensure_default_roles()
        self.client = APIClient()
        self.officer = User.objects.create_user(email="forms-b4@example.com", password="StrongPass123", first_name="Kago", last_name="Officer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.innovator = User.objects.create_user(email="innovator-b4@example.com", password="StrongPass123", first_name="Neo", last_name="K")
        RoleService.assign_roles(self.innovator, [RoleType.INNOVATOR])
        self.program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea"})
        self.client.force_authenticate(self.officer)

    def make_program(self, title="Agri challenge"):
        return Program.objects.create(
            title=title,
            slug=title.lower().replace(" ", "-"),
            description=title,
            program_type=self.program_type,
            opening_date=timezone.now() - timezone.timedelta(days=1),
            closing_date=timezone.now() + timezone.timedelta(days=10),
            owner=self.officer,
            status="published",
        )

    def create_form(self, name="Agri entry", **extra):
        response = self.client.post(FORMS, {"start": "scratch", "name": name, **extra}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return response.json()["data"]["id"]

    def put_draft(self, form_id, document):
        return self.client.put(f"{FORMS}{form_id}/draft/", document, format="json")

    def published_form(self, document=None):
        form_id = self.create_form()
        self.assertEqual(self.put_draft(form_id, document or sample_document()).status_code, 200)
        response = self.client.post(f"{FORMS}{form_id}/publish/")
        self.assertEqual(response.status_code, 201, response.content)
        return form_id


class FormDraftDocumentTests(FormBuilderTestCase):
    def test_draft_round_trip_put_then_get_returns_the_same_document(self):
        form_id = self.create_form()
        document = sample_document()
        response = self.put_draft(form_id, document)
        self.assertEqual(response.status_code, 200, response.content)
        saved = response.json()["data"]

        fetched = self.client.get(f"{FORMS}{form_id}/draft/").json()["data"]
        self.assertEqual(fetched, saved)
        self.assertEqual(strip_ids(fetched), strip_ids({**document, "id": form_id}))
        self.assertEqual([row["row"] for row in fetched["steps"][0]["rows"]], [1, 2])
        self.assertEqual([item["width"] for item in fetched["steps"][0]["rows"][0]["fields"]], ["half", "half"])

        # Sending the saved document back changes nothing and keeps every id.
        again = self.put_draft(form_id, fetched).json()["data"]
        self.assertEqual(strip_ids(again), strip_ids(fetched))
        self.assertEqual(again["steps"][1]["rows"][0]["fields"][0]["id"], fetched["steps"][1]["rows"][0]["fields"][0]["id"])

    def test_put_reorders_moves_and_deletes(self):
        form_id = self.create_form()
        saved = self.put_draft(form_id, sample_document()).json()["data"]
        stage_id = saved["steps"][1]["rows"][0]["fields"][0]["id"]
        # Swap the steps, move "stage" into the first step's first row and drop "omang" and an option.
        about, idea = saved["steps"]
        stage = idea["rows"].pop(0)["fields"][0]
        stage["options"] = stage["options"][:1]
        about["rows"] = [{"fields": [stage]}, about["rows"][0]]
        response = self.put_draft(form_id, {**saved, "steps": [idea, about]})
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()["data"]
        self.assertEqual([step["code"] for step in data["steps"]], ["your-idea", "about-you"])
        moved = data["steps"][1]["rows"][0]["fields"][0]
        self.assertEqual((moved["id"], moved["key"], len(moved["options"])), (stage_id, "stage", 1))
        keys = [item["key"] for step in data["steps"] for row in step["rows"] for item in row["fields"]]
        self.assertNotIn("omang", keys)

    def test_put_swaps_two_field_keys(self):
        form_id = self.create_form()
        saved = self.put_draft(form_id, sample_document()).json()["data"]
        first, last = saved["steps"][0]["rows"][0]["fields"]
        first["key"], last["key"] = "last_name", "first_name"
        response = self.put_draft(form_id, saved)
        self.assertEqual(response.status_code, 200, response.content)
        swapped = response.json()["data"]["steps"][0]["rows"][0]["fields"]
        self.assertEqual([(item["id"], item["key"]) for item in swapped], [(first["id"], "last_name"), (last["id"], "first_name")])

    def test_put_rejects_a_bad_document_and_saves_nothing(self):
        form_id = self.create_form()
        document = sample_document()
        document["steps"][0]["rows"][0]["fields"][1]["key"] = "first_name"  # duplicate key
        document["steps"][1]["rows"][0]["fields"][0]["type"] = "spinner"
        document["steps"][1]["rows"][2]["fields"][0]["visible_if"] = {"all": [{"field": "has_company", "op": "greater"}]}
        response = self.put_draft(form_id, document)
        self.assertEqual(response.status_code, 400)
        paths = {item["path"] for item in response.json()["errors"]["errors"]}
        self.assertIn("steps[0].rows[0].fields[1].key", paths)
        self.assertIn("steps[1].rows[0].fields[0].type", paths)
        self.assertIn("steps[1].rows[2].fields[0].visible_if", paths)
        draft = self.client.get(f"{FORMS}{form_id}/draft/").json()["data"]
        self.assertEqual([step["code"] for step in draft["steps"]], ["step-1"])

    def test_plain_strings_are_saved_as_english(self):
        form_id = self.create_form()
        document = sample_document(tn=False)
        document["steps"][0]["title"] = "About you"
        response = self.put_draft(form_id, document)
        self.assertEqual(response.json()["data"]["steps"][0]["title"], {"en": "About you", "tn": ""})

    def test_staff_only(self):
        form_id = self.create_form()
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(FORMS).status_code, 403)
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/draft/").status_code, 403)
        self.assertEqual(self.put_draft(form_id, sample_document()).status_code, 403)
        self.assertEqual(self.client.post(f"{FORMS}{form_id}/publish/").status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(FORMS).status_code, 401)


class FormConditionTests(TestCase):
    def test_simple_condition_shape(self):
        condition = {"all": [{"field": "has_company", "op": "equals", "value": "yes"}, {"field": "name", "op": "is_not_empty"}]}
        self.assertTrue(FormConditionService.evaluate(condition, {"has_company": "yes", "name": "Kgosi"}))
        self.assertFalse(FormConditionService.evaluate(condition, {"has_company": "yes", "name": ""}))
        either = {"any": [{"field": "a", "op": "in", "value": ["x", "y"]}, {"field": "b", "op": "is_empty"}]}
        self.assertTrue(FormConditionService.evaluate(either, {"a": "z"}))
        self.assertFalse(FormConditionService.evaluate(either, {"a": "z", "b": "set"}))
        self.assertEqual(FormConditionService.referenced_fields(either), {"a", "b"})

    def test_older_condition_shape_still_works(self):
        condition = {"operator": "OR", "conditions": [{"field": "needs_deck", "operator": "equals", "value": True}]}
        self.assertTrue(FormConditionService.evaluate(condition, {"needs_deck": True}))

    def test_omang_check(self):
        self.assertIsNone(omang_error("123416789"))
        self.assertIsNone(omang_error("1234 2 6789".replace(" ", "")))
        self.assertIsNotNone(omang_error("123456789"))  # 5th digit must be 1 or 2
        self.assertIsNotNone(omang_error("12341678"))


class FormPublishTests(FormBuilderTestCase):
    def test_publish_is_blocked_while_setswana_is_missing(self):
        form_id = self.create_form()
        self.put_draft(form_id, sample_document(tn=False))
        response = self.client.post(f"{FORMS}{form_id}/publish/")
        self.assertEqual(response.status_code, 400)
        problems = response.json()["problems"]
        self.assertTrue(problems)
        self.assertTrue(all(problem["code"] == "missing_translation" and problem["language"] == "tn" for problem in problems))
        self.assertIn({"code": "missing_translation", "message": "Option label has no Setswana text.", "step": "your-idea", "field": "stage", "option": "idea", "language": "tn"}, problems)
        self.assertFalse(FormVersion.objects.filter(form_id=form_id).exists())
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/publish-check/").json()["data"]["problems"], problems)

        # Filling every row on the translations screen unblocks it.
        rows = self.client.get(f"{FORMS}{form_id}/translations/").json()["data"]["rows"]
        missing = [row for row in rows if row["missing"]]
        self.assertEqual(len(missing), len(problems))
        saved = self.client.put(f"{FORMS}{form_id}/translations/", {"rows": [{"key": row["key"], "tn": f"TN {row['en']}"} for row in missing]}, format="json")
        self.assertEqual(saved.status_code, 200, saved.content)
        self.assertEqual(saved.json()["data"]["missing_count"], 0)
        published = self.client.post(f"{FORMS}{form_id}/publish/")
        self.assertEqual(published.status_code, 201, published.content)
        self.assertEqual(published.json()["data"]["number"], 1)
        self.assertEqual(SubmissionForm.objects.get(id=form_id).status, "live")
        self.assertTrue(AuditLog.objects.filter(action_type="form_published").exists())

    def test_english_only_form_publishes_without_setswana(self):
        form_id = self.create_form(languages=["en"])
        document = sample_document(tn=False)
        document["languages"] = ["en"]
        self.put_draft(form_id, document)
        self.assertEqual(self.client.post(f"{FORMS}{form_id}/publish/").status_code, 201)

    def test_publish_checks_labels_options_and_conditions(self):
        form_id = self.create_form()
        document = sample_document()
        idea_rows = document["steps"][1]["rows"]
        idea_rows[0]["fields"][0]["options"] = []
        idea_rows[1]["fields"][0]["label"] = text("")
        idea_rows[2]["fields"][0]["visible_if"] = {"all": [{"field": "no_such_question", "op": "equals", "value": "yes"}]}
        self.assertEqual(self.put_draft(form_id, document).status_code, 200)
        response = self.client.post(f"{FORMS}{form_id}/publish/")
        self.assertEqual(response.status_code, 400)
        codes = {(problem["code"], problem.get("field")) for problem in response.json()["problems"]}
        self.assertIn(("missing_options", "stage"), codes)
        self.assertIn(("missing_label", "has_company"), codes)
        self.assertIn(("unknown_condition_field", "company_name"), codes)

    def test_applicants_see_only_published_versions(self):
        form_id = self.create_form()
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/published/").status_code, 404)

        self.client.force_authenticate(self.officer)
        self.put_draft(form_id, sample_document())
        self.client.post(f"{FORMS}{form_id}/publish/")
        draft = self.client.get(f"{FORMS}{form_id}/draft/").json()["data"]
        draft["steps"][0]["title"] = text("Changed in the draft", "Go fetotswe")
        self.put_draft(form_id, draft)

        self.client.force_authenticate(None)
        english = self.client.get(f"{FORMS}{form_id}/published/").json()["data"]
        self.assertEqual(english["steps"][0]["title"], "About you")
        self.assertEqual(english["version"]["number"], 1)
        setswana = self.client.get(f"{FORMS}{form_id}/published/?lang=tn").json()["data"]
        self.assertEqual(setswana["steps"][0]["title"], "Ka ga gago")
        self.assertEqual(setswana["steps"][0]["tips"], ["Dirisa leina le le mo Omang ya gago."])
        stage = setswana["steps"][1]["rows"][0]["fields"][0]
        self.assertEqual(stage["options"][0], {"id": stage["options"][0]["id"], "value": "idea", "label": "Ke kakanyo fela", "description": "Ga e ise e lekwe"})
        # English fallback for a text without Setswana.
        self.assertEqual(stage["options"][1]["description"], "")

        self.client.force_authenticate(self.officer)
        self.client.post(f"{FORMS}{form_id}/publish/")
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/published/").json()["data"]["steps"][0]["title"], "Changed in the draft")

    def test_published_falls_back_to_english_per_text(self):
        form_id = self.create_form(languages=["en"])
        document = sample_document(tn=False)
        document["languages"] = ["en"]
        document["steps"][0]["title"] = text("About you", "Ka ga gago")
        self.put_draft(form_id, document)
        self.client.post(f"{FORMS}{form_id}/publish/")
        data = self.client.get(f"{FORMS}{form_id}/published/?lang=tn").json()["data"]
        self.assertEqual(data["steps"][0]["title"], "Ka ga gago")
        self.assertEqual(data["steps"][1]["title"], "Your idea")


class FormTranslationTests(FormBuilderTestCase):
    def test_rows_list_every_text_with_where_and_missing(self):
        form_id = self.create_form()
        document = sample_document()
        document["steps"][0]["rows"][0]["fields"][0]["label"] = text("First name")
        self.put_draft(form_id, document)
        rows = {row["key"]: row for row in self.client.get(f"{FORMS}{form_id}/translations/").json()["data"]["rows"]}
        self.assertEqual(rows["field.first_name.label"]["missing"], True)
        self.assertEqual(rows["field.first_name.label"]["where"], "Step 1 · About you › First name › label")
        self.assertEqual(rows["option.stage.idea.description"]["tn"], "Ga e ise e lekwe")
        self.assertEqual(rows["step.about-you.tips.1"]["en"], "Use the name on your Omang.")
        self.assertFalse(rows["form.name"]["missing"])

    def test_save_rejects_unknown_keys(self):
        form_id = self.create_form()
        response = self.client.put(f"{FORMS}{form_id}/translations/", {"rows": [{"key": "field.nope.label", "tn": "x"}]}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_suggest_without_a_provider_is_501(self):
        form_id = self.create_form()
        self.put_draft(form_id, sample_document(tn=False))
        response = self.client.post(f"{FORMS}{form_id}/translations/suggest/", {}, format="json")
        self.assertEqual(response.status_code, 501)
        self.assertEqual(response.json()["errors"]["code"], "translation_provider_not_configured")

    @override_settings(FORM_TRANSLATION_PROVIDER="tests.api.test_form_builder_api.EchoProvider")
    def test_suggest_returns_suggestions_and_saves_nothing(self):
        form_id = self.create_form()
        self.put_draft(form_id, sample_document(tn=False))
        response = self.client.post(f"{FORMS}{form_id}/translations/suggest/", {"keys": ["field.first_name.label"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["suggestions"], [{"key": "field.first_name.label", "en": "First name", "suggested": "[tn] First name", "needs_review": True}])
        rows = {row["key"]: row for row in self.client.get(f"{FORMS}{form_id}/translations/").json()["data"]["rows"]}
        self.assertTrue(rows["field.first_name.label"]["missing"])

    def test_request_review_notifies_people_with_the_role(self):
        reviewer = User.objects.create_user(email="reviewer-b4@example.com", password="StrongPass123")
        RoleService.assign_roles(reviewer, [RoleType.ADMINISTRATOR])
        form_id = self.create_form()
        response = self.client.post(f"{FORMS}{form_id}/translations/request-review/", {"role": RoleType.ADMINISTRATOR}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["notified"], 1)
        self.assertTrue(Notification.objects.filter(recipient=reviewer, notification_type="form_translation_review").exists())
        self.assertEqual(self.client.post(f"{FORMS}{form_id}/translations/request-review/", {"role": "wizard"}, format="json").status_code, 400)


class EchoProvider:
    def translate(self, texts, *, source, target):
        return [f"[{target}] {item}" for item in texts]


class FormLibraryTests(FormBuilderTestCase):
    def test_four_templates_are_seeded(self):
        data = self.client.get(f"{FORMS}templates/").json()["data"]
        names = {item["name"]: item for item in data}
        self.assertEqual(set(names), {"Challenge entry", "Pitch an idea", "Quick idea", "Event registration"})
        self.assertEqual(names["Quick idea"]["question_count"], 4)
        self.assertTrue(names["Quick idea"]["works_on_ussd"])
        self.assertEqual(names["Challenge entry"]["step_count"], 3)
        self.assertTrue(names["Challenge entry"]["estimated_minutes"])

    def test_create_from_template_scratch_and_copy(self):
        template = SubmissionForm.objects.get(is_template=True, code="tpl-challenge-entry")
        program = self.make_program()
        response = self.client.post(FORMS, {"start": "template", "source_id": str(template.id), "name": "Agri 2027 entry", "program_id": str(program.id)}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        created = response.json()["data"]
        self.assertEqual((created["name"], created["status"], created["is_template"]), ("Agri 2027 entry", "draft", False))
        self.assertEqual(created["question_count"], 14)
        self.assertEqual(created["linked_programs"][0]["id"], str(program.id))
        self.assertEqual(created["layout_preview"][:2], [["half", "half"], ["half", "half"]])
        program.refresh_from_db()
        self.assertEqual(str(program.submission_form.id), created["id"])
        copy = self.client.get(f"{FORMS}{created['id']}/draft/").json()["data"]
        original = self.client.get(f"{FORMS}{template.id}/draft/").json()["data"]
        self.assertEqual(strip_ids(copy)["steps"], strip_ids(original)["steps"])

        self.assertEqual(self.client.post(FORMS, {"start": "template", "source_id": created["id"], "name": "x"}, format="json").status_code, 400)
        self.assertEqual(self.client.post(FORMS, {"start": "copy", "name": "x"}, format="json").status_code, 400)
        scratch = self.client.get(f"{FORMS}{self.create_form('Blank')}/draft/").json()["data"]
        self.assertEqual(len(scratch["steps"]), 1)

    def test_list_counts_search_and_filters(self):
        self.published_form()
        self.create_form("Event sign up")
        response = self.client.get(FORMS)
        data = response.json()["data"]
        self.assertEqual(data["counts"], {"draft": 1, "live": 1, "closed": 0, "archived": 0, "all": 2})
        self.assertEqual(len(data["results"]), 2)
        self.assertEqual(len(self.client.get(f"{FORMS}?status=live").json()["data"]["results"]), 1)
        searched = self.client.get(f"{FORMS}?search=event").json()["data"]
        self.assertEqual([item["name"] for item in searched["results"]], ["Event sign up"])
        self.assertEqual(searched["counts"]["all"], 1)
        item = next(item for item in data["results"] if item["status"] == "live")
        self.assertEqual((item["question_count"], item["step_count"], item["latest_version"]["number"]), (6, 2, 1))

    def test_duplicate_and_archive(self):
        form_id = self.published_form()
        duplicate = self.client.post(f"{FORMS}{form_id}/duplicate/", {}, format="json")
        self.assertEqual(duplicate.status_code, 201, duplicate.content)
        copy = duplicate.json()["data"]
        self.assertEqual((copy["name"], copy["status"], copy["latest_version"]), ("Copy of Youth agri challenge entry", "draft", None))
        self.assertEqual(copy["question_count"], 6)

        archived = self.client.post(f"{FORMS}{form_id}/archive/")
        self.assertEqual(archived.json()["data"]["status"], "archived")
        self.assertNotIn(form_id, [item["id"] for item in self.client.get(FORMS).json()["data"]["results"]])
        self.assertEqual(self.put_draft(form_id, sample_document()).status_code, 400)
        self.assertEqual(self.client.post(f"{FORMS}{form_id}/publish/").status_code, 400)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/published/").status_code, 404)

    def test_attach_form_to_program(self):
        program = self.make_program()
        draft_only = self.create_form()
        response = self.client.put(f"/api/programs/{program.id}/form/", {"form_id": draft_only}, format="json")
        self.assertEqual(response.status_code, 400)

        form_id = self.published_form()
        response = self.client.put(f"/api/programs/{program.id}/form/", {"form_id": form_id}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        program.refresh_from_db()
        self.assertEqual(str(program.submission_form.id), form_id)
        detail = self.client.get(f"/api/programs/{program.id}/").json()
        self.assertEqual(detail["form_id"], form_id)
        self.assertEqual(
            detail["form_summary"],
            {"form_id": form_id, "name": "Youth agri challenge entry", "status": "live", "version_number": 1, "step_count": 2, "question_count": 6, "challenge_question_count": 1, "estimated_minutes": None},
        )
        # Anyone can still read the programme form (older endpoint), but only staff can change it.
        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.put(f"/api/programs/{program.id}/form/", {"form_id": form_id}, format="json").status_code, 403)
        self.assertEqual(self.client.get(f"/api/programs/{program.id}/form/").status_code, 200)

    def test_one_form_serves_two_programs(self):
        form_id = self.published_form()
        first, second = self.make_program("First call"), self.make_program("Second call")
        for program in (first, second):
            self.client.put(f"/api/programs/{program.id}/form/", {"form_id": form_id}, format="json")
        data = self.client.get(f"{FORMS}{form_id}/").json()["data"]
        self.assertEqual({item["title"] for item in data["linked_programs"]}, {"First call", "Second call"})


class FormExportTests(FormBuilderTestCase):
    def test_csv_has_one_column_per_field_key_and_one_row_per_submission(self):
        form_id = self.published_form()
        form = SubmissionForm.objects.get(id=form_id)
        program = self.make_program()
        program.form = form
        program.save()
        version = FormVersion.objects.get(form=form)
        for number, (name, stage) in enumerate((("Neo", "idea"), ("Kago", ["idea", "selling"])), start=1):
            submission = Submission.objects.create(
                reference_number=f"CEDA-IP-2026-0000{number}",
                program=program,
                innovator=self.innovator,
                title=f"Idea {number}",
                submission_type="idea",
                submitted_at=timezone.now(),
                form_version=version,
                form_version_number=1,
            )
            for key, value in (("first_name", name), ("stage", stage)):
                SubmissionResponse.objects.create(submission=submission, form_field=form.fields.get(key=key), field_key_snapshot=key, value=value)

        response = self.client.get(f"{FORMS}{form_id}/responses/export/?format=csv")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response["Content-Type"].startswith("text/csv"))
        rows = list(csv.reader(io.StringIO(b"".join(response.streaming_content).decode())))
        self.assertEqual(rows[0], ["submission_id", "reference_number", "programme", "submitted_at", "form_version", "first_name", "last_name", "omang", "stage", "has_company", "company_name"])
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1][5], "Neo")
        self.assertEqual(rows[2][8], "idea; selling")

        self.client.force_authenticate(self.innovator)
        self.assertEqual(self.client.get(f"{FORMS}{form_id}/responses/export/?format=csv").status_code, 403)


class FieldTypeAnswerTests(FormBuilderTestCase):
    def test_new_field_types_check_answers_and_layout_fields_are_skipped(self):
        from apps.reference.models import District
        from apps.submissions.draft_services import ApplicationDraftService

        form_id = self.create_form(languages=["en"])
        document = sample_document(tn=False)
        document["steps"][1]["rows"].append(
            {
                "fields": [
                    field("intro", "Before you start", "heading", required=True),
                    field("where", "District", "district"),
                    field("crops", "Crops", "checkboxes", options=[{"value": "maize", "label": text("Maize")}, {"value": "sorghum", "label": text("Sorghum")}]),
                ]
            }
        )
        self.put_draft(form_id, document)
        form = SubmissionForm.objects.get(id=form_id)
        fields = {item.key: item for item in form.fields.all()}
        check = ApplicationDraftService.field_errors
        district = District.objects.filter(active=True).first()

        self.assertEqual(check(fields["stage"], {"stage": "idea"}), [])
        self.assertEqual(check(fields["stage"], {"stage": "flying"}), ["Choose from the options given."])
        self.assertEqual(check(fields["stage"], {"stage": ["idea"]}), ["Choose one option."])
        self.assertEqual(check(fields["crops"], {"crops": ["maize", "sorghum"]}), [])
        self.assertEqual(check(fields["crops"], {"crops": ["maize", "rice"]}), ["Choose from the options given."])
        self.assertEqual(check(fields["has_company"], {"has_company": "maybe"}), ["Choose yes or no."])
        self.assertEqual(check(fields["omang"], {"omang": "123456789"}), ["This is not a valid Omang number. Check the 5th digit."])
        self.assertEqual(check(fields["omang"], {"omang": "123416789"}), [])
        if district is not None:
            self.assertEqual(check(fields["where"], {"where": district.slug}), [])
        self.assertEqual(check(fields["where"], {"where": "atlantis"}), ["Choose a district from the list."])
        # A heading never needs an answer, even when marked required.
        self.assertFalse(fields["intro"].required)
        self.assertEqual(check(fields["intro"], {}), [])
