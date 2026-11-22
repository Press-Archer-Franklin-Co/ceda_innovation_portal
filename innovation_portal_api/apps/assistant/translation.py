"""Setswana suggestions for forms through the AI Copilot (B3).

Used by apps.programs.form_builder.get_translation_provider() when no other translation provider is
configured and the `translate` feature can answer. Suggestions only, marked for review; nothing is
saved until the person saves.
"""

from __future__ import annotations

from apps.assistant import gateway, prompts
from apps.assistant.models import Feature
from apps.assistant.providers import AssistantUnavailable

LANGUAGE_NAMES = {"tn": "Setswana", "en": "English"}

TRANSLATE_INSTRUCTIONS = """Task: suggest a translation for each numbered piece of text from a CEDA application form.
Write plain everyday {target} that people in Botswana use, short like the original. Keep {{placeholders}}, numbers and names as they are.
Return one item per number, in the same order. These are suggestions; a person checks and saves them."""

TRANSLATE_SCHEMA = prompts._obj({"items": prompts._list(prompts._obj({"number": {"type": "integer"}, "text": prompts.TEXT}))})


def available() -> bool:
    return gateway.unavailable_reason(Feature.TRANSLATE) == ""


class AIFormTranslator:
    """Same interface as other translation providers: translate(texts, source=, target=) -> list[str]."""

    def __init__(self, user=None):
        self.user = user

    def translate(self, texts: list[str], *, source: str = "en", target: str = "tn") -> list[str]:
        from apps.programs.form_builder import TranslationProviderNotConfigured

        if not texts:
            return []
        numbered = "\n".join(f"{index}. {text}" for index, text in enumerate(texts, start=1))
        try:
            result = gateway.ask(
                Feature.TRANSLATE,
                user=self.user,
                system_parts=[prompts.part(TRANSLATE_INSTRUCTIONS.format(target=LANGUAGE_NAMES.get(target, target)), target if target in ("en", "tn") else "en")],
                messages=[{"role": "user", "content": f"From {LANGUAGE_NAMES.get(source, source)}:\n{numbered}"}],
                json_schema=TRANSLATE_SCHEMA,
                language=target,
                effort="low",
                max_tokens=8000,
                target="form_translation",
            )
        except AssistantUnavailable:
            raise TranslationProviderNotConfigured from None
        by_number = {item.get("number"): str(item.get("text") or "").strip() for item in (result.data or {}).get("items") or [] if isinstance(item, dict)}
        return [by_number.get(index, "") for index in range(1, len(texts) + 1)]
