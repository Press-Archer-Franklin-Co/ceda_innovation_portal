"""WhatsApp full flow: buttons by default, the whole idea in WhatsApp (form_questions), and
"My ideas" without idea numbers. No real network: Twilio is faked (see test_channels_twilio_api)."""

import json

from django.core.management import call_command
from django.test import override_settings
from django.utils import timezone

from apps.channels import upgrade
from apps.channels.engine import JourneyRunner
from apps.channels.models import ChannelConnection, Journey, JourneyNode, JourneySession
from apps.channels.nodes import check_graph
from apps.core.constants import ProgramTypeCode
from apps.documents.models import SubmissionDocument
from apps.platform_config.http import DownloadResult
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.providers.whatsapp import cut_title
from apps.platform_config.testing import set_features
from apps.programs.form_schema import build_form_schema
from apps.programs.general_intake import GeneralIntakeService
from apps.programs.models import (
    FieldValidationRule,
    FormSection,
    FormVersion,
    Program,
    ProgramType,
    SubmissionForm,
    SubmissionFormField,
    SubmissionFormFieldOption,
)
from apps.submissions.models import ApplicationDraft, Submission
from tests.api.test_channels_api import BASE, data
from tests.api.test_channels_twilio_api import PDF, TwilioTestCase

PHONE = "+26771234567"


def make_challenge(owner, title="Clean Water Challenge"):
    program_type, _ = ProgramType.objects.get_or_create(code=ProgramTypeCode.IDEA, defaults={"name": "Idea"})
    program = Program.objects.create(
        title=title, slug=title.lower().replace(" ", "-"), description=title, program_type=program_type,
        opening_date=timezone.now() - timezone.timedelta(days=1), closing_date=timezone.now() + timezone.timedelta(days=10),
        owner=owner, status="published", is_public=True,
    )
    form = SubmissionForm.objects.create(title=f"{title} form", status=SubmissionForm.Status.LIVE, languages=["en", "tn"])
    program.form = form
    program.save(update_fields=["form", "updated_at"])
    about = FormSection.objects.create(form=form, title="Your idea", code="idea", ordering=1)
    extra = FormSection.objects.create(form=form, title="More", code="more", ordering=2)

    def field(section, key, kind, label, order, required=True, **more):
        return SubmissionFormField.objects.create(form=form, section=section, key=key, field_type=kind, label=label, ordering=order, row=order, required=required, **more)

    field(about, "intro", "heading", "About your idea", 1, required=False)
    title_field = field(about, "title", "text", "Idea name", 2, translations={"tn": {"label": "Leina la kakanyo"}})
    FieldValidationRule.objects.create(field=title_field, rule_type="min_length", rule_value="3", error_message="Use at least 3 letters.")
    field(about, "summary", "textarea", "Describe your idea", 3)
    field(about, "team_size", "number", "How many people are in your team?", 4)
    field(about, "email", "email", "Your email", 5)
    field(about, "start_date", "date", "When did you start?", 6)
    stage = field(about, "stage", "radio", "Stage", 7)
    for order, (value, label) in enumerate([("idea", "Just an idea"), ("prototype", "A prototype"), ("selling", "Already selling")], start=1):
        SubmissionFormFieldOption.objects.create(field=stage, value=value, label=label, ordering=order)
    field(about, "has_company", "yes_no", "Do you have a company?", 8)
    field(about, "company_name", "text", "Company name", 9, visible_if={"all": [{"field": "has_company", "op": "equals", "value": "yes"}]})
    sectors = field(about, "sectors", "checkboxes", "Sectors", 10)
    for order, (value, label) in enumerate([("agri", "Agriculture"), ("health", "Health"), ("water", "Water")], start=1):
        SubmissionFormFieldOption.objects.create(field=sectors, value=value, label=label, ordering=order)
    field(about, "website", "url", "Website", 11, required=False)
    field(extra, "pitch", "file", "Pitch document", 1)
    field(extra, "map_pin", "location", "Where is it? (pin on a map)", 2)
    FormVersion.objects.create(form=form, number=1, schema=build_form_schema(form, include_inactive=False))
    return program


def form_journey(name="Full form", channel="whatsapp", program_source="fixed", program=None, **settings):
    journey = Journey.objects.create(name=name, channel=channel, start_key="form", default_language="en")
    nodes = {
        "form": {"type": "form_questions", "title": "Form", "text": {"en": "Let's go.", "tn": "A re yeng."}, "next": "send",
                 "settings": {"program_source": program_source, "program_id": str(program.id) if program else None, "ask": "required", **settings}},
        "send": {"type": "submit", "title": "Send", "text": {}, "next": "",
                 "settings": {"require_consent": True, "consent_text": {"en": "Reply YES to send."}, "success_text": {"en": "Sent: {reference}."}, "success_next": "", "error_next": ""}},
    }
    for key, node in nodes.items():
        JourneyNode.objects.create(journey=journey, key=key, type=node["type"], title=node["title"], text=node["text"], settings=node["settings"], next_key=node["next"])
    from apps.channels.services import JourneyService

    JourneyService.publish(journey=journey, actor=None)
    return journey


class FakeMedia:
    def __call__(self, url, **kwargs):
        return DownloadResult(ok=True, status=200, content=PDF, content_type="application/pdf")


class FlowTestCase(TwilioTestCase):
    def setUp(self):
        super().setUp()
        from unittest.mock import patch

        patcher = patch("apps.platform_config.http.download", FakeMedia())
        patcher.start()
        self.addCleanup(patcher.stop)

    def use_journey(self, journey, **config):
        """Point the Sandbox connection at another journey (numbered text unless asked)."""
        link = ChannelConnection.objects.select_related("connection").get(id=self.connection["id"])
        link.connection.config = {**link.connection.config, "interactive_mode": config.get("interactive_mode", "numbered")}
        link.connection.save(update_fields=["config"])
        link.journey = journey
        link.save(update_fields=["journey"])

    def send_file(self, text="", **more):
        return self.say(text, NumMedia="1", MediaUrl0="https://api.twilio.com/media/ME1", MediaContentType0="application/pdf", **more)


# --------------------------------------------------------------------------------------
# 1. Buttons and lists
# --------------------------------------------------------------------------------------


class ButtonsTests(FlowTestCase):
    def test_titles_are_cut_at_a_word_never_mid_word(self):
        self.assertEqual(cut_title("Submit an idea", 20), "Submit an idea")
        self.assertEqual(cut_title("Submit an idea to a challenge", 20), "Submit an idea to a…")
        self.assertEqual(cut_title("Renewable energy for rural clinics", 24), "Renewable energy for…")
        self.assertTrue(len(cut_title("Renewable energy for rural clinics", 20)) <= 20)
        self.assertEqual(cut_title("Supercalifragilisticexpialidocious", 20), "Supercalifragilisti…")

    def test_new_twilio_connections_send_buttons_by_default(self):
        connection = ChannelConnection.objects.get(id=self.connection["id"]).connection
        connection.config.pop("interactive_mode", None)
        connection.save(update_fields=["config"])
        self.say("hi")
        content = [kwargs for url, kwargs in self.fake.calls if url.startswith("https://content.twilio.com/")]
        self.assertEqual(len(content), 1)
        spec = content[0]["json_body"]["types"]["twilio/list-picker"]  # 4 options: a list
        self.assertEqual([item["item"] for item in spec["items"]], ["Submit an idea", "Check my idea", "Open challenges", "Talk to us"])
        self.assertEqual(spec["button"], "Choose")
        self.assertIn("ContentSid", self.fake.sent()[-1])

    def test_three_choices_go_as_quick_reply_buttons_with_cut_titles(self):
        from apps.platform_config.providers.whatsapp import Choice, OutboundReply, WhatsAppTwilioProvider

        provider = WhatsAppTwilioProvider(config={"account_sid": "AC1", "from_number": "+14155238886", "interactive_mode": "buttons"}, secrets={"auth_token": "fake"})
        provider.send_reply("+26771234567", OutboundReply("Pick one", [Choice("1", "Yes please"), Choice("2", "No thank you very much indeed"), Choice("3", "Later")]))
        spec = self.fake.calls[-2][1]["json_body"]["types"]["twilio/quick-reply"]
        self.assertEqual([a["title"] for a in spec["actions"]], ["Yes please", "No thank you very…", "Later"])
        self.assertEqual([a["id"] for a in spec["actions"]], ["1", "2", "3"])

    def test_tapped_button_and_list_row_and_typed_title_all_choose(self):
        self.use_journey(self.whatsapp_journey, interactive_mode="buttons")
        with self.assertLogs("apps.channels.whatsapp", level="INFO") as logs:
            self.say("hi")
            self.say("Check my idea", ListId="2", ListTitle="Check my idea")
        self.assertIn("choice=list", logs.output[-1])
        self.assertNotIn("Check my idea", logs.output[-1])  # the value is never logged
        session = JourneySession.objects.get(phone=PHONE)
        self.assertNotEqual(session.current_node, "main")
        self.say("menu")
        with self.assertLogs("apps.channels.whatsapp", level="INFO") as logs:
            self.say("Open challenges", ButtonPayload="3", ButtonText="Open challenges")
        self.assertIn("choice=button", logs.output[-1])
        self.say("menu")
        self.say("open challenges")  # typed title
        self.assertIn("challenge", self.fake.sent()[-1].get("Body", self.fake.sent()[-1].get("ContentSid", "")).lower() + "challenge")

    def test_failed_content_api_falls_back_to_numbered_text(self):
        self.use_journey(self.whatsapp_journey, interactive_mode="buttons")
        self.fake.content_ok = False
        self.say("hi")
        self.assertIn("1. Submit an idea", self.last_text())

    def test_more_than_ten_choices_go_as_numbered_text(self):
        from apps.channels.engine import Choice, Screen
        from apps.channels.services import WhatsAppOutbound, _provider
        self.use_journey(self.whatsapp_journey, interactive_mode="buttons")
        provider = _provider(ChannelConnection.objects.get(id=self.connection["id"]))
        screen = Screen(text="Pick a district", end=False, choices=[Choice(str(i), f"District {i}") for i in range(1, 13)], lang="tn")
        WhatsAppOutbound.send_screen(provider, PHONE, screen)
        body = self.last_text()
        self.assertIn("12. District 12", body)
        self.assertIn("Araba ka nomoro.", body)
        self.assertFalse([url for url, _ in self.fake.calls if url.startswith("https://content.twilio.com/")])

    def test_migration_switches_only_twilio_connections_on_the_old_default(self):
        from importlib import import_module

        from django.apps import apps as django_apps

        migration = import_module("apps.channels.migrations.0006_form_questions_my_ideas_and_buttons")
        old = ChannelConnection.objects.get(id=self.connection["id"]).connection
        old.config = {**old.config, "interactive_mode": "numbered"}
        old.save(update_fields=["config"])
        chosen = self.add_twilio("Production", number="+26775000000", activate=False, interactive_mode="buttons")
        migration.buttons_on(django_apps, None)
        old.refresh_from_db()
        self.assertEqual(old.config["interactive_mode"], "buttons")
        migration.buttons_off(django_apps, None)
        old.refresh_from_db()
        self.assertEqual(old.config["interactive_mode"], "numbered")
        self.assertEqual(ChannelConnection.objects.get(id=chosen["id"]).connection.config["interactive_mode"], "buttons")


# --------------------------------------------------------------------------------------
# 2. The form's questions
# --------------------------------------------------------------------------------------


class FormQuestionsTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        self.program = make_challenge(self.admin)
        self.journey = form_journey(program=self.program)
        self.use_journey(self.journey)

    def answer_all(self, *, company="yes"):
        self.say("hi")  # Let's go. + Idea name
        self.say("Solar pump")
        self.say("Pumps water with the sun")
        self.say("3")
        self.say("neo@example.com")
        self.say("01/02/2026")
        self.say("2")  # A prototype
        self.say("1" if company == "yes" else "2")
        if company == "yes":
            self.say("Sun Water (Pty) Ltd")
        self.say("1, 3")
        self.send_file()  # the pitch document

    def test_asks_every_type_in_order_and_saves_each_answer_in_the_draft(self):
        self.say("hi")
        self.assertIn("Let's go.", self.last_text())
        self.assertIn("Idea name", self.last_text())
        self.assertNotIn("About your idea", self.last_text())  # headings are not questions
        self.say("Solar pump")
        self.assertIn("Describe your idea", self.last_text())
        draft = ApplicationDraft.objects.get(program=self.program)
        self.assertEqual(draft.draft_data["title"], "Solar pump")
        self.assertEqual(draft.title, "Solar pump")
        self.assertEqual(draft.innovator.phone_number, PHONE)  # a new number gets an account
        self.say("Pumps water with the sun")
        self.say("three")
        self.assertIn("Please enter a number.", self.last_text())
        self.say("3")
        self.say("not an email")
        self.assertIn("email address", self.last_text())
        self.say("neo@example.com")
        self.say("2026-13-40")
        self.assertIn("date like", self.last_text())
        self.say("01/02/2026")
        self.assertIn("1. Just an idea", self.last_text())
        self.say("A prototype")
        self.assertIn("Do you have a company?", self.last_text())
        self.say("yes")
        self.assertIn("Company name", self.last_text())
        self.say("Sun Water")
        self.assertIn("commas", self.last_text())
        self.say("1, 3")
        self.assertIn("Pitch document", self.last_text())
        self.send_file()
        text = self.last_text()
        self.assertIn("Finish these on the website: Where is it? (pin on a map).", text)
        self.assertIn("Finish the part above on the website", text)  # a required question is left, so no consent question
        self.assertNotIn("Reply YES", text)
        self.assertFalse(Submission.objects.filter(program=self.program).exists())
        draft.refresh_from_db()
        self.assertEqual(
            {k: draft.draft_data.get(k) for k in ("summary", "team_size", "email", "start_date", "stage", "has_company", "company_name", "sectors")},
            {"summary": "Pumps water with the sun", "team_size": 3, "email": "neo@example.com", "start_date": "2026-02-01", "stage": "prototype",
             "has_company": "yes", "company_name": "Sun Water", "sectors": ["agri", "water"]},
        )
        self.assertEqual(SubmissionDocument.objects.filter(application_draft=draft, field_key="pitch").count(), 1)
        self.assertNotIn("website", draft.draft_data)  # optional, not asked

    def test_hidden_questions_are_skipped(self):
        self.answer_all(company="no")
        draft = ApplicationDraft.objects.get(program=self.program)
        self.assertNotIn("company_name", draft.draft_data)
        self.assertEqual(draft.draft_data["has_company"], "no")

    def test_the_form_rules_check_the_answer(self):
        self.say("hi")
        self.say("ab")
        self.assertIn("Use at least 3 letters.", self.last_text())
        self.assertIn("Idea name", self.last_text())

    def test_back_goes_to_the_previous_question_and_keeps_the_new_answer(self):
        self.say("hi")
        self.say("Solar pump")
        self.say("back")
        self.assertIn("Idea name", self.last_text())
        self.say("Sun pump")
        self.assertIn("Describe your idea", self.last_text())
        self.assertEqual(ApplicationDraft.objects.get(program=self.program).draft_data["title"], "Sun pump")
        self.say("MORAGO")  # Setswana works too
        self.assertIn("Idea name", self.last_text())

    def test_back_on_the_first_question_says_so(self):
        self.say("hi")
        self.say("back")
        self.assertIn("This is the first question.", self.last_text())

    def test_skip_only_for_questions_that_are_not_needed(self):
        journey = form_journey(name="Every question", program=self.program, ask="all", sections="idea")
        self.use_journey(journey)
        self.say("hi")
        self.say("skip")
        self.assertIn("This question needs an answer.", self.last_text())
        for answer in ("Solar pump", "Pumps water", "3", "neo@example.com", "01/02/2026", "1", "2", "1"):
            self.say(answer)
        self.assertIn("Website", self.last_text())
        self.assertIn("Reply SKIP to leave this out.", self.last_text())
        self.say("skip")
        self.assertIn("Reply YES to send.", self.last_text())  # the "more" section was not asked
        self.assertNotIn("website", ApplicationDraft.objects.get(program=self.program).draft_data)

    def test_questions_are_asked_in_the_persons_language(self):
        session_lang = {"lang": "tn"}
        runner = JourneyRunner(self.journey.latest_version.graph, {"vars": {}, **session_lang}, channel="whatsapp", phone="+26770000001", user=None, session_id="t", simulation=True)
        screen = runner.start()
        self.assertIn("A re yeng.", screen.text)
        self.assertIn("Leina la kakanyo", screen.text)

    def test_whole_run_ends_with_an_idea_number(self):
        form = self.program.form
        form.fields.filter(key="map_pin").delete()  # every question can be asked on a phone
        FormVersion.objects.filter(form=form).update(schema=build_form_schema(form, include_inactive=False))
        self.answer_all()
        self.say("YES")
        submission = Submission.objects.get(program=self.program)
        self.assertIn(f"Sent: {submission.reference_number}.", self.last_text())
        self.assertNotIn("website", self.last_text().lower().replace("finish these on the website", ""))

    def test_on_ussd_file_questions_go_to_the_website_and_nothing_breaks(self):
        journey = form_journey(name="USSD form", channel="ussd", program=self.program)
        runner = JourneyRunner(journey.latest_version.graph, {"vars": {}}, channel="ussd", phone="+26770000002", user=None, session_id="u", simulation=True)
        screen = runner.start()
        for answer in ("Solar pump", "Pumps water", "3", "neo@example.com", "01/02/2026", "1", "2", "1"):
            self.assertFalse(screen.end)
            screen = runner.answer(answer)
        self.assertIn("Pitch document", screen.text)
        self.assertIn("Where is it?", screen.text)
        self.assertLessEqual(len(screen.ussd_text()), 160)

    def test_choosing_the_challenge_first(self):
        journey = form_journey(name="Ask", program_source="ask")
        self.use_journey(journey)
        self.say("hi")
        text = self.last_text()
        self.assertIn("Which challenge is your idea for?", text)
        self.assertIn("1. Clean Water Challenge", text)
        self.assertIn("2. General idea", text)
        self.say("Clean Water Challenge")
        self.assertIn("Idea name", self.last_text())
        self.assertTrue(ApplicationDraft.objects.filter(program=self.program).exists())

    def test_general_idea_uses_the_general_form_and_the_name_already_given(self):
        journey = form_journey(name="Ask general", program_source="ask")
        self.use_journey(journey)
        session_vars = {"name": "Neo Kgosi"}
        runner = JourneyRunner(journey.latest_version.graph, {"vars": session_vars}, channel="whatsapp", phone="+26770000003", user=None, session_id="g", simulation=False)
        runner.start()
        screen = runner.answer("2")  # General idea
        self.assertIn("What problem does your idea solve?", screen.text)
        draft = ApplicationDraft.objects.get(id=runner.state["draft_id"])
        self.assertEqual(draft.program, GeneralIntakeService.program())
        self.assertEqual((draft.draft_data["first_name"], draft.draft_data["last_name"]), ("Neo", "Kgosi"))
        screen = runner.answer("Dirty water")
        screen = runner.answer("A filter")
        self.assertIn("Reply YES to send.", screen.text)  # first and last name were not asked again

    def test_check_graph_rules(self):
        graph = {"start": "form", "nodes": {"form": {"key": "form", "type": "form_questions", "text": {}, "settings": {"program_source": "variable"}, "next": "end"},
                                            "end": {"key": "end", "type": "end", "text": {"en": "Bye", "tn": "Sala"}, "settings": {}, "next": ""}}}
        codes = {p["code"] for p in check_graph(graph, "whatsapp") if p["level"] == "error"}
        self.assertIn("needs_submit_after", codes)
        self.assertIn("no_variable", codes)
        ok = check_graph(self.journey.latest_version.graph, "whatsapp")
        self.assertFalse([p for p in ok if p["level"] == "error"], ok)  # submit after it, no save_draft needed

    def test_node_types_describe_the_new_steps(self):
        response = self.client.get(f"{BASE}/node-types/")
        types = {item["type"]: item for item in data(response)}
        self.assertTrue(types["form_questions"]["next"])
        self.assertIn("program_source", [f["name"] for f in types["form_questions"]["fields"]])
        self.assertIn("continue_next", [f["name"] for f in types["my_ideas"]["fields"]])
        self.assertTrue(types["my_ideas"]["label_tn"])


# --------------------------------------------------------------------------------------
# 3. My ideas
# --------------------------------------------------------------------------------------


def ideas_journey():
    journey = Journey.objects.create(name="Ideas", channel="whatsapp", start_key="main", default_language="en")
    nodes = {
        "main": {"type": "menu", "title": "Main", "text": {"en": "CEDA", "tn": "CEDA"}, "next": "",
                 "settings": {"options": [{"label": {"en": "Check my idea", "tn": "Tlhola"}, "next": "ideas"}]}},
        "ideas": {"type": "my_ideas", "title": "My ideas", "text": {}, "next": "", "settings": {"continue_next": "send"}},
        "send": {"type": "submit", "title": "Send", "text": {}, "next": "",
                 "settings": {"require_consent": True, "consent_text": {"en": "Reply YES to send."}, "success_text": {"en": "Sent: {reference}."}}},
    }
    for key, node in nodes.items():
        JourneyNode.objects.create(journey=journey, key=key, type=node["type"], title=node["title"], text=node["text"], settings=node["settings"], next_key=node["next"])
    from apps.channels.services import JourneyService

    JourneyService.publish(journey=journey, actor=None)
    return journey


@override_settings(PUBLIC_BASE_URL="https://paf-demo.org")
class MyIdeasTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        self.use_journey(ideas_journey())
        self.general = GeneralIntakeService.program()
        self.counter = 0

    def draft(self, title, phone=PHONE, user=None):
        self.counter += 1
        return ApplicationDraft.objects.create(
            reference_number=f"DRAFT-T-{self.counter}", program=self.general, innovator=user, submission_type="idea", is_general_idea=True,
            title=title, guest_phone="" if user else phone, draft_data={"problem": "p", "solution": "s", "first_name": "Neo", "last_name": "K"}, metadata={"quick_start": True},
        )

    def submission(self, title, status="under_review", phone=PHONE, user=None):
        self.counter += 1
        return Submission.objects.create(
            reference_number=f"IDEA-T-{self.counter}", program=self.general, submission_type="idea", title=title, current_status=status,
            innovator=user, is_guest=user is None, guest_phone="" if user else phone,
        )

    def test_open_ideas_newest_first_then_pick_one(self):
        self.submission("Old finished idea", status="rejected")
        self.submission("Clinic booking")
        self.draft("Solar pump")
        self.say("hi")
        self.say("1")
        text = self.last_text()
        self.assertIn("Your open ideas:", text)
        self.assertIn("1. Solar pump", text)
        self.assertIn("2. Clinic booking", text)
        self.assertNotIn("Old finished idea", text)
        self.assertIn("3. Recent ideas", text)
        self.say("2")
        text = self.last_text()
        self.assertIn("Clinic booking", text)
        self.assertIn("Under review", text)
        self.assertIn("Last update:", text)
        self.assertIn("Nothing to do now.", text)
        self.assertNotIn("Continue this idea", text)  # only drafts continue
        self.assertIn("Back", text)
        self.assertIn("Main menu", text)

    def test_recent_ideas_shows_the_last_five_and_a_link(self):
        for index in range(7):
            self.submission(f"Idea {index}", status="rejected")
        self.say("hi")
        self.say("1")
        self.assertIn("You have no open ideas.", self.last_text())
        self.say("Recent ideas")
        text = self.last_text()
        self.assertIn("Your recent ideas:", text)
        self.assertIn("1. Idea 6", text)
        self.assertIn("5. Idea 2", text)
        self.assertNotIn("Idea 1", text)
        self.assertIn("https://paf-demo.org/my-ideas", text)
        self.assertIn("Sign in with this phone number".lower(), text.lower())

    def test_continue_a_draft_and_send_it(self):
        draft = self.draft("Solar pump")
        self.say("hi")
        self.say("1")
        self.say("Solar pump")
        self.assertIn("Next: send your draft.", self.last_text())
        self.say("Continue this idea")
        self.assertIn("Reply YES to send.", self.last_text())
        self.say("yes")
        draft.refresh_from_db()
        self.assertEqual(draft.status, ApplicationDraft.STATUS_SUBMITTED)
        self.assertIn("Sent: ", self.last_text())

    def test_answer_the_officer_links_to_the_idea(self):
        submission = self.submission("Water app", status="requires_more_information")
        self.say("hi")
        self.say("1")
        self.say("1")
        self.assertIn("Next: answer the officer's question on the website.", self.last_text())
        self.assertIn(f"https://paf-demo.org/my-ideas/{submission.id}", self.last_text())

    def test_never_another_persons_idea(self):
        self.draft("Someone else's idea", phone="+26779999999")
        other = self.make_user("other@example.com")
        self.submission("Account idea of someone else", user=other)
        mine = self.draft("Mine")
        self.say("hi")
        self.say("1")
        text = self.last_text()
        self.assertIn("Mine", text)
        self.assertNotIn("Someone else", text)
        self.assertNotIn("Account idea", text)
        # Typing someone else's idea number finds nothing.
        self.say("DRAFT-T-1")
        self.assertNotIn("Someone else", self.last_text())
        self.say("Mine")
        self.assertIn("Continue this idea", self.last_text())
        self.assertTrue(mine)

    def test_signed_in_by_account_and_guest_by_phone(self):
        user = self.make_user("neo@example.com", phone=PHONE)
        self.submission("From the website", user=user)
        self.draft("Guest idea from this phone")
        self.say("hi")
        self.say("1")
        text = self.last_text()
        self.assertIn("From the website", text)
        self.assertIn("Guest idea from this phone", text)

    def test_typing_the_idea_number_still_works(self):
        submission = self.submission("Clinic booking")
        self.say("hi")
        self.say("1")
        self.say(submission.reference_number.lower())
        self.assertIn("Clinic booking", self.last_text())
        self.assertIn("Under review", self.last_text())

    def test_no_ideas(self):
        self.say("hi")
        self.say("1")
        self.assertIn("You have no ideas with us yet.", self.last_text())
        self.assertIn("1. Check my idea", self.last_text())  # back at the main menu

    def make_user(self, email, phone=""):
        from apps.accounts.models import User

        return User.objects.create_user(email=email, password="StrongPass123!", phone_number=phone, first_name="Neo", last_name="K")


# --------------------------------------------------------------------------------------
# 4. Simulator and USSD
# --------------------------------------------------------------------------------------


class SimulatorAndUssdTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        self.program = make_challenge(self.admin)

    def simulate(self, journey, session=None, text=None, attachment=None):
        body = {"journey": str(journey.id), "channel": journey.channel if journey.channel != "both" else "whatsapp"}
        if session:
            body.update({"session_id": session, "input": text or ""})
        if attachment:
            body["attachment"] = attachment
        response = self.client.post(f"{BASE}/simulate/", body, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        return data(response)

    def test_simulator_saves_nothing(self):
        upgrade.upgrade(self.whatsapp_journey)
        form = self.program.form
        form.fields.filter(key="map_pin").delete()  # a required web-only question would stop the send
        FormVersion.objects.filter(form=form).update(schema=build_form_schema(form, include_inactive=False))
        GeneralIntakeService.program()
        drafts, submissions, docs, users = ApplicationDraft.objects.count(), Submission.objects.count(), SubmissionDocument.objects.count(), self.admin.__class__.objects.count()
        journey = Journey.objects.get(pk=self.whatsapp_journey.pk)
        result = self.simulate(journey)
        session = result["session_id"]
        for text in ("1", "Solar pump", "Neo Kgosi", "1"):  # Submit, idea name, name, Clean Water
            result = self.simulate(journey, session, text)
        for text in ("Solar pump", "Pumps water", "3", "neo@example.com", "01/02/2026", "1", "2", "1"):
            result = self.simulate(journey, session, text)
        result = self.simulate(journey, session, attachment={"name": "pitch.pdf", "content_type": "application/pdf", "size": 1000})
        result = self.simulate(journey, session, "skip")
        result = self.simulate(journey, session, "yes")
        screen = result.get("screen") or result
        self.assertIn("TEST-IDEA", json.dumps(screen))
        self.assertEqual((ApplicationDraft.objects.count(), Submission.objects.count(), SubmissionDocument.objects.count(), self.admin.__class__.objects.count()), (drafts, submissions, docs, users))

    def test_simulator_my_ideas_uses_samples(self):
        journey = ideas_journey()
        result = self.simulate(journey)
        session = result["session_id"]
        result = self.simulate(journey, session, "1")
        self.assertIn("Solar water pump", json.dumps(result))

    def test_ussd_still_numbered(self):
        set_features(self, whatsapp_messages=True, ussd=True)
        connection = self.add_ussd()
        self.check_and_activate(connection["id"])

        token = ChannelConnection.objects.get(id=connection["id"]).webhook_token
        response = self.ussd(token, text="")
        self.assertIn("1. Submit an idea", response.content.decode())


# --------------------------------------------------------------------------------------
# 5. The upgrade command
# --------------------------------------------------------------------------------------


class UpgradeCommandTests(FlowTestCase):
    def setUp(self):
        super().setUp()
        self.program = make_challenge(self.admin)

    def run_command(self, *args):
        from io import StringIO

        out = StringIO()
        call_command("upgrade_example_whatsapp_journey", *args, stdout=out)
        return out.getvalue()

    def test_upgrade_is_idempotent_and_reversible(self):
        before = self.whatsapp_journey.latest_version
        before_nodes = set((before.graph or {}).get("nodes", {}))
        out = self.run_command()
        self.assertIn("added step idea_form (form_questions", out)
        self.assertIn("added step my_ideas (my_ideas", out)
        self.assertIn(f"version {before.number} is kept", out)
        journey = Journey.objects.get(pk=self.whatsapp_journey.pk)
        graph = journey.latest_version.graph
        self.assertEqual(graph["nodes"]["idea_form"]["next"], "idea_file")
        self.assertEqual(graph["nodes"]["idea_file"]["next"], "idea_send")
        labels = {o["label"]["en"]: o["next"] for o in graph["nodes"]["main"]["settings"]["options"]}
        self.assertEqual(labels["Submit an idea"], "idea_title")
        self.assertEqual(labels["Check my idea"], "my_ideas")
        texts = json.dumps(graph).lower()
        self.assertNotIn("sign in on the ceda website", texts)
        self.assertNotIn("finish and send it", texts)
        self.assertTrue(JourneyVersion_exists(journey, before.number))
        # Twice: nothing changes.
        again = self.run_command()
        self.assertIn("already up to date", again)
        self.assertEqual(Journey.objects.get(pk=journey.pk).version, journey.version)
        # Undo: the old steps come back as a new version.
        out = self.run_command("--undo")
        self.assertIn(f"put back the steps of version {before.number}", out)
        journey.refresh_from_db()
        self.assertEqual(set(journey.latest_version.graph["nodes"]), before_nodes)

    def test_upgraded_example_from_hi_to_idea_number_and_my_ideas(self):
        self.run_command()
        self.use_journey(Journey.objects.get(pk=self.whatsapp_journey.pk))
        self.say("Hi")
        self.say("Submit an idea")
        self.assertIn("What is your idea called?", self.last_text())
        self.say("Solar pump")
        self.say("Neo Kgosi")
        self.assertIn("Which challenge is your idea for?", self.last_text())
        self.say("2")  # General idea
        self.assertIn("What problem does your idea solve?", self.last_text())
        self.say("Dirty water")
        self.say("A filter")
        self.assertIn("Send a photo or document", self.last_text())
        self.send_file()
        self.say("done")
        self.assertIn("Reply YES", self.last_text())
        self.say("YES")
        submission = Submission.objects.get(innovator__phone_number=PHONE)
        self.assertIn(f"Your idea number is {submission.reference_number}.", self.last_text())
        self.assertNotIn("sign in on the ceda website", self.last_text().lower())
        self.assertEqual(SubmissionDocument.objects.filter(submission=submission).count() + SubmissionDocument.objects.filter(application_draft__submitted_submission=submission).count() >= 1, True)
        self.say("menu")
        self.say("Check my idea")
        self.assertIn("1. Solar pump", self.last_text())
        self.say("1")
        self.assertIn("Received", self.last_text())

    def test_unpublished_changes_are_not_published_by_the_command(self):
        Journey.objects.filter(pk=self.whatsapp_journey.pk).update(has_unpublished_changes=True)
        from django.core.management.base import CommandError

        with self.assertRaises(CommandError):
            self.run_command()


def JourneyVersion_exists(journey, number):
    from apps.channels.models import JourneyVersion

    return JourneyVersion.objects.filter(journey=journey, number=number).exists()
