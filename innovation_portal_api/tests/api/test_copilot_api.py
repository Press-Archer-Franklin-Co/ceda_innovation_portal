"""AI Copilot Branch A: providers, keys in use, knowledge, language, documents, similar ideas, evaluator help.

Every SDK is replaced by a fake (FakeClaude, FakeOpenAI); no test reaches a real AI service.
"""

import json
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import anthropic
import httpx2
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings

from apps.assistant import knowledge, language
from apps.assistant.models import AssistantSettings, CachedAnswer, IdeaProfile, KnowledgeChunk, KnowledgeDocument, UsageRecord
from apps.assistant.privacy import is_sensitive
from apps.core.constants import RoleType
from apps.documents.models import DocumentCategory, SubmissionDocument
from apps.platform_config.crypto import encrypt_secrets
from apps.platform_config.models import IntegrationConnection
from apps.platform_config.testing import reset_platform_caches
from tests.api.test_assistant_api import (
    API_KEY,
    BASE,
    DRAFT_ANSWER,
    HELP_ANSWER,
    HINTS_ANSWER,
    AssistantTestCase,
    data,
    http_error,
    message,
)


def completion(payload: dict, *, model="gpt-5", refusal=None, finish="stop"):
    return SimpleNamespace(
        id="chatcmpl-test",
        model=model,
        choices=[SimpleNamespace(message=SimpleNamespace(content=json.dumps(payload), refusal=refusal), finish_reason=finish)],
        usage=SimpleNamespace(prompt_tokens=1200, completion_tokens=300, prompt_tokens_details=SimpleNamespace(cached_tokens=200)),
    )


class FakeOpenAI:
    """Stands in for openai.OpenAI. Records every request."""

    def __init__(self, *answers):
        self.answers = list(answers)
        self.calls = []
        self.base_urls = []
        outer = self

        class _Completions:
            def create(self, **kwargs):
                outer.calls.append(kwargs)
                answer = outer.answers.pop(0) if len(outer.answers) > 1 else outer.answers[0]
                if isinstance(answer, Exception):
                    raise answer
                return answer(kwargs) if callable(answer) else answer

        self.chat = SimpleNamespace(completions=_Completions())

    def __call__(self, *, api_key, timeout, base_url=""):
        assert api_key == API_KEY
        self.base_urls.append(base_url)
        return self


class CopilotTestCase(AssistantTestCase):
    def fake_openai(self, *answers):
        fake = FakeOpenAI(*answers)
        patcher = patch("apps.assistant.providers.openai.make_sdk_client", fake)
        patcher.start()
        self.addCleanup(patcher.stop)
        return fake

    def add_connection(self, *, provider, model, environment="test", name=None, base_url=""):
        config = {"model": model, "environment": environment, "timeout_seconds": 30}
        if base_url:
            config["base_url"] = base_url
        connection = IntegrationConnection.objects.create(
            kind="ai", provider=provider, name=name or f"{provider} {environment}", config=config,
            secrets_encrypted=encrypt_secrets({"api_key": API_KEY}), status="active", is_active=True,
        )
        reset_platform_caches(self)
        return connection

    def settings_row(self, **values):
        row = AssistantSettings.load()
        for key, value in values.items():
            setattr(row, key, value)
        row.save()
        return row


# -- A1 any provider -----------------------------------------------------------------------------------


class ProviderTests(CopilotTestCase):
    def test_changing_the_service_for_a_feature_is_a_setting_only(self):
        claude = self.fake(message(DRAFT_ANSWER))
        gpt = self.fake_openai(completion(DRAFT_ANSWER))
        self.switch_on()
        openai_connection = self.add_connection(provider="openai", model="gpt-5")
        self.as_user(self.innovator)
        draft = self.draft(self.innovator)
        self.assertTrue(data(self.draft_check(draft))["available"])
        self.assertEqual((len(claude.calls), len(gpt.calls)), (1, 0))

        self.settings_row(routes={"draft_check": {"provider": "openai", "connection": str(openai_connection.pk), "model": "gpt-5-mini"}})
        result = data(self.draft_check(draft))
        self.assertTrue(result["available"])
        self.assertEqual((len(claude.calls), len(gpt.calls)), (1, 1))
        request = gpt.calls[-1]
        self.assertEqual(request["model"], "gpt-5-mini")
        self.assertEqual(request["response_format"]["type"], "json_schema")
        self.assertTrue(request["response_format"]["json_schema"]["strict"])
        self.assertEqual(request["messages"][0]["role"], "system")
        record = UsageRecord.objects.filter(provider="openai").get()
        self.assertEqual((record.input_tokens, record.cache_read_tokens, record.output_tokens, record.environment), (1000, 200, 300, "test"))

    def test_openai_compatible_uses_its_address_and_model_name(self):
        gpt = self.fake_openai(completion(HELP_ANSWER, model="llama-botswana"))
        self.switch_on(guests=True)
        IntegrationConnection.objects.filter(kind="ai").update(is_active=False)
        self.add_connection(provider="openai_compatible", model="llama-botswana", base_url="https://ai.example.co.bw/v1")
        result = data(self.client.post(f"{BASE}/help/", {"question": "How do I start an idea?"}, format="json"))
        self.assertTrue(result["available"], result)
        self.assertEqual(gpt.base_urls[-1], "https://ai.example.co.bw/v1")
        self.assertIn("max_tokens", gpt.calls[-1])
        record = UsageRecord.objects.get(provider="openai_compatible")
        self.assertEqual(record.cost_usd, Decimal("0"))  # no price for this model: tokens kept, cost 0

    def test_test_and_live_keys_switch_in_the_console(self):
        claude = self.fake(message(HELP_ANSWER))
        self.switch_on(guests=True)  # a test-key Claude connection
        live = self.add_connection(provider="anthropic", model="claude-sonnet-5-5", environment="live", name="Claude live")
        self.client.post(f"{BASE}/help/", {"question": "How do I start?"}, format="json")
        self.assertEqual(claude.calls[-1]["model"], "claude-opus-5-5")
        self.as_user(self.admin)
        self.assertEqual(self.client.patch(f"{BASE}/admin/settings/", {"keys_in_use": "live"}, format="json").status_code, 200)
        self.client.force_authenticate(None)
        self.client.post(f"{BASE}/help/", {"question": "How do I start?"}, format="json")
        self.assertEqual(claude.calls[-1]["model"], "claude-sonnet-5-5")
        self.assertEqual(UsageRecord.objects.filter(ok=True).latest("created_at").connection_id, live.pk)
        # No live key at all: hidden, never falls back to a test key.
        IntegrationConnection.objects.filter(pk=live.pk).update(is_active=False)
        self.assertEqual(data(self.client.post(f"{BASE}/help/", {"question": "How do I start?"}, format="json")), {"available": False})

    def test_several_ai_connections_can_be_active(self):
        self.switch_on()
        self.add_connection(provider="openai", model="gpt-5")
        self.add_connection(provider="anthropic", model="claude-haiku-5-5", environment="live")
        self.assertEqual(IntegrationConnection.objects.filter(kind="ai", is_active=True).count(), 3)

    def test_each_failure_reason_hides_the_feature_and_is_recorded(self):
        request = httpx2.Request("POST", "https://api.anthropic.com/v1/messages")
        cases = [
            (http_error(anthropic.AuthenticationError, 401), "key_refused"),
            (anthropic.APITimeoutError(request=request), "timeout"),
            (http_error(anthropic.RateLimitError, 429), "busy"),
            (anthropic.APIConnectionError(request=request), "unreachable"),
            (message({}, stop_reason="refusal"), "refused"),
            (SimpleNamespace(content=[SimpleNamespace(type="text", text="not json")], usage=None, stop_reason="end_turn", model="claude-opus-5-5"), "bad_output"),
        ]
        self.switch_on()
        self.as_user(self.innovator)
        for answer, reason in cases:
            with self.subTest(reason=reason):
                self.fake(answer)
                with patch("apps.assistant.providers.anthropic.time.sleep"):
                    response = self.draft_check(self.draft(self.innovator))
                self.assertEqual(response.status_code, 200)
                self.assertEqual(data(response), {"available": False})
                latest = UsageRecord.objects.latest("created_at")
                self.assertEqual(latest.outcome, reason)
                self.assertNotIn(API_KEY, latest.error_detail)

    def test_no_connection_hides_and_is_recorded(self):
        self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        IntegrationConnection.objects.filter(kind="ai").update(is_active=False)
        self.as_user(self.innovator)
        self.assertEqual(data(self.draft_check(self.draft(self.innovator))), {"available": False})
        self.assertEqual(UsageRecord.objects.latest("created_at").outcome, "no_connection")

    def test_usage_per_feature_and_provider(self):
        self.fake(message(DRAFT_ANSWER))
        self.fake_openai(completion(HINTS_ANSWER))
        self.switch_on()
        gpt = self.add_connection(provider="openai", model="gpt-5")
        self.settings_row(routes={"hints": {"connection": str(gpt.pk)}})
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator))
        self.as_user(self.officer)
        self.client.get(f"{BASE}/submissions/{self.idea('Solar fridge', owner=self.innovator).pk}/hints/")
        self.as_user(self.admin)
        rows = {(row["feature"], row["provider"]): row for row in data(self.client.get(f"{BASE}/admin/usage/"))["rows"]}
        self.assertEqual(rows[("draft_check", "anthropic")]["calls"], 1)
        self.assertEqual(rows[("hints", "openai")]["calls"], 1)
        # gpt-5: 1000 x $1.25 + 200 x $0.125 + 300 x $10 per million tokens.
        self.assertEqual(rows[("hints", "openai")]["cost_usd"], "0.00")
        self.assertEqual(UsageRecord.objects.get(provider="openai").cost_usd, Decimal("0.004275"))

    def test_keys_are_never_returned_or_logged(self):
        self.switch_on()
        self.as_user(self.admin)
        overview = self.client.get(f"{BASE}/admin/overview/").content.decode()
        self.assertNotIn(API_KEY, overview)
        self.assertIn(API_KEY[-4:], overview)  # only the last 4 characters, like "…QQ77"
        listing = self.client.get("/api/platform/integrations/?kind=ai").content.decode()
        self.assertNotIn(API_KEY, listing)


# -- A2 language -----------------------------------------------------------------------------------------


class LanguageTests(CopilotTestCase):
    def test_answers_come_back_in_the_requested_language(self):
        fake = self.fake(message({**DRAFT_ANSWER, "language": "tn"}))
        self.switch_on()
        self.as_user(self.innovator)
        result = data(self.draft_check(self.draft(self.innovator), lang="tn"))
        self.assertEqual(result["language"], "tn")
        self.assertIn("Write every answer in Setswana", "\n".join(block["text"] for block in fake.last["system"]))
        self.assertIn("Dikakantsho fela", result["note"])

    def test_setswana_text_is_sent_as_it_is_and_detected(self):
        fake = self.fake(message(DRAFT_ANSWER))
        self.switch_on()
        self.as_user(self.innovator)
        self.innovator.preferred_language = "en"
        self.innovator.save()
        setswana = "Re batla go dira madi ka go rekisa mašwi a a tsididi kwa batho ba motse wa rona gore ba nne le dijo"
        self.draft_check(self.draft(self.innovator, solution=setswana))
        self.assertIn(setswana, fake.last["messages"][0]["content"])
        self.assertEqual(language.detect(setswana), "tn")
        self.assertEqual(language.detect("We sell cold milk to the people of our village so they have food"), "en")

    def test_officer_can_read_a_summary_in_either_language(self):
        fake = self.fake(message(HINTS_ANSWER), message({**HINTS_ANSWER, "language": "tn", "summary": "Kakaretso ka Setswana."}))
        self.switch_on()
        submission = self.idea("Setlhatswa sa mašwi", owner=self.innovator, answer="Re rekisa mašwi")
        self.as_user(self.officer)
        english = data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/?lang=en"))
        setswana = data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/?lang=tn"))
        self.assertEqual((english["language"], setswana["language"]), ("en", "tn"))
        self.assertEqual(setswana["summary"], "Kakaretso ka Setswana.")
        self.assertEqual(len(fake.calls), 2)
        self.assertEqual(CachedAnswer.objects.filter(submission=submission).count(), 2)


# -- A3 knowledge base -----------------------------------------------------------------------------------


@override_settings(CELERY_TASK_ALWAYS_EAGER=True)
class KnowledgeTests(CopilotTestCase):
    def upload(self, name="policy.txt", text="Innovators must show how the idea creates jobs in Botswana.", **fields):
        self.as_user(self.admin)
        payload = {"file": SimpleUploadedFile(name, text.encode(), content_type="text/plain"), "title": "Jobs policy", "kind": "policy", "audience": "everyone", "language": "en", **fields}
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post(f"{BASE}/admin/knowledge-documents/", payload, format="multipart")
        self.assertEqual(response.status_code, 201, response.content)
        return KnowledgeDocument.objects.get(pk=data(response)["id"])

    def test_upload_reads_the_text_into_chunks_with_search_words(self):
        self.fake(message({"parts": [{"number": 1, "words": ["jobs", "ditiro"]}]}))
        self.switch_on()
        document = self.upload()
        self.assertEqual(document.status, "ready")
        chunk = document.chunks.get()
        self.assertEqual(chunk.search_terms, ["jobs", "ditiro"])
        listing = data(self.client.get(f"{BASE}/admin/knowledge-documents/"))
        self.assertEqual((listing[0]["status"], listing[0]["chunk_count"]), ("ready", 1))

    def test_a_file_that_cannot_be_read_fails_in_plain_words(self):
        self.switch_on()
        IntegrationConnection.objects.filter(kind="ai").update(is_active=False)
        with patch("apps.assistant.knowledge.read_file", return_value=knowledge.ReadText(error="This PDF has no text we can read. It may be a scan.")):
            document = self.upload(name="scan.txt", text="x")
        self.assertEqual(document.status, "failed")
        self.assertEqual(document.error, "This PDF has no text we can read. It may be a scan.")
        self.assertEqual(self.client.post(f"{BASE}/admin/knowledge-documents/{document.pk}/reread/").status_code, 200)

    def test_knowledge_reaches_the_question_for_its_audience_only(self):
        fake = self.fake(message({"parts": []}), message(DRAFT_ANSWER))
        self.switch_on()
        self.upload(title="Public policy", text="Everyone: ideas must name their first customers.", audience="everyone")
        self.upload(title="Officer notes", text="Officers only: check for copied business plans.", audience="officers")
        self.as_user(self.innovator)
        self.draft_check(self.draft(self.innovator))
        system = "\n".join(block["text"] for block in fake.last["system"])
        self.assertIn("ideas must name their first customers", system)
        self.assertNotIn("copied business plans", system)

    def test_large_knowledge_sends_the_best_chunks_with_sources(self):
        self.switch_on()
        document = KnowledgeDocument.objects.create(title="Big manual", asset=self.media_asset(), kind="user_manual", status="ready", text="x")
        filler = "Unrelated policy text about something else entirely. " * 30
        for order in range(5):
            KnowledgeChunk.objects.create(document=document, order=order, text=filler)
        KnowledgeChunk.objects.create(document=document, order=5, text="To change your idea after sending it, open My ideas and press Edit.", search_text="change edit idea fetola")
        from django.contrib.postgres.search import SearchVector

        KnowledgeChunk.objects.update(search_vector=SearchVector("text", "search_text", config="simple"))
        with patch.object(knowledge, "ALL_KNOWLEDGE_TOKENS", 0):
            found = knowledge.build(audience="innovators", language="en", question="How do I change my idea?")
        self.assertIn("press Edit", found.question_part)
        self.assertNotIn("press Edit", found.stable)
        self.assertIn({"type": "knowledge", "id": str(document.pk), "title": "Big manual", "chunk": 6}, found.sources)

    def test_admin_endpoints_need_assistant_manage(self):
        self.as_user(self.officer)
        self.assertEqual(self.client.get(f"{BASE}/admin/knowledge-documents/").status_code, 403)

    def media_asset(self):
        from apps.media_library.models import MediaAsset

        return MediaAsset.objects.create(kind="document", mime_type="text/plain", file="media/x.txt")


# -- A4 idea coach with files and document review --------------------------------------------------------


class DocumentTests(CopilotTestCase):
    def attach(self, *, draft=None, submission=None, name="plan.txt", text="Page one says each pack costs P4.20 to make."):
        category = DocumentCategory.objects.first() or DocumentCategory.objects.create(name="Supporting", code="supporting")
        return SubmissionDocument.objects.create(
            application_draft=draft, submission=submission, category=category, file=SimpleUploadedFile(name, text.encode()),
            original_filename=name, mime_type="text/plain", size_bytes=len(text), sha256="abc",
        )

    def test_draft_check_reads_the_files_on_the_draft(self):
        fake = self.fake(lambda kwargs: message({**DRAFT_ANSWER, "files": [{"document_id": str(self.doc.pk), "covers": "Costs.", "key_points": [{"text": "P4.20 a pack", "page": 1}], "missing": ["Selling price"]}]}))
        self.switch_on()
        self.as_user(self.innovator)
        draft = self.draft(self.innovator)
        self.doc = self.attach(draft=draft)
        result = data(self.draft_check(draft))
        self.assertIn("each pack costs P4.20", fake.last["messages"][0]["content"])
        self.assertEqual(result["files"][0]["key_points"], [{"text": "P4.20 a pack", "page": 1}])

    def test_document_review_for_owner_and_allowed_staff_only(self):
        self.fake(message({"language": "en", "file_language": "en", "summary": "A cost sheet.", "key_points": [{"text": "P4.20 a pack", "page": 1}], "missing": ["Selling price"]}))
        self.switch_on()
        submission = self.idea("Snacks", owner=self.innovator)
        document = self.attach(submission=submission)
        url = f"{BASE}/documents/{document.pk}/review/"
        self.as_user(self.innovator)
        first = data(self.client.post(url, {}, format="json"))
        self.assertEqual((first["summary"], first["key_points"][0]["page"], first["cached"]), ("A cost sheet.", 1, False))
        self.as_user(self.officer)
        self.assertTrue(data(self.client.post(url, {}, format="json"))["cached"])
        self.as_user(self.other_innovator)
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 404)
        judge = self.person("c3-judge-doc@example.com", RoleType.JUDGE)
        self.as_user(judge)  # not assigned to this idea
        self.assertEqual(self.client.post(url, {}, format="json").status_code, 404)

    def test_names_are_sent_only_when_the_admin_allows(self):
        fake = self.fake(message(HINTS_ANSWER))
        self.switch_on()
        submission = self.idea("Snacks", owner=self.innovator)
        self.as_user(self.officer)
        self.client.get(f"{BASE}/submissions/{submission.pk}/hints/")
        self.assertNotIn("Neo Molefe", fake.last["messages"][0]["content"])
        self.settings_row(send_names=True)
        self.client.get(f"{BASE}/submissions/{submission.pk}/hints/?refresh=true")
        self.assertIn("Neo Molefe", fake.last["messages"][0]["content"])

    def test_sensitive_fields_are_stripped(self):
        for key, field_type in (("omang", "text"), ("bank_account", "text"), ("contact_number", "text"), ("anything", "phone"), ("anything", "email")):
            self.assertTrue(is_sensitive(key=key, field_type=field_type), key)
        self.assertTrue(is_sensitive(key="notes", field_type="textarea", validation_rules={"sensitive": True}))
        self.assertFalse(is_sensitive(key="solution", field_type="textarea"))


# -- A5 similar ideas across languages, officers only ----------------------------------------------------


class RelatedTests(CopilotTestCase):
    def test_innovators_and_judges_never_get_similar_ideas(self):
        self.switch_on()
        submission = self.idea("Mine", owner=self.innovator)
        self.as_user(self.innovator)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/related/").status_code, 403)
        judge = self.person("c3-judge-rel@example.com", RoleType.JUDGE)
        self.as_user(judge)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/related/").status_code, 403)

    def test_a_setswana_idea_matches_an_english_one_through_profiles(self):
        english = self.idea("Sorghum flour mill", owner=self.innovator, answer="We mill sorghum grain into flour for schools.")
        setswana = self.idea("Temo ya mabele", owner=self.other_innovator, answer="Re lema mabele mme re rekisa thoro.")
        IdeaProfile.objects.create(submission=english, summary_en="A mill that turns sorghum grain into flour.", inputs=["sorghum grain"], outputs=["sorghum flour"], search_text="sorghum grain flour mill schools", fingerprint="x")
        IdeaProfile.objects.create(submission=setswana, summary_en="Farmers grow sorghum and sell the grain.", inputs=["land"], outputs=["sorghum grain"], keywords_tn=["mabele"], search_text="farmers grow sorghum grain mabele", source_language="tn", fingerprint="x")

        def answer(kwargs):
            props = kwargs["output_config"]["format"]["schema"]["properties"]
            if "items" in props:
                return message({"language": "en", "items": [{"id": str(setswana.pk), "relation": "complementary", "why": "One grows the grain the other mills."}]})
            return message({"summary_en": "A mill that turns sorghum grain into flour.", "keywords_en": [], "keywords_tn": [], "inputs": ["sorghum grain"], "outputs": ["sorghum flour"], "serves": [], "source_language": "en"})

        fake = self.fake(answer)
        self.switch_on()
        self.as_user(self.officer)
        result = data(self.client.get(f"{BASE}/submissions/{english.pk}/related/"))
        self.assertEqual([item["id"] for item in result["complementary"]], [str(setswana.pk)])
        self.assertIn(f"### Idea {setswana.pk}", fake.last["messages"][0]["content"])
        self.assertIn("Farmers grow sorghum", fake.last["messages"][0]["content"])

    def test_profiles_are_built_when_an_idea_is_sent(self):
        self.fake(message({"summary_en": "Solar fridge.", "keywords_en": ["fridge"], "keywords_tn": ["setsidifatsi"], "inputs": ["solar panels"], "outputs": ["cold milk"], "serves": ["farmers"], "source_language": "en"}))
        self.switch_on()
        with self.settings(CELERY_TASK_ALWAYS_EAGER=True), self.captureOnCommitCallbacks(execute=True):
            submission = self.idea("Solar fridge", owner=self.innovator, answer="A solar fridge.")
        profile = IdeaProfile.objects.get(submission=submission)
        self.assertEqual((profile.keywords_tn, profile.outputs), (["setsidifatsi"], ["cold milk"]))


# -- A6 evaluator help -----------------------------------------------------------------------------------


class EvaluatorTests(CopilotTestCase):
    def test_summary_has_files_and_criteria_points_and_never_a_score(self):
        fake = self.fake(message(HINTS_ANSWER))
        self.switch_on()
        submission = self.idea("Snacks", owner=self.innovator, answer="Mopane snacks")
        self.as_user(self.officer)
        result = data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/"))
        self.assertEqual(result["from_files"][0], {"file": "Business plan.pdf", "page": 3, "fact": "Each pack costs P4.20 to make."})
        self.assertEqual(result["not_in_files"], ["No proof of a place to work."])
        self.assertEqual(result["criteria_points"][0]["criterion"], "Value to Botswana")
        system = "\n".join(block["text"] for block in fake.last["system"])
        self.assertIn("Never give a score", system)
        self.assertIn("never score, rate, rank, approve or reject", system)

    def test_a_reply_containing_a_score_is_dropped(self):
        self.fake(message({**HINTS_ANSWER, "summary": "Strong idea. I would score it 8/10."}))
        self.switch_on()
        submission = self.idea("Snacks", owner=self.innovator)
        self.as_user(self.officer)
        self.assertEqual(data(self.client.get(f"{BASE}/submissions/{submission.pk}/hints/")), {"available": False})
        self.assertEqual(UsageRecord.objects.latest("created_at").outcome, "scored")
        self.assertFalse(CachedAnswer.objects.filter(submission=submission).exists())

    def test_judges_see_hints_only_for_entries_assigned_to_them(self):
        from apps.assignments.models import Assignment

        self.fake(message(HINTS_ANSWER))
        self.switch_on()
        judge = self.person("c3-judge-hints@example.com", RoleType.JUDGE)
        mine = self.idea("Assigned", owner=self.innovator)
        other = self.idea("Not assigned", owner=self.other_innovator)
        Assignment.objects.create(submission=mine, assignee=judge, role_type="judge")
        self.as_user(judge)
        self.assertTrue(data(self.client.get(f"{BASE}/submissions/{mine.pk}/hints/"))["available"])
        self.assertEqual(self.client.get(f"{BASE}/submissions/{other.pk}/hints/").status_code, 404)


# -- A7 status ---------------------------------------------------------------------------------------------


class StatusTests(CopilotTestCase):
    def test_status_flags_per_person_and_public_config(self):
        self.switch_on(guests=True, feature_guide=True)
        guest = data(self.client.get(f"{BASE}/status/"))
        self.assertTrue(guest["features"]["guide"])
        self.assertFalse(guest["features"]["draft_check"])
        self.assertFalse(guest["features"]["hints"])
        self.as_user(self.innovator)
        innovator = data(self.client.get(f"{BASE}/status/?lang=tn"))
        self.assertTrue(innovator["features"]["draft_check"])
        self.assertFalse(innovator["features"]["related"])
        self.assertEqual(innovator["language"], "tn")
        self.assertNotIn("setup", innovator)
        public = data(self.client.get("/api/platform/public-config/"))["assistant"]
        self.assertTrue(public["guide_for_guests"])
        self.assertTrue(public["draft_check"])

    def test_admins_see_the_setup_state(self):
        self.as_user(self.admin)
        self.assertEqual(data(self.client.get(f"{BASE}/status/"))["setup"]["state"], "needs_setup")
        self.switch_on()
        self.assertEqual(data(self.client.get(f"{BASE}/status/"))["setup"]["state"], "ready")

