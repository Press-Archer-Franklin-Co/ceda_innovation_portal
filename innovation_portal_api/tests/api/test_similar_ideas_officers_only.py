"""Only officers see similar ideas (23 Nov, Nshathisi's data protection rule).

An innovator is never told that their idea is like someone else's: no website search, no public switch,
and the innovator-facing AI is told never to compare or reveal other people's ideas.
"""

from apps.assistant import prompts
from apps.assistant.guide import GUIDE_INSTRUCTIONS
from apps.audit.models import AuthorizationRefusal
from apps.channels import ai_guidance
from apps.platform_config.models import FeatureFlag
from apps.platform_config.selectors import FeatureFlagSelector
from tests.api.test_assistant_api import BASE, DRAFT_ANSWER, data, message
from tests.api.test_copilot_api import CopilotTestCase


def texts(value) -> str:
    """Every piece of text in a request, as plain strings (str() of a dict would escape the apostrophes)."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        return "\n".join(texts(item) for item in value.values())
    if isinstance(value, (list, tuple)):
        return "\n".join(texts(item) for item in value)
    return texts(getattr(value, "text", "")) if hasattr(value, "text") else ""


class InnovatorSideTests(CopilotTestCase):
    def test_innovator_search_is_gone(self):
        self.as_user(self.innovator)
        self.assertEqual(self.client.post("/api/ideas/similar/", {"text": "solar milk cooling"}, format="json").status_code, 404)

    def test_public_config_has_no_similar_ideas_switch(self):
        self.assertFalse(FeatureFlag.objects.filter(key="similar_ideas").exists())
        self.assertNotIn("similar_ideas", FeatureFlagSelector.public_config()["features"])
        body = self.client.get("/api/platform/public-config/").content.decode()
        self.assertNotIn("similar_ideas", body)

    def test_every_innovator_prompt_says_never_compare(self):
        for instructions in (prompts.DRAFT_CHECK_INSTRUCTIONS, prompts.DOC_REVIEW_INSTRUCTIONS, prompts.HELP_INSTRUCTIONS, prompts.WEB_CHAT_INSTRUCTIONS, GUIDE_INSTRUCTIONS):
            self.assertIn(prompts.OWN_IDEA_ONLY, instructions)
        for instructions in (ai_guidance.SUGGEST_INSTRUCTIONS, ai_guidance.HELP_INSTRUCTIONS):
            parts = ai_guidance._parts("en", instructions)
            self.assertIn(prompts.OWN_IDEA_ONLY, "\n".join(part.text for part in parts))

    def test_draft_check_context_holds_no_other_submission(self):
        self.switch_on()
        fake = self.fake(message(DRAFT_ANSWER))
        self.idea("Zebra hide tannery in Maun", owner=self.other_innovator, answer="Tanning hides with bark from the Okavango.")
        draft = self.draft(self.innovator, solution="A cold room for tomatoes in Tlokweng.")
        self.as_user(self.innovator)
        self.assertEqual(self.draft_check(draft).status_code, 200)
        sent = texts(fake.last)
        self.assertIn("cold room for tomatoes", sent)
        self.assertIn(prompts.OWN_IDEA_ONLY, sent)
        for other in ("Zebra hide tannery", "Okavango"):
            self.assertNotIn(other, sent)


class OfficerToolTests(CopilotTestCase):
    def test_officer_tool_still_works_and_refuses_an_innovator(self):
        self.switch_on()
        submission = self.idea("Sorghum mill", owner=self.innovator)
        self.as_user(self.officer)
        response = self.client.get(f"{BASE}/submissions/{submission.pk}/related/")
        self.assertEqual(response.status_code, 200, response.content)
        self.assertIn("similar", data(response))
        self.as_user(self.innovator)
        self.assertEqual(self.client.get(f"{BASE}/submissions/{submission.pk}/related/").status_code, 403)
        self.assertTrue(AuthorizationRefusal.objects.filter(user=self.innovator, status_code=403, route_pattern__contains="related").exists())
