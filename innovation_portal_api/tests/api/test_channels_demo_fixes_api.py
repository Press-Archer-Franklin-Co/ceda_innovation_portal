"""Prompt 33: one answer per message, a way out on every step, and talking to a person both ways."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from apps.channels import upgrade
from apps.channels.engine import JourneyRunner
from apps.channels.models import Journey, JourneyNode, JourneySession
from apps.channels.services import JourneyService
from apps.channels.way_out import norm
from apps.conversations import services as inbox
from apps.conversations.models import Conversation, ConversationMessage
from apps.platform_config.http import DownloadResult
from apps.submissions.models import ApplicationDraft
from tests.api.test_channels_api import BASE, data
from tests.api.test_channels_full_flow_api import PHONE, FlowTestCase

PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89"
    b"\x00\x00\x00\rIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\xc9\xfe\x92\xef\x00\x00\x00\x00IEND\xaeB`\x82"
)


class Base(FlowTestCase):
    def setUp(self):
        super().setUp()
        upgrade.upgrade(self.whatsapp_journey)
        self.journey = Journey.objects.get(pk=self.whatsapp_journey.pk)
        self.use_journey(self.journey)

    def to_file_step(self):
        for text in ("Hi", "1", "Solar pump", "Neo Kgosi", "General idea", "Dirty water", "A filter"):
            self.say(text)
        self.assertIn("Send a photo or document", self.last_text())

    def replies(self):
        return len(self.fake.sent())


class OneAnswerTests(Base):
    def test_word_matching_ignores_case_spaces_punctuation_and_emoji(self):
        for text in ("skip", " SKIP ", "Skip!", "skip \U0001F44D", "*Skip.*"):
            self.assertEqual(norm(text), "skip")

    def test_still_waiting_shows_the_prompt_once(self):
        self.to_file_step()
        self.say("Ok")
        self.assertEqual(self.last_text().lower().count("send a photo or document"), 1)

    def test_skip_in_any_form_moves_on(self):
        self.to_file_step()
        self.say("Skip! \U0001F44D")
        self.assertIn("Reply YES", self.last_text())

    def test_twenty_quick_messages_each_get_one_reply_in_order(self):
        self.to_file_step()
        before = self.replies()
        for index in range(20):
            self.say(f"not a file {index}")
        self.assertEqual(self.replies(), before + 20)
        self.assertEqual(JourneySession.objects.filter(phone=PHONE, status="active").count(), 1)


class WayOutTests(Base):
    def test_a_greeting_is_not_an_answer(self):
        self.say("Hi")
        self.say("1")
        self.say("Solar pump")  # the name question is next
        self.say("Hello!")
        self.assertIn("You were adding your idea 'Solar pump'", self.last_text())
        session = JourneySession.objects.get(phone=PHONE, status="active")
        self.assertNotIn("name", session.state["vars"])
        self.say("Carry on")
        self.assertIn("What is your name?", self.last_text())

    def test_greeting_then_main_menu(self):
        self.say("Hi")
        self.say("1")
        self.say("Dumela")
        self.assertIn("Carry on or go to the main menu?", self.last_text())
        self.say("2")
        self.assertIn("1. Submit an idea", self.last_text())

    def test_menu_words_go_home(self):
        for word in ("home", "Main menu!", "GAE"):
            self.say("menu")
            self.say("1")
            self.say(word)
            self.assertIn("1. Submit an idea", self.last_text())

    def test_buttons_on_question_and_file_steps(self):
        self.use_journey(self.journey, interactive_mode="buttons")
        self.say("Hi")
        self.say("1")
        spec = [kw for url, kw in self.fake.calls if "content.twilio.com" in url][-1]["json_body"]["types"]["twilio/quick-reply"]
        self.assertEqual([a["title"] for a in spec["actions"]], ["Main menu", "Save and stop"])
        self.say("Save and stop", ButtonPayload="__stop", ButtonText="Save and stop")
        self.assertIn("Stopped", self.fake.sent()[-1].get("Body", ""))

    def test_save_and_stop_keeps_the_draft_and_check_my_idea_finds_it(self):
        self.say("Hi")
        self.say("1")
        self.say("Solar pump")
        self.say("Neo Kgosi")
        self.say("General idea")
        self.say("Dirty water")
        self.say("__stop")
        self.assertEqual(self.last_text(), "Saved. Choose Check my idea any time to carry on.")
        draft = ApplicationDraft.objects.get(title="Solar pump")
        self.assertEqual(draft.draft_data["problem"], "Dirty water")
        self.say("Hi")
        self.say("2")
        self.say("Solar pump")
        self.say("Continue this idea")
        self.assertIn("How does your idea solve it?", self.last_text())

    def test_cancel_asks_then_keeps_or_deletes(self):
        for answer, kept in (("Keep it", True), ("Delete it", False)):
            ApplicationDraft.objects.all().delete()
            self.say("menu")
            for text in ("1", "Solar pump", "Neo Kgosi", "General idea"):
                self.say(text)
            self.say("cancel")
            self.assertIn("Keep your idea", self.last_text())
            self.assertTrue(ApplicationDraft.objects.exists())
            self.say(answer)
            self.assertEqual(ApplicationDraft.objects.exists(), kept)
            self.say("menu")

    def test_ussd_and_buttons_off_add_zero(self):
        runner = JourneyRunner(self.ussd_journey.latest_version.graph, {"vars": {}}, channel="ussd", phone="+26770000009", user=None, session_id="u", simulation=True)
        runner.start()
        screen = runner.answer("1")
        self.assertTrue(screen.ussd_text().endswith("0. Main menu"))
        self.assertIn("1. Submit an idea", runner.answer("0").ussd_text())

    def test_zero_stays_an_answer_where_the_step_offers_it(self):
        runner = JourneyRunner(self.ussd_journey.latest_version.graph, {"vars": {}}, channel="ussd", phone="+26770000010", user=None, session_id="u", simulation=True)
        runner.start()
        screen = runner.answer("2")  # "Enter your idea number, or 0 for your latest idea."
        self.assertNotIn("0. Main menu", screen.ussd_text())
        self.assertNotIn("1. Submit an idea", runner.answer("0").ussd_text())

    def test_a_step_can_turn_the_way_out_off(self):
        journey = Journey.objects.create(name="No way out", channel="whatsapp", start_key="q", default_language="en")
        JourneyNode.objects.create(journey=journey, key="q", type="question", title="Q", text={"en": "Say hi", "tn": "Dumela"}, settings={"variable": "a", "way_out": False}, next_key="e")
        JourneyNode.objects.create(journey=journey, key="e", type="end", title="E", text={"en": "Bye", "tn": "Sala"}, settings={})
        JourneyService.publish(journey=journey, actor=None)
        runner = JourneyRunner(journey.latest_version.graph, {"vars": {}}, channel="whatsapp", phone="+26770000011", user=None, session_id="w", simulation=True)
        self.assertEqual([c.title for c in runner.start().choices], [])
        self.assertTrue(runner.answer("hi").end)
        self.assertEqual(runner.state["vars"]["a"], "hi")

    def test_node_types_show_the_switch(self):
        types = {item["type"]: item for item in data(self.client.get(f"{BASE}/node-types/"))}
        for kind in ("question", "file", "form_questions", "submit"):
            self.assertIn("way_out", [f["name"] for f in types[kind]["fields"]])


class HandoverTests(Base):
    def talk(self):
        self.say("Hi")
        self.say("4")
        return Conversation.objects.get(channel="whatsapp", contact_phone=PHONE)

    def bodies(self, conversation, role):
        return list(conversation.messages.filter(author_role=role, is_internal=False).order_by("created_at").values_list("body", flat=True))

    def test_first_message_is_a_summary_not_a_number(self):
        conversation = self.talk()
        first = conversation.messages.order_by("created_at").first()
        self.assertEqual(first.author_role, ConversationMessage.Author.BOT)
        self.assertTrue(first.body.startswith("Chose Talk to us on WhatsApp"))
        self.assertEqual(self.bodies(conversation, "person"), [])

    def test_both_ways_then_resolve_shows_the_menu(self):
        conversation = self.talk()
        sent_before = self.replies()
        inbox.reply(conversation, "Hello, how can I help?", actor=self.admin)
        self.assertEqual(self.fake.sent()[-1]["Body"], "Hello, how can I help?")
        self.assertEqual(self.replies(), sent_before + 1)
        self.say("I need funding")
        self.say("menu")  # not a restart while an officer has the chat
        with patch("apps.platform_config.http.download", return_value=DownloadResult(ok=True, content=PNG, content_type="image/png", status=200)):
            self.say("", NumMedia="1", MediaUrl0="https://api.twilio.com/media/ME2", MediaContentType0="image/png")
        self.assertEqual(self.replies(), sent_before + 1)  # no bot replies
        person = list(conversation.messages.filter(author_role="person").order_by("created_at"))
        self.assertEqual([m.body for m in person], ["I need funding", "menu", ""])
        self.assertEqual(person[2].attachments.count(), 1)
        self.assertFalse(JourneySession.objects.filter(phone=PHONE, status="active").exists())
        inbox.close(conversation, reason="Answered", actor=self.admin)
        self.say("thanks")
        self.assertIn("1. Submit an idea", self.last_text())

    def test_officer_will_reply_goes_once_after_the_wait(self):
        conversation = self.talk()
        before = self.replies()
        self.say("anyone there?")
        self.assertEqual(self.replies(), before)
        Conversation.objects.filter(pk=conversation.pk).update(created_at=timezone.now() - timedelta(minutes=6))
        self.say("hello?")
        self.assertEqual(self.last_text(), "An officer will reply soon.")
        self.say("still there?")
        self.assertEqual(self.replies(), before + 1)
