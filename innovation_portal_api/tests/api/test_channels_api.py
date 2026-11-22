"""C2: WhatsApp and USSD journeys, connections, webhooks and the phone simulator."""

import hashlib
import hmac
import json
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import User
from apps.accounts.services import RoleService
from apps.audit.models import AuditLog
from apps.channels.engine import JourneyRunner
from apps.channels.models import ChannelConnection, Journey, JourneySession, JourneySessionStep
from apps.channels.nodes import check_graph
from apps.core.capabilities import CAPABILITIES, clear_cache as clear_capability_cache
from apps.core.constants import RoleType
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.providers.ussd import PRESETS, GenericUSSDProvider
from apps.platform_config.providers.whatsapp import WhatsAppLogOnlyProvider
from apps.platform_config.testing import reset_platform_caches, set_features
from apps.submissions.models import ApplicationDraft

BASE = "/api/channels"


def data(response):
    return response.json()["data"]


class ChannelsTestCase(TestCase):
    def setUp(self):
        cache.clear()
        clear_capability_cache()
        reset_platform_caches(self)
        RoleService.ensure_default_roles()
        self.admin = User.objects.create_user(email="admin@ceda.co.bw", password="StrongPass123!", first_name="Ada", last_name="Admin")
        RoleService.assign_roles(self.admin, [RoleType.ADMINISTRATOR])
        self.officer = User.objects.create_user(email="officer@ceda.co.bw", password="StrongPass123!", first_name="Ofi", last_name="Cer")
        RoleService.assign_roles(self.officer, [RoleType.INNOVATION_OFFICER])
        self.viewer = User.objects.create_user(email="viewer@ceda.co.bw", password="StrongPass123!")
        RoleService.assign_roles(self.viewer, [RoleType.MANAGEMENT_VIEWER])
        self.client = APIClient()
        self.client.force_authenticate(self.admin)
        self.ussd_journey = Journey.objects.get(name="CEDA Innovation (USSD)")
        self.whatsapp_journey = Journey.objects.get(name="CEDA Innovation (WhatsApp)")
        WhatsAppLogOnlyProvider.sent.clear()

    # helpers ---------------------------------------------------------------------

    def add_ussd(self, name="Mascom *123#", preset="africas_talking", provider="ussd_log_only", journey=None, **extra):
        response = self.client.post(
            f"{BASE}/connections/",
            {"kind": "ussd", "provider": provider, "name": name, "preset": preset, "address": "*123#", "journey": str((journey or self.ussd_journey).id), **extra},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)

    def check_and_activate(self, connection_id):
        response = self.client.post(f"{BASE}/connections/{connection_id}/test/", {}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertTrue(data(response)["result"]["ok"], data(response)["result"])
        response = self.client.post(f"{BASE}/connections/{connection_id}/activate/")
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)

    def ussd(self, token, session="s1", phone="+26771234567", text="", **headers):
        anonymous = APIClient()
        return anonymous.post(f"{BASE}/ussd/{token}/", {"sessionId": session, "phoneNumber": phone, "serviceCode": "*123#", "text": text}, **headers)

    def token(self, connection):
        return ChannelConnection.objects.get(id=connection["id"]).webhook_token


class PermissionTests(ChannelsTestCase):
    def test_capability_is_in_the_map_for_officers_and_admins(self):
        self.assertEqual(set(CAPABILITIES["channels.manage"]), {RoleType.INNOVATION_OFFICER, RoleType.ADMINISTRATOR})
        self.client.force_authenticate(self.officer)
        self.assertEqual(self.client.get(f"{BASE}/journeys/").status_code, 200)

    def test_people_without_channels_manage_are_refused(self):
        self.client.force_authenticate(self.viewer)
        for method, url in [("get", "/journeys/"), ("get", "/connections/"), ("post", "/simulate/"), ("get", "/report/"), ("get", "/sessions/")]:
            self.assertEqual(getattr(self.client, method)(f"{BASE}{url}", {}, format="json").status_code, 403, url)

    def test_signed_out_people_are_refused(self):
        self.assertEqual(APIClient().get(f"{BASE}/journeys/").status_code, 401)

    def test_public_channels_says_nothing_is_live_without_a_connection(self):
        response = APIClient().get(f"{BASE}/public/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(data(response), {"ussd": {"live": False, "addresses": []}, "whatsapp": {"live": False, "addresses": []}})


class USSDPresetTests(TestCase):
    def provider(self, preset, **config):
        return GenericUSSDProvider(None, config={**PRESETS[preset]["config"], **config}, secrets={})

    def test_africas_talking_style(self):
        provider = self.provider("africas_talking")
        parsed = provider.parse({"sessionId": "AT1", "phoneNumber": "+26771000000", "serviceCode": "*123#", "text": "1*Water"})
        self.assertEqual((parsed.session_id, parsed.phone, parsed.short_code, parsed.text), ("AT1", "+26771000000", "*123#", "1*Water"))
        self.assertEqual(provider.new_input("1*Water", "1", "cumulative"), ("Water", "1*Water"))
        self.assertEqual(provider.format_reply("Hello", end=False).body, "CON Hello")
        self.assertEqual(provider.format_reply("Bye", end=True).body, "END Bye")

    def test_json_preset(self):
        provider = self.provider("json")
        parsed = provider.parse({"sessionId": "J1", "msisdn": "+26772000000", "shortCode": "*124#", "input": "2"})
        self.assertEqual((parsed.session_id, parsed.phone, parsed.text), ("J1", "+26772000000", "2"))
        reply = provider.format_reply('Say "hi"\n1. Yes', end=False)
        self.assertEqual(json.loads(reply.body), {"message": 'Say "hi"\n1. Yes', "continueSession": True})
        self.assertEqual(reply.content_type, "application/json")
        self.assertFalse(json.loads(provider.format_reply("Bye", end=True).body)["continueSession"])

    def test_xml_preset(self):
        provider = self.provider("xml")
        parsed = provider.parse({"sessionid": "X1", "msisdn": "+26773000000", "shortcode": "*125#", "input": "3"})
        self.assertEqual((parsed.session_id, parsed.text), ("X1", "3"))
        body = provider.format_reply("A & B", end=True).body
        self.assertEqual(body, "<response><message>A &amp; B</message><action>end</action></response>")

    def test_nested_json_field_paths(self):
        provider = self.provider("json", field_session_id="request.session", field_phone="request.from")
        parsed = provider.parse({"request": {"session": "N1", "from": "+26774000000"}, "input": ""})
        self.assertEqual((parsed.session_id, parsed.phone), ("N1", "+26774000000"))

    def test_template_without_text_is_refused(self):
        errors, _ = GenericUSSDProvider.validate({"response_format": "json", "response_template": '{"a": 1}'}, {})
        self.assertIn("response_template", errors)


class ConnectionTests(ChannelsTestCase):
    def test_two_ussd_connections_run_different_journeys_at_once(self):
        set_features(self, ussd=True)
        other = Journey.objects.create(name="Orange only", channel="ussd")
        self.client.put(
            f"{BASE}/journeys/{other.id}/nodes/",
            {"nodes": [{"key": "hi", "type": "end", "text": {"en": "Orange says hello", "tn": "Orange e a dumedisa"}}], "start_key": "hi"},
            format="json",
        )
        self.assertEqual(self.client.post(f"{BASE}/journeys/{other.id}/publish/").status_code, 200)
        mascom = self.add_ussd("Mascom *123#")
        orange = self.add_ussd("Orange *124#", journey=other)
        self.assertNotEqual(mascom["webhook_url"], orange["webhook_url"])
        self.assertEqual(mascom["status"], "not_tested")
        self.check_and_activate(mascom["id"])
        activated = self.check_and_activate(orange["id"])
        self.assertEqual(activated["status"], "active")
        self.assertEqual(IntegrationConnection.objects.filter(kind="ussd", is_active=True).count(), 2)

        first = self.ussd(self.token(mascom))
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.content.decode().startswith("CON CEDA Innovation\n1. Submit an idea"))
        second = self.ussd(self.token(orange), session="o1")
        self.assertEqual(second.content.decode(), "END Orange says hello")

    def test_test_shows_the_exact_reply_the_operator_receives(self):
        connection = self.add_ussd()
        response = self.client.post(f"{BASE}/connections/{connection['id']}/test/", {}, format="json")
        result = data(response)["result"]
        self.assertTrue(result["ok"])
        self.assertTrue(result["reply"]["body"].startswith("CON CEDA Innovation"))
        self.assertEqual(result["sample_request"]["sessionId"], "test-session-0001")

    def test_activate_needs_a_test_and_a_published_journey(self):
        connection = self.add_ussd()
        response = self.client.post(f"{BASE}/connections/{connection['id']}/activate/")
        self.assertEqual(response.status_code, 400)
        draft_only = Journey.objects.create(name="Draft", channel="ussd")
        self.client.patch(f"{BASE}/connections/{connection['id']}/", {"journey": str(draft_only.id)}, format="json")
        self.client.post(f"{BASE}/connections/{connection['id']}/test/", {}, format="json")
        response = self.client.post(f"{BASE}/connections/{connection['id']}/activate/")
        self.assertEqual(response.status_code, 400)
        self.assertIn("Publish the journey", json.dumps(response.json()))

    def test_secrets_are_never_returned_and_changes_are_audited(self):
        connection = self.add_ussd(provider="ussd_generic", secrets={"shared_secret": "operator-secret-1234"}, config={"auth_mode": "header"})
        self.assertNotIn("operator-secret-1234", json.dumps(connection))
        self.assertEqual(connection["secrets"]["shared_secret"]["is_set"], True)
        listing = self.client.get(f"{BASE}/connections/")
        self.assertNotIn("operator-secret-1234", listing.content.decode())
        self.assertTrue(AuditLog.objects.filter(action_type="channel_connection_created").exists())
        self.assertTrue(AuditLog.objects.filter(action_type="integration_created").exists())

    def test_wrong_kind_journey_is_refused(self):
        response = self.client.post(
            f"{BASE}/connections/",
            {"kind": "ussd", "provider": "ussd_log_only", "name": "X", "journey": str(self.whatsapp_journey.id)},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unknown_provider_is_refused(self):
        response = self.client.post(f"{BASE}/connections/", {"kind": "ussd", "provider": "whatsapp_cloud", "name": "X"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_other_kinds_keep_one_active_connection(self):
        from apps.platform_config.services import IntegrationService

        first, _ = IntegrationService.create(actor=self.admin, kind="sms", provider="log_only", name="One", config={}, secrets={})
        second, _ = IntegrationService.create(actor=self.admin, kind="sms", provider="log_only", name="Two", config={}, secrets={})
        for item in (first, second):
            IntegrationService.run_test(connection=item, actor=self.admin)
            IntegrationService.activate(connection=item, actor=self.admin)
        self.assertEqual(IntegrationConnection.objects.filter(kind="sms", is_active=True).count(), 1)

    def test_status_says_waiting_for_provider(self):
        response = self.client.get(f"{BASE}/status/")
        self.assertEqual(data(response)["ussd"]["state"], "waiting_for_provider")
        self.assertEqual(data(response)["whatsapp"]["state"], "waiting_for_provider")


class USSDWebhookTests(ChannelsTestCase):
    def live_connection(self, **extra):
        set_features(self, ussd=True)
        connection = self.add_ussd(**extra)
        self.check_and_activate(connection["id"])
        return connection

    def test_switch_off_gives_the_polite_reply(self):
        connection = self.live_connection()
        set_features(self, ussd=False)
        response = self.ussd(self.token(connection))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.content.decode(), "END This service is not available yet. Please try again later.")

    def test_inactive_connection_gives_the_polite_reply(self):
        set_features(self, ussd=True)
        connection = self.add_ussd()
        response = self.ussd(self.token(connection))
        self.assertTrue(response.content.decode().startswith("END This service is not available yet"))

    def test_unknown_token_is_refused_and_logged(self):
        with self.assertLogs("security.webhook", level="WARNING") as logs:
            response = self.ussd("not-a-token")
        self.assertEqual(response.status_code, 403)
        self.assertIn("security.webhook_rejected", logs.output[0])
        self.assertNotIn("+26771234567", logs.output[0])

    def test_shared_secret_header_is_checked(self):
        connection = self.live_connection(provider="ussd_generic", config={"auth_mode": "header"}, secrets={"shared_secret": "s3cret-value"})
        token = self.token(connection)
        with self.assertLogs("security.webhook", level="WARNING"):
            self.assertEqual(self.ussd(token).status_code, 403)
        self.assertEqual(self.ussd(token, HTTP_X_USSD_SECRET="s3cret-value").status_code, 200)

    def test_allowed_addresses_are_checked(self):
        connection = self.live_connection(provider="ussd_generic", config={"allowed_ips": ["10.1.0.0/16"]})
        token = self.token(connection)
        with self.assertLogs("security.webhook", level="WARNING"):
            self.assertEqual(self.ussd(token, REMOTE_ADDR="192.168.1.1").status_code, 403)
        self.assertEqual(self.ussd(token, REMOTE_ADDR="10.1.2.3").status_code, 200)

    def test_new_number_starts_an_idea_and_opens_it_on_the_website(self):
        connection = self.live_connection()
        token = self.token(connection)
        phone = "+26771112233"
        steps = ["", "1", "1*Solar fridge", "1*Solar fridge*Food spoils", "1*Solar fridge*Food spoils*Cheap solar box", "1*Solar fridge*Food spoils*Cheap solar box*Neo Mosweu"]
        replies = [self.ussd(token, session="idea1", phone=phone, text=text).content.decode() for text in steps]
        self.assertTrue(replies[1].startswith("CON What is your idea called?"))
        self.assertTrue(replies[4].startswith("CON What is your name?"))
        self.assertTrue(replies[5].startswith("END Saved as "), replies[5])
        draft = ApplicationDraft.objects.get(title="Solar fridge")
        self.assertEqual(draft.channel, "ussd")
        self.assertEqual(draft.draft_data["problem"], "Food spoils")
        person = User.objects.get(phone_number=phone)
        self.assertEqual(draft.innovator, person)
        self.assertEqual(person.first_name, "Neo")
        # The same person signs in on the website and sees the draft.
        web = APIClient()
        web.force_authenticate(person)
        listing = web.get("/api/drafts/")
        self.assertEqual(listing.status_code, 200)
        self.assertIn(draft.reference_number, listing.content.decode())
        session = JourneySession.objects.get(external_id="idea1")
        self.assertEqual(session.status, "completed")
        self.assertEqual(str(session.draft_id), str(draft.id))

    def test_registered_person_is_not_asked_for_a_name(self):
        connection = self.live_connection()
        person = User.objects.create_user(email="neo@example.com", password="StrongPass123!", phone_number="+26771999999")
        token = self.token(connection)
        texts = ["", "1", "1*Idea", "1*Idea*Problem", "1*Idea*Problem*Answer"]
        last = [self.ussd(token, session="reg", phone="+26771999999", text=t).content.decode() for t in texts][-1]
        self.assertTrue(last.startswith("END Saved as"), last)
        self.assertEqual(ApplicationDraft.objects.get(title="Idea").innovator, person)

    def test_invalid_choice_shows_the_menu_again(self):
        connection = self.live_connection()
        token = self.token(connection)
        self.ussd(token, session="bad")
        reply = self.ussd(token, session="bad", text="9").content.decode()
        self.assertTrue(reply.startswith("CON Please choose one of the numbers.\nCEDA Innovation"))

    def test_talk_to_us_on_ussd_asks_for_a_call_back(self):
        connection = self.live_connection()
        token = self.token(connection)
        with patch("apps.channels.handoff.open_handoff") as handoff:
            handoff.return_value = type("Conversation", (), {"id": "c-1"})()
            self.ussd(token, session="talk")
            self.assertTrue(self.ussd(token, session="talk", text="4").content.decode().startswith("CON Tell us"))
            reply = self.ussd(token, session="talk", text="4*Please call me about funding").content.decode()
        self.assertTrue(reply.startswith("END Thank you. A CEDA officer will call you back."))
        kwargs = handoff.call_args.kwargs
        self.assertEqual(kwargs["channel"], "ussd")
        self.assertEqual(kwargs["reason"], "Please call me about funding")
        self.assertEqual(kwargs["contact"]["phone"], "+26771234567")
        self.assertEqual(JourneySession.objects.get(external_id="talk").status, "handed_over")


WHATSAPP_SECRET = "meta-app-secret-77"


class WhatsAppWebhookTests(ChannelsTestCase):
    def cloud_connection(self, activate=True):
        set_features(self, whatsapp_messages=True)
        response = self.client.post(
            f"{BASE}/connections/",
            {
                "kind": "whatsapp",
                "provider": "whatsapp_cloud",
                "name": "CEDA WhatsApp",
                "address": "+26775000000",
                "journey": str(self.whatsapp_journey.id),
                "config": {"phone_number_id": "111", "business_account_id": "222"},
                "secrets": {"access_token": "meta-access-token-1", "app_secret": WHATSAPP_SECRET},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        connection = data(response)
        self.assertTrue(connection["config"]["verify_token"])
        if activate:
            from apps.platform_config.http import HttpResult

            with patch("apps.platform_config.http.request", return_value=HttpResult(200, {"display_phone_number": "+267 75 000 000", "verified_name": "CEDA"})):
                self.check_and_activate(connection["id"])
        return connection

    def meta_payload(self, text="hi", sender="26771234567"):
        return {"entry": [{"changes": [{"value": {"contacts": [{"wa_id": sender, "profile": {"name": "Neo"}}], "messages": [{"from": sender, "id": "wamid.1", "type": "text", "text": {"body": text}}]}}]}]}

    def post_signed(self, token, payload, secret=WHATSAPP_SECRET):
        body = json.dumps(payload).encode()
        signature = "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
        return APIClient().post(f"{BASE}/whatsapp/{token}/", data=body, content_type="application/json", HTTP_X_HUB_SIGNATURE_256=signature)

    def test_handshake(self):
        connection = self.cloud_connection(activate=False)
        token = self.token(connection)
        verify = connection["config"]["verify_token"]
        ok = APIClient().get(f"{BASE}/whatsapp/{token}/", {"hub.mode": "subscribe", "hub.verify_token": verify, "hub.challenge": "12345"})
        self.assertEqual((ok.status_code, ok.content.decode()), (200, "12345"))
        with self.assertLogs("security.webhook", level="WARNING"):
            bad = APIClient().get(f"{BASE}/whatsapp/{token}/", {"hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "12345"})
        self.assertEqual(bad.status_code, 403)

    def test_bad_signature_is_refused_and_logged(self):
        connection = self.cloud_connection()
        with self.assertLogs("security.webhook", level="WARNING") as logs, patch("apps.platform_config.http.request") as outbound:
            response = self.post_signed(self.token(connection), self.meta_payload(), secret="not-the-secret")
        self.assertEqual(response.status_code, 403)
        self.assertIn("security.webhook_rejected", logs.output[0])
        outbound.assert_not_called()
        self.assertFalse(JourneySession.objects.exists())

    def test_good_signature_runs_the_journey_and_replies_with_a_list(self):
        from apps.platform_config.http import HttpResult

        connection = self.cloud_connection()
        with patch("apps.platform_config.http.request", return_value=HttpResult(200, {"messages": [{"id": "wamid.out"}]})) as outbound:
            response = self.post_signed(self.token(connection), self.meta_payload())
        self.assertEqual(response.status_code, 200, response.content)
        payload = outbound.call_args.kwargs["json_body"]
        self.assertEqual(payload["type"], "interactive")
        self.assertEqual(payload["interactive"]["type"], "list")  # 4 options: a list, not buttons
        self.assertEqual(len(payload["interactive"]["action"]["sections"][0]["rows"]), 4)

    def test_talk_to_us_lands_in_the_inbox(self):
        from apps.platform_config.http import HttpResult

        connection = self.cloud_connection()
        token = self.token(connection)
        with patch("apps.platform_config.http.request", return_value=HttpResult(200, {"messages": [{"id": "wamid.out"}]})), patch("apps.channels.handoff.open_handoff") as handoff:
            handoff.return_value = type("Conversation", (), {"id": "conv-9"})()
            self.post_signed(token, self.meta_payload("hi"))
            self.post_signed(token, self.meta_payload("4"))
        kwargs = handoff.call_args.kwargs
        self.assertEqual(kwargs["channel"], "whatsapp")
        self.assertEqual(kwargs["contact"]["phone"], "+26771234567")
        self.assertTrue(any(item["from"] == "person" and item["text"] == "4" for item in kwargs["transcript"]))
        session = JourneySession.objects.get(channel="whatsapp")
        self.assertEqual((session.status, session.conversation_id), ("handed_over", "conv-9"))
        self.assertNotIn("Tell us in a few words", json.dumps(session.state["transcript"][-1]))

    def test_without_c1_the_handoff_is_kept_as_a_support_request(self):
        from apps.channels import handoff as handoff_module
        from apps.support.models import SupportRequest

        if not handoff_module.HANDOFF_IS_STUB:
            self.skipTest("C1 is on main; the inbox test above covers it.")
        handoff_module.open_handoff(channel="whatsapp", contact={"phone": "+26771234567"}, subject="WhatsApp chat", transcript=[{"from": "person", "text": "help", "at": ""}])
        self.assertTrue(SupportRequest.objects.filter(request_type="whatsapp_handoff", phone_number="+26771234567").exists())

    def test_switch_off_answers_politely(self):
        connection = self.cloud_connection()
        set_features(self, whatsapp_messages=False)
        from apps.platform_config.http import HttpResult

        with patch("apps.platform_config.http.request", return_value=HttpResult(200, {"messages": [{"id": "x"}]})) as outbound:
            self.post_signed(self.token(connection), self.meta_payload())
        self.assertIn("not available yet", outbound.call_args.kwargs["json_body"]["text"]["body"])
        self.assertFalse(JourneySession.objects.exists())

    def test_log_only_provider_and_missing_templates(self):
        set_features(self, whatsapp_messages=True)
        response = self.client.post(
            f"{BASE}/connections/",
            {"kind": "whatsapp", "provider": "whatsapp_log_only", "name": "Test number", "journey": str(self.whatsapp_journey.id), "secrets": {"webhook_secret": "wa-secret-1"}, "config": {"templates": {"staff_reply": "staff_reply_v1"}}},
            format="json",
        )
        connection = data(response)
        self.assertIn("idea_update", connection["templates_missing"])
        self.assertNotIn("staff_reply", connection["templates_missing"])
        self.check_and_activate(connection["id"])
        reply = APIClient().post(f"{BASE}/whatsapp/{self.token(connection)}/", {"from": "+26771234567", "text": "hi"}, format="json", HTTP_X_WEBHOOK_SECRET="wa-secret-1")
        self.assertEqual(reply.status_code, 200)
        self.assertEqual(WhatsAppLogOnlyProvider.sent[-1]["payload"]["choices"][0], "Submit an idea")


class JourneyAndPublishTests(ChannelsTestCase):
    def new_journey(self, nodes, start="a", channel="ussd"):
        response = self.client.post(f"{BASE}/journeys/", {"name": "Test", "channel": channel, "nodes": nodes, "start_key": start}, format="json")
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)

    def test_publish_refuses_with_a_plain_list(self):
        long_text = "x" * 190
        journey = self.new_journey(
            [
                {"key": "a", "type": "menu", "text": {"en": long_text}, "settings": {"options": [{"label": {"en": f"O{i}"}, "next": "b"} for i in range(9)]}},
                {"key": "b", "type": "message", "text": {"en": "Loop"}, "next": "c"},
                {"key": "c", "type": "message", "text": {"en": "Loop back"}, "next": "b"},
                {"key": "lonely", "type": "end", "text": {"en": "Nobody comes here", "tn": "Ga go ope"}},
            ]
        )
        response = self.client.post(f"{BASE}/journeys/{journey['id']}/publish/")
        self.assertEqual(response.status_code, 400)
        codes = {(p["node"], p["code"]) for p in response.json()["errors"]["problems"]}
        self.assertIn(("a", "screen_too_long"), codes)
        self.assertIn(("a", "too_many_options"), codes)
        self.assertIn(("b", "no_way_out"), codes)
        self.assertIn(("lonely", "unreachable"), codes)
        self.assertIn(("a", "missing_setswana"), codes)
        self.assertEqual(Journey.objects.get(id=journey["id"]).version, 0)

    def test_publish_freezes_a_version_and_live_sessions_keep_theirs(self):
        journey = self.new_journey([{"key": "a", "type": "menu", "text": {"en": "Hi", "tn": "Dumela"}, "settings": {"options": [{"label": {"en": "Go", "tn": "Tsamaya"}, "next": "z"}]}}, {"key": "z", "type": "end", "text": {"en": "Version one", "tn": "Wa ntlha"}}])
        self.assertEqual(self.client.post(f"{BASE}/journeys/{journey['id']}/publish/").status_code, 200)
        first = data(self.client.post(f"{BASE}/simulate/", {"journey": journey["id"], "channel": "ussd", "version": "published"}, format="json"))
        self.client.patch(f"{BASE}/journeys/{journey['id']}/nodes/z/", {"text": {"en": "Version two", "tn": "Wa bobedi"}}, format="json")
        self.client.post(f"{BASE}/journeys/{journey['id']}/publish/")
        answer = data(self.client.post(f"{BASE}/simulate/", {"journey": journey["id"], "channel": "ussd", "session_id": first["session_id"], "input": "1"}, format="json"))
        self.assertEqual(answer["screen"]["text"], "Version one")
        versions = data(self.client.get(f"{BASE}/journeys/{journey['id']}/versions/"))
        self.assertEqual([v["number"] for v in versions], [2, 1])
        self.assertTrue(AuditLog.objects.filter(action_type="channel_journey_published").exists())

    def test_node_validation_errors(self):
        journey = self.new_journey([{"key": "a", "type": "end", "text": {"en": "Bye"}}])
        response = self.client.post(f"{BASE}/journeys/{journey['id']}/nodes/", {"key": "Bad Key!", "type": "end"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(f"{BASE}/journeys/{journey['id']}/nodes/", {"key": "b", "type": "teleport"}, format="json")
        self.assertEqual(response.status_code, 400)
        response = self.client.post(f"{BASE}/journeys/{journey['id']}/nodes/", {"key": "a", "type": "end"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_validate_endpoint(self):
        response = self.client.post(f"{BASE}/journeys/{self.ussd_journey.id}/validate/")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(data(response)["ok"], data(response)["problems"])

    def test_seeded_journeys_have_no_errors_in_either_channel(self):
        for journey in (self.ussd_journey, self.whatsapp_journey):
            problems = check_graph(journey.latest_version.graph, journey.channel)
            self.assertEqual([p for p in problems if p["level"] == "error"], [], journey.name)
            self.assertEqual([p for p in problems if p["level"] == "warning"], [], journey.name)

    def test_cannot_delete_a_journey_an_active_connection_runs(self):
        set_features(self, ussd=True)
        connection = self.add_ussd()
        self.check_and_activate(connection["id"])
        self.assertEqual(self.client.delete(f"{BASE}/journeys/{self.ussd_journey.id}/").status_code, 400)


class SimulatorTests(ChannelsTestCase):
    def simulate(self, **body):
        response = self.client.post(f"{BASE}/simulate/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)

    def test_works_with_no_provider_and_switch_off(self):
        self.assertFalse(IntegrationConnection.objects.exists())
        first = self.simulate(journey=str(self.ussd_journey.id), channel="ussd")
        self.assertEqual(first["screen"]["node_key"], "main")
        self.assertEqual(first["screen"]["node_title"], "Main menu")
        self.assertTrue(first["screen"]["ussd_text"].startswith("CEDA Innovation\n1. Submit an idea"))
        self.assertFalse(first["registered"])

    def test_new_number_starts_an_idea_and_the_draft_appears_for_that_person(self):
        session = self.simulate(journey=str(self.ussd_journey.id), channel="ussd")["session_id"]
        for answer in ["1", "Mobile clinic", "Clinics are far", "A clinic in a van", "Kago Molefe"]:
            last = self.simulate(journey=str(self.ussd_journey.id), channel="ussd", session_id=session, input=answer)
        self.assertTrue(last["screen"]["end"])
        self.assertIsNotNone(last["draft"])
        draft = ApplicationDraft.objects.get(id=last["draft"]["id"])
        self.assertEqual(draft.innovator.phone_number, last["phone"])
        self.assertTrue(draft.metadata.get("simulation"))

    def test_registered_mode_uses_the_signed_in_person(self):
        first = self.simulate(journey=str(self.ussd_journey.id), channel="ussd", as_registered=True)
        self.assertTrue(first["registered"])

    def test_whatsapp_look_and_language(self):
        first = self.simulate(journey=str(self.whatsapp_journey.id), channel="whatsapp")
        self.assertEqual(first["screen"]["whatsapp_layout"], "list")
        self.assertEqual([c["title"] for c in first["screen"]["choices"]][:1], ["Submit an idea"])

    def test_restart_cancels_the_old_session(self):
        first = self.simulate(journey=str(self.ussd_journey.id), channel="ussd")
        self.simulate(journey=str(self.ussd_journey.id), channel="ussd", session_id=first["session_id"], restart=True)
        self.assertEqual(JourneySession.objects.get(id=first["session_id"]).status, "abandoned")

    def test_wrong_channel_is_refused(self):
        response = self.client.post(f"{BASE}/simulate/", {"journey": str(self.ussd_journey.id), "channel": "whatsapp"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_simulations_are_left_out_of_the_report(self):
        self.simulate(journey=str(self.ussd_journey.id), channel="ussd")
        report = data(self.client.get(f"{BASE}/report/"))
        self.assertEqual(report["totals"]["sessions"], 0)
        report = data(self.client.get(f"{BASE}/report/", {"include_simulations": "true"}))
        self.assertEqual(report["totals"]["sessions"], 1)
        self.assertEqual(len(report["per_day"]), 30)


def runner(nodes, start="a", channel="ussd", **context):
    graph = {"start": start, "default_language": "en", "nodes": {n["key"]: {"next": "", "settings": {}, "text": {}, **n} for n in nodes}}
    return JourneyRunner(graph, {}, channel=channel, phone=context.pop("phone", "+26771000001"), user=context.pop("user", None), session_id="t", **context)


class NodeTypeTests(ChannelsTestCase):
    def test_menu_message_and_end(self):
        r = runner(
            [
                {"key": "a", "type": "message", "text": {"en": "Welcome {name}"}, "next": "m"},
                {"key": "m", "type": "menu", "text": {"en": "Pick"}, "settings": {"options": [{"label": {"en": "One"}, "next": "e"}]}},
                {"key": "e", "type": "end", "text": {"en": "Bye"}},
            ]
        )
        screen = r.start()
        self.assertEqual(screen.ussd_text(), "Welcome {name}\nPick\n1. One")
        self.assertTrue(r.answer("One").end)

    def test_question_types(self):
        cases = [
            ("number", "abc", "12", 12),
            ("date", "tomorrow", "25/12/2026", "2026-12-25"),
            ("yes_no", "maybe", "ee", True),
            ("text", "", "Hello", "Hello"),
        ]
        for answer_type, bad, good, value in cases:
            r = runner([{"key": "a", "type": "question", "text": {"en": "Q"}, "settings": {"answer_type": answer_type, "variable": "v"}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Done"}}])
            r.start()
            self.assertFalse(r.answer(bad).end, answer_type)
            self.assertTrue(r.answer(good).end, answer_type)
            self.assertEqual(r.state["vars"]["v"], value, answer_type)
        r = runner([{"key": "a", "type": "question", "text": {"en": "Q"}, "settings": {"answer_type": "choice", "variable": "v", "choices": [{"label": {"en": "Red"}}, {"label": {"en": "Blue"}}]}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Done"}}])
        r.start()
        r.answer("2")
        self.assertEqual(r.state["vars"]["v"], "Blue")

    def test_sensitive_answers_are_not_logged(self):
        r = runner([{"key": "a", "type": "question", "text": {"en": "ID number?"}, "settings": {"variable": "omang", "sensitive": True}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Done"}}])
        r.start()
        r.answer("123456789")
        self.assertIn(("a", "question", "[hidden]"), r.logged_steps)
        self.assertNotIn("123456789", json.dumps(r.state["transcript"]))

    def test_condition_on_a_variable_and_on_registration(self):
        nodes = [
            {"key": "a", "type": "question", "text": {"en": "Age?"}, "settings": {"answer_type": "number", "variable": "age"}, "next": "c"},
            {"key": "c", "type": "condition", "settings": {"variable": "age", "operator": "gt", "value": "35", "true_next": "old", "false_next": "young"}},
            {"key": "old", "type": "end", "text": {"en": "Over 35"}},
            {"key": "young", "type": "end", "text": {"en": "Youth"}},
        ]
        r = runner(nodes)
        r.start()
        self.assertEqual(r.answer("22").text, "Youth")
        reg = [{"key": "a", "type": "condition", "settings": {"check": "registered", "true_next": "y", "false_next": "n"}}, {"key": "y", "type": "end", "text": {"en": "Known"}}, {"key": "n", "type": "end", "text": {"en": "New"}}]
        self.assertEqual(runner(reg).start().text, "New")
        self.assertEqual(runner(reg, user=self.admin).start().text, "Known")

    def test_language_switches_text(self):
        r = runner([{"key": "a", "type": "language", "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Bye", "tn": "Sala sentle"}}])
        self.assertEqual([c.title for c in r.start().choices], ["English", "Setswana"])
        self.assertEqual(r.answer("2").text, "Sala sentle")

    def test_lookups(self):
        from apps.support.models import FAQ

        FAQ.objects.create(question="How do I enter a challenge?", answer="Choose a challenge and press Enter.", placements=["whatsapp_bot"])
        r = runner([{"key": "a", "type": "question", "text": {"en": "Ask"}, "settings": {"variable": "q"}, "next": "l"}, {"key": "l", "type": "lookup", "settings": {"lookup": "faq", "input_variable": "q"}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Bye"}}])
        r.start()
        self.assertIn("Choose a challenge and press Enter.", r.answer("how to enter challenge").text)
        for kind in ("open_challenges", "upcoming_events", "idea_status"):
            text = runner([{"key": "a", "type": "lookup", "settings": {"lookup": kind}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Bye"}}]).start().text
            self.assertTrue(text.endswith("Bye") and len(text) > 4, kind)

    def test_subscribe(self):
        from apps.content.models import Subscriber

        r = runner([{"key": "a", "type": "subscribe", "text": {"en": "You will get updates."}, "settings": {"topics": ["challenges"]}, "next": "e"}, {"key": "e", "type": "end", "text": {"en": "Bye"}}], phone="+26771000077")
        self.assertIn("You will get updates.", r.start().text)
        self.assertEqual(Subscriber.objects.get(phone="+26771000077").topics, ["challenges"])

    def test_save_draft_updates_the_same_draft(self):
        nodes = [
            {"key": "a", "type": "question", "text": {"en": "Title?"}, "settings": {"variable": "title"}, "next": "s"},
            {"key": "s", "type": "save_draft", "text": {"en": "Saved {draft_reference}"}, "settings": {"title_variable": "title", "fields": {"problem": "title"}}, "next": "a"},
        ]
        r = runner(nodes, phone="+26771000088")
        r.start()
        first = r.answer("First")
        self.assertIn("Saved", first.text)
        r.answer("Second")
        drafts = ApplicationDraft.objects.filter(innovator__phone_number="+26771000088")
        self.assertEqual(drafts.count(), 1)
        self.assertEqual(drafts.get().title, "Second")

    def test_session_steps_are_logged(self):
        first = data(self.client.post(f"{BASE}/simulate/", {"journey": str(self.ussd_journey.id), "channel": "ussd"}, format="json"))
        self.client.post(f"{BASE}/simulate/", {"journey": str(self.ussd_journey.id), "channel": "ussd", "session_id": first["session_id"], "input": "3"}, format="json")
        self.assertEqual(list(JourneySessionStep.objects.values_list("node_key", flat=True)), ["main", "challenges", "challenges_done"])
        sessions = data(self.client.get(f"{BASE}/sessions/", {"include_simulations": "true"}))
        self.assertEqual(sessions["count"], 1)
        detail = data(self.client.get(f"{BASE}/sessions/{sessions['results'][0]['id']}/"))
        self.assertTrue(detail["steps"])


class BuilderSupportTests(ChannelsTestCase):
    """What the staff builders (3.31, 3.31b), simulator (3.32) and overview (3.33) read."""

    KINDS = {"text", "number", "boolean", "select", "multi", "bilingual", "node", "variable", "variable_ref", "options", "choices", "mapping", "program"}

    def test_every_node_type_describes_its_settings(self):
        from apps.channels.node_schema import defaults_for

        types = data(self.client.get(f"{BASE}/node-types/"))
        self.assertEqual({t["type"] for t in types}, {"menu", "message", "question", "save_draft", "lookup", "condition", "subscribe", "language", "handoff", "end"})
        for item in types:
            self.assertIn("next", item, item["type"])
            self.assertIn("text", item, item["type"])
            self.assertTrue(item["label_tn"] and item["description_tn"], item["type"])
            names = {f["name"] for f in item["fields"]}
            for field in item["fields"]:
                self.assertIn(field["kind"], self.KINDS, (item["type"], field["name"]))
                self.assertTrue(field["label"] and field["label_tn"], (item["type"], field["name"]))
                if field["kind"] in ("select", "multi"):
                    self.assertTrue(field["choices"])
                if "show_if" in field:
                    self.assertIn(field["show_if"]["field"], names)
            if item.get("ends_when"):
                self.assertIn(item["ends_when"], names)
        self.assertEqual(defaults_for("question")["answer_type"], "text")
        self.assertEqual(len(defaults_for("menu")["options"]), 1)

    def test_status_includes_live_chat(self):
        status = data(self.client.get(f"{BASE}/status/"))
        self.assertIn("live_chat", status)
        self.assertEqual(status["live_chat"]["switch_on"], False)
        self.assertIn("officers_online", status["live_chat"])

    def test_report_splits_sessions_by_channel_and_gives_a_funnel(self):
        journey = str(self.ussd_journey.id)
        first = data(self.client.post(f"{BASE}/simulate/", {"journey": journey, "channel": "ussd", "version": "published"}, format="json"))
        self.client.post(f"{BASE}/simulate/", {"journey": journey, "channel": "ussd", "session_id": first["session_id"], "input": "1"}, format="json")
        self.client.post(f"{BASE}/simulate/", {"journey": journey, "channel": "ussd", "version": "published"}, format="json")
        report = data(self.client.get(f"{BASE}/report/", {"include_simulations": "true", "journey": journey}))
        today = report["per_day"][-1]
        self.assertEqual(today["by_channel"], {"ussd": 2, "whatsapp": 0})
        steps = report["funnel"]["steps"]
        self.assertEqual(steps[0], {"node_key": "", "title": "", "is_start": True, "sessions": 2})
        self.assertEqual(steps[1]["node_key"], "idea_title")
        self.assertEqual(steps[1]["sessions"], 1)
        self.assertIsNone(data(self.client.get(f"{BASE}/report/"))["funnel"])

    def test_sessions_name_the_screen_they_stopped_on(self):
        first = data(self.client.post(f"{BASE}/simulate/", {"journey": str(self.ussd_journey.id), "channel": "ussd", "version": "published"}, format="json"))
        self.client.post(f"{BASE}/simulate/", {"journey": str(self.ussd_journey.id), "channel": "ussd", "session_id": first["session_id"], "input": "1"}, format="json")
        row = data(self.client.get(f"{BASE}/sessions/", {"include_simulations": "true"}))["results"][0]
        self.assertEqual(row["current_node_title"], "Idea name")


class ConnectionKeyTests(ChannelsTestCase):
    """Staff change keys and switch connections in the console, with no developer."""

    def add_twilio(self, name):
        response = self.client.post(
            f"{BASE}/connections/",
            {
                "kind": "whatsapp",
                "provider": "whatsapp_twilio",
                "name": name,
                "address": "+14155238886",
                "journey": str(self.whatsapp_journey.id),
                "config": {"account_sid": "AC-sandbox", "from_number": "+14155238886"},
                "secrets": {"auth_token": "sandbox-token-1111"},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.content)
        return data(response)

    def test_changing_keys_keeps_the_webhook_address_and_the_journey(self):
        connection = self.add_twilio("Twilio Sandbox")
        response = self.client.patch(
            f"{BASE}/connections/{connection['id']}/",
            {"config": {"account_sid": "AC-production", "from_number": "+26775000000"}, "secrets": {"auth_token": "production-token-2222"}},
            format="json",
        )
        self.assertEqual(response.status_code, 200, response.content)
        changed = data(response)
        self.assertEqual(changed["webhook_url"], connection["webhook_url"])
        self.assertEqual(changed["journey"]["id"], str(self.whatsapp_journey.id))
        self.assertEqual(changed["config"]["account_sid"], "AC-production")
        self.assertTrue(changed["secrets"]["auth_token"]["is_set"])
        self.assertNotIn("production-token-2222", response.content.decode())
        self.assertNotIn("sandbox-token-1111", self.client.get(f"{BASE}/connections/{connection['id']}/").content.decode())
        from apps.platform_config.crypto import decrypt_secrets

        saved = ChannelConnection.objects.get(id=connection["id"]).connection
        self.assertEqual(decrypt_secrets(saved.secrets_encrypted)["auth_token"], "production-token-2222")

    def test_an_empty_secret_keeps_the_saved_one(self):
        connection = self.add_twilio("Twilio Sandbox")
        self.client.patch(f"{BASE}/connections/{connection['id']}/", {"name": "Twilio test number", "secrets": {"auth_token": ""}}, format="json")
        from apps.platform_config.crypto import decrypt_secrets

        saved = ChannelConnection.objects.get(id=connection["id"]).connection
        self.assertEqual(saved.name, "Twilio test number")
        self.assertEqual(decrypt_secrets(saved.secrets_encrypted)["auth_token"], "sandbox-token-1111")

    def test_two_connections_and_switching_which_is_active(self):
        from apps.platform_config.http import HttpResult

        sandbox = self.add_twilio("Twilio Sandbox")
        production = self.add_twilio("Twilio production")
        with patch("apps.platform_config.http.request", return_value=HttpResult(200, {"status": "active"})):
            for item in (sandbox, production):
                self.check_and_activate(item["id"])
        self.assertEqual(IntegrationConnection.objects.filter(kind="whatsapp", is_active=True).count(), 2)
        self.assertEqual(self.client.post(f"{BASE}/connections/{sandbox['id']}/deactivate/").status_code, 200)
        states = {c["name"]: c["status"] for c in data(self.client.get(f"{BASE}/connections/", {"kind": "whatsapp"}))}
        self.assertEqual(states, {"Twilio Sandbox": "off", "Twilio production": "active"})
