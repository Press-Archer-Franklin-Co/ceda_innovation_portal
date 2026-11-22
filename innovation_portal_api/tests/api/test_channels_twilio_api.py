"""C2 prompt 10: WhatsApp through Twilio, end to end. No real network: every Twilio call is faked."""

import json
from unittest.mock import patch
from urllib.parse import urlencode

from django.http import QueryDict
from django.test import override_settings

from apps.channels.engine import JourneyRunner
from apps.channels.models import ChannelConnection, Journey, JourneySession, JourneySessionStep
from apps.channels.nodes import check_graph
from apps.documents.models import SubmissionDocument
from apps.platform_config.http import DownloadResult, HttpResult
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.providers.whatsapp import WhatsAppTwilioProvider, twilio_signature
from apps.platform_config.testing import set_features
from apps.submissions.models import ApplicationDraft, Submission
from tests.api.test_channels_api import BASE, ChannelsTestCase, data

TOKEN = "fake-twilio-token-1111"
SID = "AC00000000000000000000000000000000"
PDF = b"%PDF-1.4\n%fake pdf for tests\n"


class FakeTwilio:
    """Stands in for apps.platform_config.http.request: records calls, answers like Twilio."""

    def __init__(self, content_ok=True):
        self.calls = []
        self.content_ok = content_ok
        self.counter = 0

    def __call__(self, url, **kwargs):
        self.calls.append((url, kwargs))
        if url.startswith("https://content.twilio.com/"):
            return HttpResult(201, {"sid": "HX" + "1" * 32}) if self.content_ok else HttpResult(400, {"code": 20001, "message": "Invalid content"})
        if url.endswith("/Messages.json"):
            self.counter += 1
            return HttpResult(201, {"sid": f"SM{self.counter:032d}", "status": "queued"})
        if "/IncomingPhoneNumbers.json" in url:
            return HttpResult(200, {"incoming_phone_numbers": [{"phone_number": "+26775000000"}]})
        if url.endswith(".json"):
            return HttpResult(200, {"status": "active"})
        return HttpResult(404, text="not found")

    def sent(self):
        return [kwargs.get("form", {}) for url, kwargs in self.calls if url.endswith("/Messages.json")]


class TwilioTestCase(ChannelsTestCase):
    def setUp(self):
        super().setUp()
        set_features(self, whatsapp_messages=True)
        self.fake = FakeTwilio()
        patcher = patch("apps.platform_config.http.request", self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.connection = self.add_twilio("Twilio Sandbox")
        self.token = ChannelConnection.objects.get(id=self.connection["id"]).webhook_token
        self.path = f"{BASE}/whatsapp/{self.token}/"

    def add_twilio(self, name, number="+14155238886", activate=True, journey=None, **config):
        response = self.client.post(
            f"{BASE}/connections/",
            {
                "kind": "whatsapp", "provider": "whatsapp_twilio", "name": name, "address": number,
                "journey": str((journey or self.whatsapp_journey).id),
                "config": {"account_sid": SID, "from_number": number, **config}, "secrets": {"auth_token": TOKEN},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        connection = data(response)
        if activate:
            self.check_and_activate(connection["id"])
        return connection

    def twilio_post(self, params, *, token=TOKEN, path=None, url=None, signature=None, extra=None):
        path = path or self.path
        body = urlencode(params, doseq=True)
        signed_url = url or f"http://testserver{path}"
        qd = QueryDict(body)
        sig = signature if signature is not None else twilio_signature(signed_url, qd, token)
        headers = {"HTTP_X_TWILIO_SIGNATURE": sig} if sig else {}
        from rest_framework.test import APIClient

        return APIClient().post(path, data=body, content_type="application/x-www-form-urlencoded", **headers, **(extra or {}))

    def say(self, text="", sid=None, phone="+26771234567", **more):
        self.sid_counter = getattr(self, "sid_counter", 0) + 1
        params = {"From": f"whatsapp:{phone}", "To": "whatsapp:+14155238886", "Body": text, "MessageSid": sid or f"SM{self.sid_counter:032d}", "WaId": phone.lstrip("+"), "ProfileName": "Neo", "NumMedia": "0", **more}
        response = self.twilio_post(params)
        self.assertEqual(response.status_code, 200, response.content)
        return response

    def last_text(self):
        form = self.fake.sent()[-1]
        return form.get("Body", "")


class SignatureTests(TwilioTestCase):
    def test_valid_signature_on_the_request_url(self):
        response = self.say("hi")
        self.assertEqual(response["Content-Type"], "text/xml")
        self.assertEqual(response.content.decode(), "<Response></Response>")
        self.assertIn("1. Submit an idea", self.last_text())

    @override_settings(PUBLIC_BASE_URL="https://paf-demo.org")
    def test_valid_signature_on_the_configured_url_when_the_request_url_differs(self):
        params = {"From": "whatsapp:+26771234567", "Body": "hi", "MessageSid": "SMcfg", "NumMedia": "0"}
        response = self.twilio_post(params, url=f"https://paf-demo.org{self.path}")
        self.assertEqual(response.status_code, 200, response.content)

    def test_wrong_token_missing_header_and_changed_param_are_refused_and_logged(self):
        params = {"From": "whatsapp:+26771234567", "Body": "hi", "MessageSid": "SMbad", "NumMedia": "0"}
        with self.assertLogs("security.webhook", level="WARNING") as logs:
            self.assertEqual(self.twilio_post(params, token="not-the-token").status_code, 403)
        self.assertIn("twilio_signature_mismatch", logs.output[0])
        self.assertNotIn(TOKEN, logs.output[0])
        with self.assertLogs("security.webhook", level="WARNING"):
            self.assertEqual(self.twilio_post(params, signature="").status_code, 403)
        good = twilio_signature(f"http://testserver{self.path}", QueryDict(urlencode(params)), TOKEN)
        changed = {**params, "Body": "something else"}
        with self.assertLogs("security.webhook", level="WARNING"):
            self.assertEqual(self.twilio_post(changed, signature=good).status_code, 403)
        self.assertEqual(self.fake.sent(), [])

    def test_repeated_keys_are_signed_like_twilio(self):
        qd = QueryDict("b=2&a=1&a=1&a=0")
        import base64
        import hashlib
        import hmac

        expected = base64.b64encode(hmac.new(b"k", b"https://x/a0a1b2", hashlib.sha1).digest()).decode()
        self.assertEqual(twilio_signature("https://x/", qd, "k"), expected)


class SenderAndRestartTests(TwilioTestCase):
    def test_sender_is_normalised_and_the_profile_name_kept(self):
        self.say("hi", phone="+26771234567")
        session = JourneySession.objects.get(channel="whatsapp")
        self.assertEqual(session.phone, "+26771234567")
        self.assertEqual(session.state["vars"]["profile_name"], "Neo")

    def test_messages_from_our_own_number_are_ignored(self):
        self.say("echo", phone="+14155238886")
        self.assertFalse(JourneySession.objects.exists())

    def test_a_duplicate_message_sid_is_handled_once(self):
        self.say("hi", sid="SMdup")
        self.say("hi", sid="SMdup")
        self.assertEqual(len(self.fake.sent()), 1)

    def test_restart_words_start_again(self):
        self.say("hi")
        self.say("1")
        self.assertIn("What is your idea called", self.last_text())
        self.say("MENU")
        self.assertIn("1. Submit an idea", self.last_text())
        self.assertEqual(JourneySession.objects.filter(status="abandoned").count(), 1)

    def test_choice_by_button_id_number_or_title(self):
        for how in ({"ButtonPayload": "4", "Body": "Talk to us"}, {"Body": "4"}, {"Body": "talk to us"}):
            JourneySession.objects.all().delete()
            with patch("apps.channels.handoff.open_handoff") as handoff:
                self.say("hi")
                self.say(**{"text": how.get("Body", "")}, **{k: v for k, v in how.items() if k != "Body"})
            self.assertTrue(handoff.called, how)


class InteractiveTests(TwilioTestCase):
    def test_buttons_mode_sends_a_list_picker_through_the_content_api(self):
        self.client.patch(f"{BASE}/connections/{self.connection['id']}/", {"config": {"interactive_mode": "buttons"}}, format="json")
        self.check_and_activate(self.connection["id"])
        self.say("hi")
        content = [kwargs["json_body"] for url, kwargs in self.fake.calls if url.startswith("https://content.twilio.com/")]
        self.assertIn("twilio/list-picker", content[0]["types"])
        items = content[0]["types"]["twilio/list-picker"]["items"]
        self.assertTrue(all(len(i["item"]) <= 24 for i in items))
        self.assertEqual(self.fake.sent()[-1]["ContentSid"], "HX" + "1" * 32)

    def test_content_api_failure_falls_back_to_numbered_text(self):
        self.fake.content_ok = False
        self.client.patch(f"{BASE}/connections/{self.connection['id']}/", {"config": {"interactive_mode": "buttons"}}, format="json")
        self.check_and_activate(self.connection["id"])
        self.say("hi")
        self.assertIn("1. Submit an idea", self.last_text())


def file_journey(owner_client, save=True):
    nodes = [
        {"key": "a", "type": "question", "text": {"en": "Title?", "tn": "Setlhogo?"}, "settings": {"variable": "title"}, "next": "s" if save else "f"},
        {"key": "s", "type": "save_draft", "text": {"en": "Saved", "tn": "E bolokilwe"}, "settings": {"title_variable": "title", "create_account": True}, "next": "f"},
        {"key": "f", "type": "file", "text": {"en": "Send a file", "tn": "Romela faele"}, "settings": {
            "field_key": "attachments", "allowed_types": ["pdf", "jpg", "jpeg", "png"], "max_files": 2, "max_mb": 1,
            "skip_words": {"en": "skip", "tn": "tlola"}, "done_words": {"en": "done", "tn": "fedile"},
            "received_text": {"en": "Got it", "tn": "Re e amogetse"}, "wrong_type_text": {"en": "Wrong type", "tn": "Mofuta o phoso"},
            "too_big_text": {"en": "Too big", "tn": "E kgolo"}, "needed_text": {"en": "Send a file or SKIP", "tn": "Romela"},
        }, "next": "e"},
        {"key": "e", "type": "end", "text": {"en": "Bye", "tn": "Sala"}},
    ]
    response = owner_client.post(f"{BASE}/journeys/", {"name": "Files", "channel": "whatsapp", "nodes": nodes, "start_key": "a"}, format="json")
    journey = Journey.objects.get(id=data(response)["id"])
    return journey


class FileStepTests(TwilioTestCase):
    def setUp(self):
        super().setUp()
        self.journey = file_journey(self.client)
        self.assertEqual(self.client.post(f"{BASE}/journeys/{self.journey.id}/publish/").status_code, 200)
        self.client.patch(f"{BASE}/connections/{self.connection['id']}/", {"journey": str(self.journey.id)}, format="json")
        self.say("hi")
        self.say("Solar fridge")
        self.assertIn("Send a file", self.last_text())

    def media(self, content_type="application/pdf"):
        return {"NumMedia": "1", "MediaUrl0": f"https://api.twilio.com/2010-04-01/Accounts/{SID}/Messages/MM1/Media/ME1", "MediaContentType0": content_type}

    def test_an_accepted_file_is_saved_on_the_draft(self):
        with patch("apps.platform_config.http.download", return_value=DownloadResult(True, content=PDF, content_type="application/pdf")) as download:
            self.say("", **self.media())
        self.assertIn("Got it", self.last_text())
        self.assertEqual(download.call_args.kwargs["headers"]["Authorization"][:6], "Basic ")
        draft = ApplicationDraft.objects.get(title="Solar fridge")
        document = SubmissionDocument.objects.get(application_draft=draft)
        self.assertEqual((document.field_key, document.mime_type), ("attachments", "application/pdf"))
        self.assertEqual(len(document.sha256), 64)
        step = JourneySessionStep.objects.filter(node_type="file").last()
        self.assertEqual(step.attachment_count, 1)
        self.assertTrue(step.provider_message_id)

    def test_wrong_type_too_big_and_skip(self):
        self.say("", **self.media("image/heic"))
        self.assertIn("Wrong type", self.last_text())
        with patch("apps.platform_config.http.download", return_value=DownloadResult(False, too_big=True, error="big")):
            self.say("", **self.media())
        self.assertIn("Too big", self.last_text())
        self.assertFalse(SubmissionDocument.objects.exists())
        self.say("SKIP")
        self.assertIn("Bye", self.last_text())

    def test_a_file_at_another_step_is_ignored_with_a_reply(self):
        JourneySession.objects.all().delete()
        self.say("hi")
        with patch("apps.platform_config.http.download") as download:
            self.say("My title", **self.media())
        download.assert_not_called()
        self.assertIn("We can only take files when we ask for one", self.last_text())
        self.assertIn("Saved", self.last_text())

    def test_a_file_step_needs_a_save_step_first(self):
        graph = {"start": "a", "nodes": {n["key"]: {**n, "settings": n.get("settings", {}), "next": n.get("next", "")} for n in [
            {"key": "a", "type": "file", "text": {"en": "Send", "tn": "Romela"}, "next": "e"},
            {"key": "e", "type": "end", "text": {"en": "Bye", "tn": "Sala"}},
        ]}}
        codes = {(p["node"], p["code"]) for p in check_graph(graph, "whatsapp")}
        self.assertIn(("a", "needs_save_first"), codes)

    def test_the_simulator_takes_a_pretend_file(self):
        first = data(self.client.post(f"{BASE}/simulate/", {"journey": str(self.journey.id), "channel": "whatsapp"}, format="json"))
        self.client.post(f"{BASE}/simulate/", {"journey": str(self.journey.id), "channel": "whatsapp", "session_id": first["session_id"], "input": "Test idea"}, format="json")
        answer = data(self.client.post(f"{BASE}/simulate/", {"journey": str(self.journey.id), "channel": "whatsapp", "session_id": first["session_id"], "attachment": {"name": "idea.pdf", "content_type": "application/pdf", "size": 2000}}, format="json"))
        self.assertIn("Got it", answer["screen"]["text"])
        self.assertFalse(SubmissionDocument.objects.filter(application_draft__title="Test idea").exists())


def submit_runner(user=None, require_consent=True, create_account=True):
    nodes = [
        {"key": "a", "type": "question", "text": {"en": "Title?"}, "settings": {"variable": "title"}, "next": "s"},
        {"key": "s", "type": "save_draft", "text": {"en": "Saved"}, "settings": {"title_variable": "title", "create_account": create_account}, "next": "x"},
        {"key": "x", "type": "submit", "settings": {
            "require_consent": require_consent, "consent_text": {"en": "Reply YES"}, "success_text": {"en": "Sent as {reference}"},
            "declined_text": {"en": "Not sent"}, "closed_text": {"en": "Closed now"}, "error_text": {"en": "Could not send"},
        }},
    ]
    graph = {"start": "a", "default_language": "en", "nodes": {n["key"]: {"next": "", "settings": {}, "text": {}, **n} for n in nodes}}
    return JourneyRunner(graph, {"vars": {"name": "Kago Molefe"}}, channel="whatsapp", phone="+26771234599", user=user, session_id="t")


class SubmitStepTests(TwilioTestCase):
    def test_guest_idea_is_sent_after_consent(self):
        r = submit_runner(create_account=False)
        r.start()
        self.assertIn("Reply YES", r.answer("Water pump").text)
        screen = r.answer("YES")
        submission = Submission.objects.get(title="Water pump")
        self.assertTrue(submission.is_guest)
        self.assertEqual(submission.guest_phone, "+26771234599")
        self.assertIn(f"Sent as {submission.reference_number}", screen.text)
        self.assertEqual(r.state["vars"]["reference"], submission.reference_number)
        from apps.audit.models import AuditLog

        entry = AuditLog.objects.get(action_type="channel_submission_created")
        self.assertNotIn("+26771234599", json.dumps(entry.metadata))

    def test_signed_in_person_without_consent_question(self):
        r = submit_runner(user=self.admin, require_consent=False)
        r.start()
        screen = r.answer("Solar dryer")
        submission = Submission.objects.get(title="Solar dryer")
        self.assertEqual(submission.innovator, self.admin)
        self.assertIn("Sent as", screen.text)

    def test_no_to_consent_keeps_the_draft(self):
        r = submit_runner()
        r.start()
        r.answer("Kept idea")
        self.assertIn("Not sent", r.answer("no").text)
        self.assertFalse(Submission.objects.filter(title="Kept idea").exists())
        self.assertTrue(ApplicationDraft.objects.filter(title="Kept idea", status="draft").exists())

    def test_a_closed_challenge_takes_the_error_path(self):
        r = submit_runner(require_consent=False)
        r.start()
        with patch("apps.programs.models.Program.is_submission_open", return_value=False):
            screen = r.answer("Late idea")
        self.assertIn("Closed now", screen.text)
        self.assertFalse(Submission.objects.filter(title="Late idea").exists())


class SeededJourneyTests(TwilioTestCase):
    def test_example_journey_end_to_end_with_a_file_and_the_idea_number(self):
        self.assertEqual(self.whatsapp_journey.version, 2)
        self.say("hi")
        for answer in ["1", "Solar fridge", "Food spoils", "A solar cool box", "Neo Mosweu"]:
            self.say(answer)
        self.assertIn("Send a photo or document", self.last_text())
        with patch("apps.platform_config.http.download", return_value=DownloadResult(True, content=PDF, content_type="application/pdf")):
            self.say("", NumMedia="1", MediaUrl0="https://api.twilio.com/x/Media/ME1", MediaContentType0="application/pdf")
        self.say("done")
        self.assertIn("Reply YES", self.last_text())
        self.say("yes")
        submission = Submission.objects.get(title="Solar fridge")
        self.assertEqual(submission.channel, "whatsapp")
        self.assertIn(submission.reference_number, self.last_text())
        session = JourneySession.objects.get(channel="whatsapp", status="completed")
        detail = data(self.client.get(f"{BASE}/sessions/{session.id}/"))
        self.assertTrue(any(s["attachment_count"] == 1 and s["provider_message_id"] for s in detail["steps"]))

    def test_the_seeded_journey_has_no_errors(self):
        problems = check_graph(self.whatsapp_journey.latest_version.graph, "whatsapp")
        self.assertEqual([p for p in problems if p["level"] == "error"], [])


class KeysAndConnectionsTests(TwilioTestCase):
    def test_new_keys_take_effect_at_once_and_keep_the_address(self):
        new_token = "fake-production-token-2222"
        response = self.client.patch(f"{BASE}/connections/{self.connection['id']}/", {"secrets": {"auth_token": new_token}}, format="json")
        self.assertNotIn(new_token, response.content.decode())
        self.check_and_activate(self.connection["id"])
        self.assertEqual(data(self.client.get(f"{BASE}/connections/{self.connection['id']}/"))["webhook_url"], self.connection["webhook_url"])
        params = {"From": "whatsapp:+26771234567", "Body": "hi", "MessageSid": "SMold", "NumMedia": "0"}
        with self.assertLogs("security.webhook", level="WARNING"):
            self.assertEqual(self.twilio_post(params, token=TOKEN).status_code, 403)
        self.assertEqual(self.twilio_post({**params, "MessageSid": "SMnew"}, token=new_token).status_code, 200)
        self.assertNotIn(new_token, self.client.get(f"{BASE}/connections/").content.decode())

    def test_only_the_active_connection_answers(self):
        production = self.add_twilio("Twilio production", number="+26775000000", activate=False)
        token = ChannelConnection.objects.get(id=production["id"]).webhook_token
        params = {"From": "whatsapp:+26771234567", "Body": "hi", "MessageSid": "SMprod", "NumMedia": "0"}
        self.twilio_post(params, path=f"{BASE}/whatsapp/{token}/")
        self.assertIn("not available yet", self.last_text())
        self.assertFalse(JourneySession.objects.exists())

    def test_staff_replies_go_out_on_the_connection_the_person_used(self):
        from apps.channels.services import WhatsAppOutbound

        production = self.add_twilio("Twilio production", number="+26775000000")
        token = ChannelConnection.objects.get(id=production["id"]).webhook_token
        self.twilio_post({"From": "whatsapp:+26771234567", "Body": "hi", "MessageSid": "SMp1", "NumMedia": "0"}, path=f"{BASE}/whatsapp/{token}/")
        result = WhatsAppOutbound.send(to="+26771234567", body="Hello from staff")
        self.assertEqual(result.status, "sent")
        self.assertEqual(self.fake.sent()[-1]["From"], "whatsapp:+26775000000")

    def test_the_test_button_names_the_sandbox_number(self):
        result = data(self.client.post(f"{BASE}/connections/{self.connection['id']}/test/", {}, format="json"))["result"]
        sender = next(s for s in result["steps"] if s["step"] == "Sender number")
        self.assertTrue(sender["ok"])
        self.assertIn("Sandbox number", sender["detail"])
        self.assertTrue(IntegrationConnection.objects.get(id=self.connection["integration_id"]).is_active)

    def test_provider_lists_the_new_settings(self):
        fields = {f["name"] for f in WhatsAppTwilioProvider.as_dict()["fields"]}
        self.assertTrue({"interactive_mode", "restart_words", "replies"} <= fields)
