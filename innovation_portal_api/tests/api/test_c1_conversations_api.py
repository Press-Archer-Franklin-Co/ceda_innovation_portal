"""C1: live idea messages, the staff Inbox, hand-overs, live chat settings and the website help chat."""

from datetime import timedelta
from unittest.mock import patch

from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.communications.messaging import MessagingService
from apps.communications.senders import DeliveryResult
from apps.conversations import live
from apps.conversations.models import Conversation, ConversationMessage, LiveChatSettings
from apps.conversations.services import escalate_unanswered, open_handoff
from apps.core.constants import RoleType, SubmissionStatus, SubmissionType
from apps.platform_config.flags import clear_flag_cache
from apps.platform_config.models import FeatureFlag
from apps.submissions.models import Submission
from apps.support.models import EscalationRecord
from tests.api.test_challenges_b5_api import B5TestCase, data

ALWAYS_OPEN = {day: [{"opens": "00:00", "closes": "23:59"}] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
NEVER_OPEN = {day: [] for day in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}
DELIVER = "apps.communications.senders.MessageSenderRegistry.deliver"


def switch(on: bool):
    FeatureFlag.objects.filter(key="live_chat").update(enabled=on)
    clear_flag_cache()


class C1Base(B5TestCase):
    def setUp(self):
        super().setUp()
        switch(True)
        config = LiveChatSettings.load()
        config.hours, config.roles, config.escalate_after_minutes = ALWAYS_OPEN, [RoleType.INNOVATION_OFFICER], 15
        config.save()
        self.other = User.objects.create_user(email="c1-officer2@example.com", password="StrongPass123", first_name="Mpho", last_name="D")
        RoleService.assign_roles(self.other, [RoleType.INNOVATION_OFFICER])
        self.manager = User.objects.create_user(email="c1-manager@example.com", password="StrongPass123", first_name="Lesedi", last_name="M")
        RoleService.assign_roles(self.manager, [RoleType.INNOVATION_MANAGER])
        self.program = self.challenge("Cold chain")
        self.idea = Submission.objects.create(
            reference_number="C1-0001", program=self.program, innovator=self.innovator, submission_type=SubmissionType.IDEA,
            title="Solar-dried mopane snacks", submitted_at=timezone.now(), current_status=SubmissionStatus.UNDER_REVIEW,
        )  # fmt: skip

    def as_user(self, user):
        self.client.force_authenticate(user)
        return self.client

    def handoff(self, channel="whatsapp", **contact):
        return open_handoff(
            channel=channel,
            contact=contact or {"phone": "+26771234567", "name": "Neo Molefe"},
            subject="Can I add my supplier quote?",
            transcript=[{"from": "person", "text": "Can I add my supplier quote after I submit?", "at": timezone.now().isoformat()}, {"from": "bot", "text": "Let me find an officer.", "at": timezone.now().isoformat()}],
            reason="Asked for a person",
        )


class IdeaMessagesTests(C1Base):
    def test_after_typing_seen_and_mark_read(self):
        first = MessagingService.applicant_message(self.idea, author=self.innovator, body="Can I add my supplier quote?")
        staff = self.as_user(self.officer).get(f"/api/submissions/{self.idea.id}/messages/")
        rows = data(staff)
        self.assertEqual(len(rows["results"]), 1)
        self.assertTrue(rows["typing_supported"])
        self.assertIsNone(rows["typing"])

        reply = MessagingService.officer_message(self.idea, author=self.officer, body="Yes. Open your idea and add it under Files.")
        mine = data(self.as_user(self.innovator).get(f"/api/me/ideas/{self.idea.id}/messages/"))
        own = next(row for row in mine["results"] if row["id"] == str(first.id))
        self.assertEqual(own["seen_by"]["name"], "Kago T.")  # R-52: seen by the officer who opened it
        self.assertTrue(mine["staff_online"])
        reply.refresh_from_db()
        self.assertIsNotNone(reply.read_by_applicant_at)  # read when fetched

        newer = data(self.client.get(f"/api/me/ideas/{self.idea.id}/messages/", {"after": str(first.id)}))
        self.assertEqual([row["id"] for row in newer["results"]], [str(reply.id)])
        self.assertEqual(data(self.client.get(f"/api/me/ideas/{self.idea.id}/messages/", {"after": str(reply.id)}))["results"], [])
        self.assertEqual(self.client.get(f"/api/me/ideas/{self.idea.id}/messages/", {"after": "yesterday"}).status_code, 400)

        self.assertEqual(self.client.post(f"/api/me/ideas/{self.idea.id}/messages/typing/").status_code, 200)
        self.assertEqual(data(self.as_user(self.officer).get(f"/api/submissions/{self.idea.id}/messages/"))["typing"], {"name": "Neo"})
        self.as_user(self.officer).post(f"/api/submissions/{self.idea.id}/messages/typing/")
        self.assertEqual(data(self.as_user(self.innovator).get(f"/api/me/ideas/{self.idea.id}/messages/"))["typing"], {"name": "Kago T."})

    def test_typing_hint_expires(self):
        live.set_typing("idea", self.idea.id, "person", "Neo")
        self.assertEqual(live.typing("idea", self.idea.id, "person"), {"name": "Neo"})
        self.assertIsNone(live.typing("idea", self.idea.id, "person", now=timezone.now() + timedelta(seconds=11)))


class InboxTests(C1Base):
    def test_scope_tabs_and_idea_rows(self):
        mine = self.handoff(phone="+26771000001", name="Mine")
        theirs = self.handoff(phone="+26771000002", name="Theirs")
        waiting = self.handoff(phone="+26771000003", name="Waiting")
        Conversation.objects.filter(pk=mine.pk).update(assignee=self.officer, status="assigned")
        Conversation.objects.filter(pk=theirs.pk).update(assignee=self.other, status="assigned")
        MessagingService.applicant_message(self.idea, author=self.innovator, body="Where is my reference number?")

        def ids(user, **params):
            return {row["id"] for row in data(self.as_user(user).get("/api/inbox/", params))["results"]}

        self.assertEqual(ids(self.officer), {str(mine.id), str(waiting.id), str(self.idea.id)})
        self.assertNotIn(str(theirs.id), ids(self.officer))
        self.assertEqual(ids(self.manager), {str(mine.id), str(theirs.id), str(waiting.id), str(self.idea.id)})
        self.assertEqual(ids(self.officer, tab="mine"), {str(mine.id)})
        self.assertEqual(ids(self.officer, tab="unassigned"), {str(waiting.id), str(self.idea.id)})
        self.assertEqual(ids(self.officer, channel="idea"), {str(self.idea.id)})
        row = next(row for row in data(self.as_user(self.officer).get("/api/inbox/"))["results"] if row["type"] == "idea")
        self.assertEqual((row["who"]["name"], row["unread"], row["submission"]["reference"]), ("Neo Kebadile", 1, "C1-0001"))
        self.assertEqual(data(self.client.get("/api/inbox/unread/"))["unassigned"], 1)

        # Once the officer answers, the idea leaves the Inbox.
        MessagingService.officer_message(self.idea, author=self.officer, body="It is CEDA-IP-2026-00009.")
        self.assertNotIn(str(self.idea.id), ids(self.officer))
        self.assertEqual(self.as_user(self.innovator).get("/api/inbox/").status_code, 403)
        self.assertEqual(self.client.get(f"/api/inbox/conversations/{theirs.id}/").status_code, 403)
        self.assertEqual(self.as_user(self.officer).get(f"/api/inbox/conversations/{theirs.id}/").status_code, 404)

    def test_handoffs_take_reply_close_and_convert(self):
        for channel in ("web", "whatsapp", "ussd", "ai"):
            conversation = self.handoff(channel, phone=f"+2677{channel[:2].encode().hex()}", name=f"From {channel}")
            self.assertEqual((conversation.status, conversation.channel), ("waiting", channel))
            self.assertEqual(conversation.messages.filter(author_role="person").count(), 1)
        whatsapp = Conversation.objects.get(channel="whatsapp")
        detail = data(self.as_user(self.officer).get(f"/api/inbox/conversations/{whatsapp.id}/"))
        self.assertEqual(detail["conversation"]["handed_over_by"], "whatsapp")
        self.assertEqual([row["author_role"] for row in detail["messages"]["results"] if not row["is_internal"]], ["person", "bot"])
        last_id = detail["messages"]["last_id"]

        url = f"/api/inbox/conversations/{whatsapp.id}"
        self.assertEqual(data(self.client.post(f"{url}/take/"))["assignee"]["id"], str(self.officer.id))
        with patch(DELIVER, return_value=DeliveryResult("sent", provider="test")) as deliver:
            sent = data(self.client.post(f"{url}/reply/", {"body": "Yes. Open your idea and go to Files."}, format="json"))
        deliver.assert_called_once()
        self.assertEqual(deliver.call_args.kwargs["to"], whatsapp.contact_phone)
        self.assertEqual(sent["delivery"], "Sent on WhatsApp.")
        self.client.post(f"{url}/note/", {"body": "Check Files on Friday."}, format="json")
        newer = data(self.client.get(f"{url}/", {"after": last_id}))["messages"]["results"]
        self.assertEqual([(row["author_role"], row["is_internal"]) for row in newer], [("staff", False), ("staff", True)])
        whatsapp.refresh_from_db()
        self.assertIsNotNone(whatsapp.first_response_at)

        self.assertEqual(self.client.post(f"{url}/assign/", {"user_id": str(self.innovator.id)}, format="json").status_code, 400)
        self.assertEqual(data(self.client.post(f"{url}/assign/", {"user_id": str(self.other.id)}, format="json"))["assignee"]["id"], str(self.other.id))
        made = self.as_user(self.manager).post(f"{url}/convert/", {"into": "task", "title": "Call Neo back"}, format="json")
        self.assertEqual(made.status_code, 201, made.content)
        self.assertIsNotNone(data(made)["task_id"])
        self.assertEqual(self.client.post(f"{url}/close/", {}, format="json").status_code, 400)
        self.assertEqual(data(self.client.post(f"{url}/close/", {"reason": "Answered"}, format="json"))["status"], "closed")
        self.assertEqual(self.client.post(f"{url}/reply/", {"body": "One more thing"}, format="json").status_code, 400)
        self.assertEqual(data(self.client.post(f"{url}/reopen/"))["status"], "assigned")

        ussd = Conversation.objects.get(channel="ussd")
        reply = data(self.client.post(f"/api/inbox/conversations/{ussd.id}/reply/", {"body": "We will call you."}, format="json"))
        self.assertIn("Call the person back", reply["delivery"])

    def test_same_person_continues_one_conversation(self):
        first = self.handoff()
        again = self.handoff()
        self.assertEqual(first.id, again.id)
        self.assertEqual(first.messages.filter(author_role="person").count(), 2)

    def test_take_turns_gives_it_to_the_least_busy_online_officer(self):
        config = LiveChatSettings.load()
        config.share_out = "take_turns"
        config.answerers = [{"kind": "person", "id": str(self.other.id), "max_open": 1, "backup": False}]
        config.save()
        live.mark_online(self.officer)
        live.mark_online(self.other)
        first = self.handoff(phone="+26771000011", name="A")
        second = self.handoff(phone="+26771000012", name="B")
        self.assertEqual({first.assignee_id, second.assignee_id}, {self.officer.id, self.other.id})

    def test_escalation_after_the_set_minutes(self):
        conversation = self.handoff()
        self.assertEqual(escalate_unanswered()["escalated"], 0)
        Conversation.objects.filter(pk=conversation.pk).update(created_at=timezone.now() - timedelta(minutes=16))
        with patch(DELIVER, return_value=DeliveryResult("skipped", reason="test")):
            result = escalate_unanswered()
        self.assertEqual(result["escalated"], 1)
        record = EscalationRecord.objects.get()
        self.assertEqual(record.task.assignee, self.manager)
        self.assertEqual(escalate_unanswered()["escalated"], 0)  # only once


class SettingsAndHelpChatTests(C1Base):
    def test_admin_changes_settings(self):
        admin = User.objects.create_user(email="c1-admin@example.com", password="StrongPass123", first_name="Lorato")
        RoleService.assign_roles(admin, [RoleType.ADMINISTRATOR])
        body = {
            "hours": {"mon": [{"opens": "08:00", "closes": "16:30"}], "sat": []},
            "away": {"en": "We are closed.", "tn": "Re tswetse."},
            "roles": [RoleType.INNOVATION_OFFICER, RoleType.INNOVATION_MANAGER],
            "answerers": [{"id": str(self.officer.id), "max_open": 5}],
            "share_out": "take_turns",
            "escalate_after_minutes": 10,
            "saved_replies": [{"title": "Reference", "body": {"en": "Thanks, your idea reference is...", "tn": ""}}],
        }
        self.assertEqual(self.as_user(self.officer).put("/api/live-chat/settings/", body, format="json").status_code, 403)
        response = self.as_user(admin).put("/api/live-chat/settings/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        saved = data(response)
        self.assertEqual(saved["hours"]["mon"], [{"opens": "08:00", "closes": "16:30"}])
        self.assertEqual(saved["hours"]["tue"], [])
        self.assertTrue(saved["saved_replies"][0]["id"])
        # Officers read the saved replies for the Inbox (English when Setswana is empty).
        replies = data(self.as_user(self.officer).get("/api/inbox/saved-replies/?lang=tn"))
        self.assertEqual([(r["title"], r["body"]) for r in replies], [("Reference", "Thanks, your idea reference is...")])
        self.as_user(admin)
        for bad in ({"hours": {"mon": [{"opens": "17:00", "closes": "08:00"}]}}, {"roles": ["nobody"]}, {"hours": {"funday": []}}):
            self.assertEqual(self.client.put("/api/live-chat/settings/", bad, format="json").status_code, 400, bad)
        self.assertFalse(data(self.client.put("/api/live-chat/settings/", {"enabled": False}, format="json"))["enabled"])

    def test_help_chat_for_innovators_and_guests(self):
        status = data(self.client.get("/api/help-chat/status/"))
        self.assertTrue(status["enabled"] and status["open_now"])
        started = self.as_user(self.innovator).post("/api/help-chat/", {"message": "How do I enter a challenge?"}, format="json")
        self.assertEqual(started.status_code, 201, started.content)
        chat = data(started)
        self.assertIsNone(chat["token"])
        conversation = Conversation.objects.get(id=chat["conversation"]["id"])
        self.assertEqual((conversation.channel, conversation.contact_user), ("web", self.innovator))

        with patch(DELIVER) as deliver:
            self.as_user(self.officer).post(f"/api/inbox/conversations/{conversation.id}/reply/", {"body": "Open the challenge and press Enter."}, format="json")
        deliver.assert_not_called()  # web chat replies stay in the chat
        mine = data(self.as_user(self.innovator).get(f"/api/help-chat/{conversation.id}/", {"after": chat["messages"]["last_id"]}))
        self.assertEqual([row["body"] for row in mine["messages"]["results"]], ["Open the challenge and press Enter."])
        self.assertNotIn("is_internal", mine["messages"]["results"][0])
        # The person has read it: staff polling with ?after= learn it from seen_at.
        staff_view = data(self.as_user(self.officer).get(f"/api/inbox/conversations/{conversation.id}/", {"after": mine["messages"]["last_id"]}))
        self.assertEqual(staff_view["messages"]["results"], [])
        self.assertIsNotNone(staff_view["messages"]["seen_at"])
        # A second device finds the open chat.
        self.assertEqual(data(self.as_user(self.innovator).get("/api/help-chat/mine/"))["conversation"]["id"], str(conversation.id))
        self.assertIsNone(data(self.as_user(self.other).get("/api/help-chat/mine/"))["conversation"])
        self.as_user(self.innovator)
        self.client.post(f"/api/help-chat/{conversation.id}/typing/")
        self.assertEqual(data(self.as_user(self.officer).get(f"/api/inbox/conversations/{conversation.id}/"))["messages"]["typing"], {"name": "Neo Kebadile"})
        self.as_user(self.innovator).post(f"/api/help-chat/{conversation.id}/messages/", {"body": "Thank you"}, format="json")
        self.assertIsNone(data(self.as_user(self.officer).get(f"/api/inbox/conversations/{conversation.id}/"))["messages"]["typing"])  # sending ends typing
        self.as_user(self.other).get("/api/inbox/")  # someone else's chat stays private
        self.assertEqual(self.as_user(self.other).get(f"/api/help-chat/{conversation.id}/").status_code, 404)

        # Guests only when allowed, with their token.
        self.client.force_authenticate(None)
        self.assertEqual(self.client.post("/api/help-chat/", {"message": "Hello"}, format="json").status_code, 400)
        config = LiveChatSettings.load()
        config.allow_guests, config.hours = True, NEVER_OPEN
        config.save()
        guest = data(self.client.post("/api/help-chat/", {"message": "Hello", "name": "Kabo", "email": "kabo@example.com"}, format="json"))
        self.assertTrue(guest["token"])
        bodies = [row["body"] for row in guest["messages"]["results"]]
        self.assertTrue(any(body.startswith("We are closed now") for body in bodies))  # away message outside hours
        self.assertEqual(self.client.get(f"/api/help-chat/{guest['conversation']['id']}/").status_code, 404)
        ok = self.client.get(f"/api/help-chat/{guest['conversation']['id']}/", HTTP_X_CHAT_TOKEN=guest["token"])
        self.assertEqual(ok.status_code, 200)

    def test_switch_off_hides_everything(self):
        conversation = self.handoff()
        switch(False)
        self.assertEqual(self.as_user(self.officer).get("/api/inbox/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/inbox/conversations/{conversation.id}/").status_code, 404)
        self.assertEqual(self.as_user(self.innovator).post("/api/help-chat/", {"message": "Hi"}, format="json").status_code, 404)
        self.assertFalse(data(self.client.get("/api/help-chat/status/"))["enabled"])
        site = self.client.get("/api/content/site-settings/").json()
        self.assertFalse(site.get("data", site)["live_chat_enabled"])
        self.assertEqual(ConversationMessage.objects.filter(conversation=conversation).exclude(is_internal=True).count(), 2)
