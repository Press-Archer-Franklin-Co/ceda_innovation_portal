"""AI guidance in WhatsApp journeys: off by default, one AI message per step, silent fallback, never on USSD."""

from types import SimpleNamespace
from unittest.mock import patch

from apps.assistant.providers import AssistantUnavailable
from apps.channels import upgrade
from apps.channels.engine import JourneyRunner
from apps.channels.models import Journey, JourneyNode
from apps.channels.services import JourneyService
from tests.api.test_channels_api import BASE, data
from tests.api.test_channels_full_flow_api import FlowTestCase


class FakeAI:
    """Stands in for apps.assistant.gateway.ask: records calls, answers like the AI helper."""

    def __init__(self, fail=False):
        self.calls, self.fail = [], fail

    def __call__(self, feature, **kwargs):
        self.calls.append(feature)
        if self.fail:
            raise AssistantUnavailable("provider_error")
        if feature == "help":
            return SimpleNamespace(data={"answer": "Say what problem your idea solves, in one or two lines."})
        return SimpleNamespace(data={"worth_saying": True, "suggestion": "You could add who will use it and how many."})


def set_ai(journey, on=True):
    for node in JourneyNode.objects.filter(journey=journey, type__in=["form_questions", "file", "question"]):
        node.settings = {**node.settings, "ai_guidance": on}
        node.save(update_fields=["settings"])
    journey.has_unpublished_changes = True
    journey.save(update_fields=["has_unpublished_changes"])
    JourneyService.publish(journey=journey, actor=None)


class AIGuidanceTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        upgrade.upgrade(self.whatsapp_journey)
        self.journey = Journey.objects.get(pk=self.whatsapp_journey.pk)
        self.use_journey(self.journey)
        self.ai = FakeAI()
        for target, value in (("apps.assistant.gateway.ask", self.ai), ("apps.assistant.gateway.unavailable_reason", lambda feature, *a, **k: "")):
            patcher = patch(target, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def to_problem(self):
        for text in ("Hi", "1", "Solar pump", "Neo Kgosi", "General idea"):
            self.say(text)
        self.assertIn("What problem does your idea solve?", self.last_text())

    def test_switch_off_means_no_ai_messages(self):
        self.to_problem()
        self.say("Dirty water in villages")
        self.say("help")
        self.assertEqual(self.ai.calls, [])
        self.assertNotIn("AI helper", " ".join(form.get("Body", "") for form in self.fake.sent()))

    def test_switch_is_listed_for_the_builder_and_off_by_default(self):
        types = {item["type"]: item for item in data(self.client.get(f"{BASE}/node-types/"))}
        for kind in ("question", "file", "form_questions"):
            field = next(f for f in types[kind]["fields"] if f["name"] == "ai_guidance")
            self.assertIs(field["default"], False)

    def test_one_suggestion_never_changes_the_answer(self):
        set_ai(self.journey)
        self.to_problem()
        self.say("Dirty water in villages")
        self.assertIn("Suggestion from the AI helper: You could add who will use it", self.last_text())
        self.say("Add more")
        self.assertIn("Type what you want to add.", self.last_text())
        self.say("About 300 families")
        self.assertIn("How does your idea solve it?", self.last_text())
        from apps.submissions.models import ApplicationDraft

        self.assertEqual(ApplicationDraft.objects.get(title="Solar pump").draft_data["problem"], "Dirty water in villages\nAbout 300 families")
        self.assertEqual(self.ai.calls.count("draft_check"), 1)
        self.say("back")
        self.say("Dirty water, about 300 families")  # the same question again: no second AI message
        self.assertIn("How does your idea solve it?", self.last_text())
        self.assertEqual(self.ai.calls.count("draft_check"), 1)
        self.say("A filter")  # the next question may have its own one suggestion
        self.assertEqual(self.ai.calls.count("draft_check"), 2)
        self.assertIn("Suggestion from the AI helper", self.last_text())

    def test_keep_my_answer_moves_on(self):
        set_ai(self.journey)
        self.to_problem()
        self.say("Dirty water")
        self.say("Keep my answer")
        self.assertIn("How does your idea solve it?", self.last_text())

    def test_help_answers_then_asks_the_step_again(self):
        set_ai(self.journey)
        self.to_problem()
        self.say("?")
        text = self.last_text()
        self.assertIn("Say what problem your idea solves", text)
        self.assertIn("What problem does your idea solve?", text)
        self.say("help")  # one AI message per step
        self.assertEqual(self.ai.calls.count("help"), 1)

    def test_failure_falls_back_silently_and_logs_the_reason(self):
        set_ai(self.journey)
        self.ai.fail = True
        self.to_problem()
        with self.assertLogs("apps.channels.whatsapp", level="INFO") as logs:
            self.say("Dirty water")
        self.assertIn("How does your idea solve it?", self.last_text())
        self.assertTrue(any("ai_guidance" in line and "reason=provider_error" in line for line in logs.output))
        self.assertFalse(any("Dirty water" in line for line in logs.output))

    def test_not_set_up_means_no_call(self):
        set_ai(self.journey)
        with patch("apps.assistant.gateway.unavailable_reason", lambda feature, *a, **k: "no_connection"):
            self.to_problem()
            self.say("Dirty water")
            self.assertIn("How does your idea solve it?", self.last_text())  # no suggestion
            self.say("help")  # an ordinary answer, exactly as without AI guidance
        self.assertEqual(self.ai.calls, [])
        self.assertIn("Send a photo or document", self.last_text())

    def test_a_document_gets_reading_then_at_most_three_notes(self):
        set_ai(self.journey)
        self.to_problem()
        self.say("Dirty water")
        self.say("Keep my answer")
        self.say("A filter")
        self.say("Keep my answer")
        notes = {"key_points": [{"text": f"Note {i}"} for i in range(1, 6)]}
        with patch("apps.assistant.document_review.review", return_value=notes), self.captureOnCommitCallbacks(execute=True):
            self.send_file()
        bodies = [form.get("Body", "") for form in self.fake.sent()]
        self.assertTrue(any("Reading your document..." in body for body in bodies[-2:]))
        self.assertIn("- Note 3", bodies[-1])
        self.assertNotIn("Note 4", bodies[-1])

    def test_ussd_never_calls_ai(self):
        journey = Journey.objects.get(name="CEDA Innovation (USSD)")
        set_ai(journey)
        runner = JourneyRunner(journey.latest_version.graph, {"vars": {}}, channel="ussd", phone="+26770000020", user=None, session_id="u", simulation=True)
        runner.start()
        for text in ("1", "Solar pump", "Dirty water in villages", "help"):
            runner.answer(text)
        self.assertEqual(self.ai.calls, [])
