"""Prompt 54: a way back from "Talk to a person", on WhatsApp, the simulator, the website chat and USSD."""

from apps.audit.models import AuditLog
from apps.channels import upgrade
from apps.channels.models import ChannelConnection, Journey, JourneySession
from apps.conversations import services as inbox
from apps.conversations.models import Conversation, ConversationMessage
from rest_framework.test import APIClient
from tests.api.test_channels_api import BASE, data
from tests.api.test_channels_full_flow_api import PHONE, FlowTestCase


class WhatsAppWayOutTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        upgrade.upgrade(self.whatsapp_journey)
        self.journey = Journey.objects.get(pk=self.whatsapp_journey.pk)
        self.use_journey(self.journey)

    def talk(self):
        self.say("Hi")
        self.say("Talk to us")
        return Conversation.objects.get(channel="whatsapp", contact_phone=PHONE)

    def notes(self, conversation):
        return list(conversation.messages.filter(is_internal=True).values_list("body", flat=True))

    def test_handover_done_says_how_to_go_back(self):
        self.talk()
        self.assertIn("Send *menu* to go back.", self.last_text())

    def test_menu_leaves_the_handover_and_starts_the_main_menu(self):
        conversation = self.talk()
        self.say("Menu!")
        self.assertIn("1. Submit an idea", self.last_text())
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, "closed")
        self.assertTrue(conversation.closed_reason.startswith("Left by the person"))
        self.assertIn("The person went back to the menu.", self.notes(conversation))
        self.assertFalse(conversation.messages.filter(author_role="person", body__iexact="menu!").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="conversation_left_by_person").exists())
        self.assertTrue(JourneySession.objects.filter(phone=PHONE, status="active").exists())

    def test_cancel_ends_with_the_goodbye(self):
        conversation = self.talk()
        self.say("emisa")
        self.assertEqual(self.last_text(), "Okay, we've stopped. Send *menu* any time to start again.")
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, "closed")
        self.assertIn("The person stopped the chat.", self.notes(conversation))

    def test_hi_asks_keep_waiting_or_menu(self):
        conversation = self.talk()
        self.say("hi")
        self.assertIn("You're waiting for an officer. Keep waiting, or go back to the menu?", self.last_text())
        self.assertIn("Reply 1 to keep waiting, 0 for the main menu.", self.last_text())
        self.say("1")
        self.assertEqual(self.last_text(), "Okay. An officer will reply here.")
        conversation.refresh_from_db()
        self.assertNotEqual(conversation.status, "closed")
        self.say("dumela")
        self.say("0")
        self.assertIn("1. Submit an idea", self.last_text())
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, "closed")

    def test_hi_with_buttons(self):
        self.use_journey(self.journey, interactive_mode="buttons")
        self.talk()
        self.say("hi")
        spec = [kw for url, kw in self.fake.calls if "content.twilio.com" in url][-1]["json_body"]["types"]["twilio/quick-reply"]
        self.assertEqual([a["title"] for a in spec["actions"]], ["Keep waiting", "Main menu"])
        self.say("Main menu", ButtonPayload="__menu", ButtonText="Main menu")
        self.assertEqual(Conversation.objects.get(contact_phone=PHONE).status, "closed")

    def test_a_normal_message_still_reaches_the_inbox(self):
        conversation = self.talk()
        before = len(self.fake.sent())
        self.say("I need help with funding")
        self.assertEqual(len(self.fake.sent()), before)
        self.assertTrue(conversation.messages.filter(author_role="person", body="I need help with funding").exists())

    def test_officer_reply_after_the_person_left_does_not_restart_the_handover(self):
        conversation = self.talk()
        inbox.reply(conversation, "Hello, how can I help?", actor=self.admin)
        self.say("menu")
        conversation.refresh_from_db()
        self.assertEqual(conversation.status, "closed")
        self.assertTrue(conversation.messages.filter(author_role="staff").exists())  # nothing deleted
        with self.assertRaises(Exception):
            inbox.reply(conversation, "Are you still there?", actor=self.admin)
        self.say("1")  # the journey's menu answer, not the officer
        self.assertNotEqual(Conversation.objects.get(pk=conversation.pk).status, "waiting")
        self.assertFalse(conversation.messages.filter(author_role="person", body="1").exists())

    def test_officer_soon_adds_the_way_back(self):
        from datetime import timedelta

        from django.utils import timezone

        conversation = self.talk()
        Conversation.objects.filter(pk=conversation.pk).update(created_at=timezone.now() - timedelta(minutes=6))
        self.say("hello? anyone")
        self.assertEqual(self.last_text(), "An officer will reply soon.\nSend *menu* to go back.")

    def test_simulator_follows_the_handover(self):
        transcript = []

        def run(text=None, session=None):
            body = {"journey": str(self.journey.id), "channel": "whatsapp"}
            if session:
                body.update({"session_id": session, "input": text or ""})
            result = data(self.client.post(f"{BASE}/simulate/", body, format="json"))
            transcript.append((text or "(start)", result["screen"]["text"]))
            return result

        first = run()
        result = run("4", first["session_id"])
        self.assertIn("Send *menu* to go back.", result["screen"]["text"])
        result = run("hi", first["session_id"])
        self.assertIn("Keep waiting, or go back to the menu?", result["screen"]["text"])
        result = run("menu", first["session_id"])
        self.assertIn("CEDA Innovation", result["screen"]["text"])
        self.assertEqual([c["title"] for c in result["screen"]["choices"]][:1], ["Submit an idea"])
        print("\nSIMULATOR TRANSCRIPT")
        for said, answer in transcript:
            print(f"> {said}\n{answer}\n")


class UssdHandoverTests(FlowTestCase):
    def test_callback_screen_ends_and_a_new_dial_starts_at_the_menu(self):
        from apps.platform_config.testing import set_features

        set_features(self, ussd=True)
        connection = self.add_ussd()
        self.check_and_activate(connection["id"])
        token = ChannelConnection.objects.get(id=connection["id"]).webhook_token
        self.ussd(token, session="d1", text="")
        self.ussd(token, session="d1", text="4")
        answer = self.ussd(token, session="d1", text="4*Please call me").content.decode()
        self.assertTrue(answer.startswith("END"), answer)
        again = self.ussd(token, session="d2", text="").content.decode()
        self.assertTrue(again.startswith("CON"))
        self.assertIn("1. Submit an idea", again)


class WebChatEndTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        from apps.conversations.models import LiveChatSettings
        from tests.api.test_c1_conversations_api import switch

        switch(True)
        config = LiveChatSettings.load()
        config.allow_guests = True
        config.save()
        self.guest = APIClient()
        started = data(self.guest.post("/api/help-chat/", {"message": "Hello", "name": "Neo", "email": "neo@example.com"}, format="json"))
        self.conversation_id = started["conversation"]["id"]
        self.token = started["token"]

    def test_the_owner_ends_the_chat(self):
        response = self.guest.post(f"/api/help-chat/{self.conversation_id}/end/", {}, format="json", HTTP_X_CHAT_TOKEN=self.token)
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(data(response)["status"], "closed")
        conversation = Conversation.objects.get(pk=self.conversation_id)
        self.assertTrue(conversation.closed_reason.startswith("Left by the person"))
        self.assertTrue(conversation.messages.filter(is_internal=True, body="The person ended the chat.").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="conversation_left_by_person", target_id=str(conversation.pk)).exists())

    def test_anyone_else_is_refused_and_recorded(self):
        for client, headers in ((APIClient(), {}), (APIClient(), {"HTTP_X_CHAT_TOKEN": "not-the-token"})):
            response = client.post(f"/api/help-chat/{self.conversation_id}/end/", {}, format="json", **headers)
            self.assertEqual(response.status_code, 403)
        other = APIClient()
        other.force_authenticate(self.officer)
        self.assertEqual(other.post(f"/api/help-chat/{self.conversation_id}/end/", {}, format="json").status_code, 403)
        self.assertNotEqual(Conversation.objects.get(pk=self.conversation_id).status, "closed")
        self.assertEqual(AuditLog.objects.filter(action_type="help_chat_end_refused").count(), 3)
