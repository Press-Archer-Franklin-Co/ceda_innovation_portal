"""AI Copilot Branch B: the Need help guide, Create with AI and Setswana suggestions. Every SDK is faked."""

from types import SimpleNamespace
from unittest.mock import patch

from django.core.cache import cache

from apps.accounts.models import Role
from apps.assistant.models import AIDraft, AssistantSettings, ManualPage, UsageRecord
from apps.audit.models import AuditLog
from apps.core.constants import RoleType
from apps.submissions.models import Submission
from tests.api.test_assistant_api import BASE, AssistantTestCase, data, message

TARGETS = [{"id": "workflows.create", "label": "Create workflow", "kind": "button"}, {"id": "workflows.name", "label": "Name", "kind": "field"}]
MENU = [{"path": "/staff/forms", "label": "Forms"}]
GUIDE_ANSWER = {
    "language": "en",
    "answer": "Here is how to create a workflow.",
    "steps": [
        {"id": "s1", "text": "Press Create workflow.", "target_id": "workflows.create", "route": "", "done_when": {"type": "click", "target_id": "workflows.create", "route": ""}},
        {"id": "s2", "text": "Open the secret admin page.", "target_id": "admin.delete-everything", "route": "/staff/admin/secret", "done_when": {"type": "route", "target_id": "", "route": "/staff/admin/secret"}},
        {"id": "s3", "text": "Open Forms.", "target_id": "", "route": "/staff/forms", "done_when": {"type": "route", "target_id": "", "route": "/staff/forms"}},
    ],
    "source_ids": [],
    "handoff_suggested": False,
}

FORM_STEP = {
    "code": "about",
    "title": {"en": "About the loan", "tn": ""},
    "description": {"en": "", "tn": ""},
    "fields": [
        {"key": "amount", "type": "number", "label": {"en": "How much do you need?", "tn": "O tlhoka bokae?"}, "help_text": {"en": "", "tn": ""}, "required": True, "options": [], "rules": [], "show_if_field": "", "show_if_value": ""},
        {"key": "colour", "type": "colour_picker", "label": {"en": "Favourite colour", "tn": ""}, "help_text": {"en": "", "tn": ""}, "required": False, "options": [], "rules": [], "show_if_field": "", "show_if_value": ""},
    ],
}
BUILDER_ANSWER = {
    "language": "en",
    "summary": "A short loan form and a two-step review.",
    "form": {"name": {"en": "Small loan", "tn": ""}, "description": {"en": "", "tn": ""}, "steps": [FORM_STEP]},
    "workflow": {
        "name": "Small loan review",
        "description": "",
        "steps": [
            {"name": "Officer check", "code": "check", "role_required": "innovation_officer", "actions_allowed": ["approve", "return", "publish_now"], "submission_status": "screening", "due_in_hours": 48, "execution_mode": "sequential", "requires_assignment": False, "assignment_role": "", "requires_evaluation": False},
            {"name": "Finance sign-off", "code": "finance", "role_required": "finance_team", "actions_allowed": ["approve"], "submission_status": "in_review", "due_in_hours": 0, "execution_mode": "sequential", "requires_assignment": False, "assignment_role": "", "requires_evaluation": False},
        ],
    },
    "missing": [{"what": "There is no Finance team yet.", "fix": "Create a Finance role in Roles & permissions."}],
}


def guide_payload(**extra):
    return {"app": "staff", "route": "/staff/workflows", "page_title": "Workflows", "question": "How do I create a workflow?", "targets": TARGETS, "menu": MENU, **extra}


class GuideTests(AssistantTestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_steps_never_point_outside_the_page_and_the_server_adds_the_role(self):
        fake = self.fake(message(GUIDE_ANSWER))
        self.switch_on()
        self.as_user(self.officer)
        result = data(self.client.post(f"{BASE}/guide/", {**guide_payload(), "role": "administrator"}, format="json"))
        self.assertTrue(result["available"], result)
        steps = result["steps"]
        self.assertEqual(steps[0]["target_id"], "workflows.create")
        self.assertEqual(steps[0]["done_when"], {"type": "click", "target_id": "workflows.create", "route": None})
        self.assertIsNone(steps[1]["target_id"])  # not on the page: dropped
        self.assertIsNone(steps[1]["route"])  # not in the menu: dropped
        self.assertEqual(steps[1]["done_when"]["type"], "none")
        self.assertEqual(steps[2]["route"], "/staff/forms")
        content = fake.last["messages"][0]["content"]
        self.assertIn("Innovation Officer", content)
        self.assertNotIn("Role: administrator", content)

    def test_at_most_six_steps_and_answers_are_cached_per_route_role_and_language(self):
        many = {**GUIDE_ANSWER, "steps": [{**GUIDE_ANSWER["steps"][0], "id": f"s{n}"} for n in range(9)]}
        fake = self.fake(message(many))
        self.switch_on()
        self.as_user(self.officer)
        first = data(self.client.post(f"{BASE}/guide/", guide_payload(), format="json"))
        self.assertEqual(len(first["steps"]), 6)
        second = data(self.client.post(f"{BASE}/guide/", guide_payload(done_step_ids=["s1"]), format="json"))
        self.assertTrue(second["cached"])
        self.assertTrue(second["steps"][0]["done"])
        self.assertEqual(len(fake.calls), 1)
        ManualPage.objects.create(title="Workflows", text="Press Create workflow.", portal_path="/staff/workflows")
        self.assertFalse(data(self.client.post(f"{BASE}/guide/", guide_payload(), format="json"))["cached"])

    def test_guests_only_when_allowed(self):
        self.fake(message(GUIDE_ANSWER))
        self.switch_on(guests=False)
        self.assertEqual(data(self.client.post(f"{BASE}/guide/", guide_payload(app="public", route="/"), format="json")), {"available": False, "handoff_suggested": True})
        AssistantSettings.objects.update(guests_can_use_guide=True)
        self.assertTrue(data(self.client.post(f"{BASE}/guide/", guide_payload(app="public", route="/"), format="json"))["available"])

    def test_hands_over_when_asked_or_when_the_ai_is_off(self):
        fake = self.fake(message(GUIDE_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        result = data(self.client.post(f"{BASE}/guide/", guide_payload(question="I want to talk to a person"), format="json"))
        self.assertTrue(result["handoff_suggested"])
        self.assertEqual(fake.calls, [])
        AssistantSettings.objects.update(features={"guide": False})
        cache.clear()
        self.assertEqual(data(self.client.post(f"{BASE}/guide/", guide_payload(), format="json")), {"available": False, "handoff_suggested": True})

    def test_answers_in_setswana_when_asked_in_setswana(self):
        fake = self.fake(message({**GUIDE_ANSWER, "language": "tn"}))
        self.switch_on()
        self.as_user(self.innovator)
        result = data(self.client.post(f"{BASE}/guide/", guide_payload(question="Ke dira jang gore ke tsenye kakanyo ya me mo potaleng?", language="tn"), format="json"))
        self.assertEqual(result["language"], "tn")
        self.assertIn("Write every answer in Setswana", "\n".join(block["text"] for block in fake.last["system"]))

    def test_bad_request(self):
        self.as_user(self.innovator)
        self.assertEqual(self.client.post(f"{BASE}/guide/", {"route": "/x"}, format="json").status_code, 400)


class FakeForm(SimpleNamespace):
    pass


class BuilderTests(AssistantTestCase):
    def setUp(self):
        super().setUp()
        self.manager = self.person("c3-manager@example.com", RoleType.INNOVATION_MANAGER)

    def services(self, *, form_errors=(), flow_errors=()):
        """Stand-ins for the backend lane's draft services (R-68) and the dry run. They save nothing."""
        calls = {"form": [], "workflow": [], "dry_run": []}
        form_errors, flow_errors = list(form_errors), list(flow_errors)

        def create_form(*, document, actor, program=None):
            calls["form"].append(document)
            return None, (form_errors.pop(0) if form_errors else [])

        def create_flow(*, spec, actor, program=None):
            calls["workflow"].append(spec)
            return None, (flow_errors.pop(0) if flow_errors else [])

        def dry_run(*, workflow, answers, submission_fields=None):
            calls["dry_run"].append(answers)
            return {"path": [{"stage": "check", "step": "Officer check", "outcome": "approve", "why": "sample"}], "problems": []}

        import apps.programs.form_builder as form_builder
        import apps.workflow.services as workflow_services

        for module, name, fn in ((form_builder, "create_draft_form_from_document", create_form), (workflow_services, "create_draft_workflow_from_spec", create_flow), (workflow_services, "run_workflow_dry_run", dry_run)):
            patcher = patch.object(module, name, fn, create=True)
            patcher.start()
            self.addCleanup(patcher.stop)
        return calls

    def create(self, user=None, make="both", **extra):
        self.as_user(user or self.admin)
        return self.client.post(f"{BASE}/builder-drafts/", {"description": "A small loan for women in farming, checked by an officer then finance.", "make": make, "general_ideas": True, **extra}, format="json")

    def test_drafts_need_assistant_build_and_builder_rights(self):
        self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        self.services()
        self.assertEqual(self.create(user=self.officer).status_code, 403)  # no assistant.build
        self.assertEqual(self.create(user=self.manager, make="form").status_code, 403)  # no forms.manage
        self.assertEqual(self.create(user=self.innovator).status_code, 403)
        self.assertEqual(self.create(user=self.admin).status_code, 201)
        self.assertEqual(self.create(user=self.admin, general_ideas=False).status_code, 400)

    def test_never_creates_roles_or_publishes_and_unknown_things_become_checks(self):
        self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        calls = self.services()
        roles_before = Role.objects.count()
        result = data(self.create())
        self.assertEqual(Role.objects.count(), roles_before)
        codes = {check["code"]: check for check in result["checks"]}
        self.assertIn("There is no role \"finance_team\" yet", codes["unknown_role"]["message"])
        self.assertEqual(codes["unknown_role"]["fix"], "/staff/admin/roles")
        self.assertEqual(codes["unknown_field_type"]["fix"], "edit_form")
        self.assertFalse(codes["setswana"]["ok"])
        self.assertEqual(codes["missing"]["message"], "There is no Finance team yet.")
        self.assertEqual(calls["workflow"][0]["steps"][0]["actions_allowed"], ["approve", "return"])  # unknown action dropped
        self.assertEqual(calls["form"][0]["steps"][0]["rows"][0]["fields"][0]["label"], {"en": "How much do you need?", "tn": "O tlhoka bokae?"})
        self.assertNotEqual(result["status"], "published")
        self.assertTrue(AuditLog.objects.filter(action_type="assistant_builder_draft_created").exists())

    def test_builder_errors_go_back_to_the_ai_once_then_show_as_checks(self):
        fake = self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        error = [{"path": "steps.0.code", "message": "Step codes must be unique."}]
        self.services(form_errors=[error, error])
        result = data(self.create(make="form"))
        self.assertEqual(len(fake.calls), 2)  # the draft, then one fix
        self.assertIn("Step codes must be unique.", [check["message"] for check in result["checks"]])

    def test_revise_keeps_the_same_draft(self):
        fake = self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        self.services()
        draft_id = data(self.create())["id"]
        AIDraft.objects.filter(pk=draft_id).update(draft_form=None)
        revised = data(self.client.post(f"{BASE}/builder-drafts/{draft_id}/revise/", {"change": "Add a question about land size."}, format="json"))
        self.assertEqual(revised["id"], draft_id)
        self.assertEqual(AIDraft.objects.count(), 1)
        self.assertEqual([turn["from"] for turn in revised["conversation"]], ["person", "ai", "person", "ai"])
        self.assertIn("Add a question about land size.", fake.last["messages"][0]["content"])
        self.assertTrue(AuditLog.objects.filter(action_type="assistant_builder_draft_revised").exists())

    def test_test_run_saves_nothing(self):
        self.fake(message(BUILDER_ANSWER), message({"language": "en", "answers": [{"key": "amount", "value": "5000"}]}))
        self.switch_on()
        calls = self.services()
        draft_id = data(self.create())["id"]
        submissions_before = Submission.objects.count()
        result = data(self.client.post(f"{BASE}/builder-drafts/{draft_id}/test/", {}, format="json"))
        self.assertEqual(Submission.objects.count(), submissions_before)
        self.assertEqual(calls["dry_run"], [])  # no saved draft workflow yet, so the run cannot happen
        test_check = next(check for check in result["checks"] if check["code"] == "test_run")
        self.assertFalse(test_check["ok"])
        self.assertEqual(result["test_result"]["answers"], {"amount": "5000"})
        self.assertTrue(AuditLog.objects.filter(action_type="assistant_builder_draft_tested").exists())

    def test_discard(self):
        self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        self.services()
        draft_id = data(self.create())["id"]
        self.assertEqual(data(self.client.post(f"{BASE}/builder-drafts/{draft_id}/discard/", {}, format="json"))["status"], "discarded")
        self.assertEqual(data(self.client.get(f"{BASE}/builder-drafts/")), [])
        self.assertEqual(self.client.post(f"{BASE}/builder-drafts/{draft_id}/revise/", {"change": "x"}, format="json").status_code, 400)

    def test_without_the_backend_services_the_draft_says_so(self):
        self.fake(message(BUILDER_ANSWER))
        self.switch_on()
        result = data(self.create(make="form"))
        if any("not on this server yet" in check["message"] for check in result["checks"]):
            self.assertEqual(result["status"], "drafting")
            self.assertIsNotNone(result["form"])


class TranslateTests(AssistantTestCase):
    def test_setswana_suggestions_come_from_the_ai_when_on_and_are_marked_for_review(self):
        from tests.api.test_form_builder_api import sample_document

        self.fake(message({"items": [{"number": 1, "text": "Leina la ntlha"}]}))
        self.switch_on()
        self.as_user(self.admin)
        form_id = self.client.post("/api/forms/", {"start": "scratch", "name": "Copilot test form"}, format="json").json()["data"]["id"]
        self.client.put(f"/api/forms/{form_id}/draft/", sample_document(tn=False), format="json")
        response = self.client.post(f"/api/forms/{form_id}/translations/suggest/", {"keys": ["field.first_name.label"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(response.json()["data"]["suggestions"], [{"key": "field.first_name.label", "en": "First name", "suggested": "Leina la ntlha", "needs_review": True}])
        rows = {row["key"]: row for row in self.client.get(f"/api/forms/{form_id}/translations/").json()["data"]["rows"]}
        self.assertTrue(rows["field.first_name.label"]["missing"])  # nothing saved
        self.assertEqual(UsageRecord.objects.get(outcome="ok").feature, "translate")

    def test_still_501_when_the_ai_is_off(self):
        self.as_user(self.admin)
        from tests.api.test_form_builder_api import sample_document

        form_id = self.client.post("/api/forms/", {"start": "scratch", "name": "Copilot test form 2"}, format="json").json()["data"]["id"]
        self.client.put(f"/api/forms/{form_id}/draft/", sample_document(tn=False), format="json")
        self.assertEqual(self.client.post(f"/api/forms/{form_id}/translations/suggest/", {}, format="json").status_code, 501)
