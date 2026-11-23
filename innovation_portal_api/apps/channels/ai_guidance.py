"""AI guidance in WhatsApp journeys: one short suggestion, document notes and help.

Off by default: a step only uses it when staff turn on its ``ai_guidance`` setting. Every call
goes through the AI helper's gateway (``apps.assistant.gateway``), so its switches, monthly limit,
keys and usage records apply. When the AI is off, not set up or fails, the journey carries on
exactly as without it, and the reason is logged (never the person's text). USSD never uses it.
"""

from __future__ import annotations

import logging

from apps.channels.actions import pick

logger = logging.getLogger("apps.channels.whatsapp")

HELP_WORDS = {"help", "thusa", "thuso"}
LONG_TEXT_TYPES = {"textarea"}
MAX_NOTES = 3

# TODO tn-review: every Setswana text below.
AI_TEXT = {
    "add_more": {"en": "Add more", "tn": "Tsenya go feta"},
    "keep": {"en": "Keep my answer", "tn": "Boloka karabo ya me"},
    "type_more": {"en": "Type what you want to add.", "tn": "Kwala se o batlang go se oketsa."},
    "reading": {"en": "Reading your document...", "tn": "Re bala tokomane ya gago..."},
    "notes_title": {"en": "Notes on {name}:", "tn": "Dintlha ka {name}:"},
    "label": {"en": "Suggestion from the AI helper", "tn": "Kakantsho go tswa mo mothusing wa AI"},
}

SUGGEST_INSTRUCTIONS = """Someone is answering a question about their idea on WhatsApp.
If one short addition would clearly make their answer more useful to CEDA, give it as one suggestion of at most 20 words, starting with "You could add". Never rewrite or judge their answer.
If the answer is already clear enough, set worth_saying to false and leave suggestion empty."""
SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {"worth_saying": {"type": "boolean"}, "suggestion": {"type": "string"}},
    "required": ["worth_saying", "suggestion"],
    "additionalProperties": False,
}
HELP_INSTRUCTIONS = """Someone on WhatsApp asked for help with one step of a CEDA journey. Answer in at most 50 words, in plain words, about that step only. Do not ask for personal details. If you do not know, say they can choose Talk to us."""
HELP_SCHEMA = {"type": "object", "properties": {"answer": {"type": "string"}}, "required": ["answer"], "additionalProperties": False}


def text(key: str, lang: str) -> str:
    return pick(AI_TEXT[key], lang)


def _skip(feature: str, reason: str, node_key: str) -> None:
    logger.info("whatsapp ai_guidance feature=%s node=%s outcome=skipped reason=%s", feature, node_key, reason)


def _ready(feature: str, node_key: str) -> bool:
    from apps.assistant.gateway import unavailable_reason

    reason = unavailable_reason(feature)
    if reason:
        _skip(feature, reason, node_key)
        return False
    return True


def _parts(lang: str, instructions: str, question: str = ""):
    from apps.assistant import knowledge, prompts
    from apps.assistant.models import Audience

    found = knowledge.build(audience=Audience.INNOVATORS, language=lang, question=question, include_manual=False)
    return found.parts(prompts.BASE_PROMPT) + [prompts.part(instructions, lang)]


def suggestion(*, question: str, answer: str, lang: str, user, node_key: str, target: str = "") -> str:
    """One short suggestion for a long answer, or "" (AI off, not needed, or failed)."""
    from apps.assistant.gateway import ask
    from apps.assistant.models import Feature

    if not _ready(Feature.DRAFT_CHECK, node_key):
        return ""
    try:
        result = ask(
            Feature.DRAFT_CHECK, user=user, system_parts=_parts(lang, SUGGEST_INSTRUCTIONS),
            messages=[{"role": "user", "content": f"Question: {question}\nTheir answer: {answer}"}],
            json_schema=SUGGEST_SCHEMA, language=lang, max_tokens=300, effort="low", target=target,
        )
    except Exception as exc:
        _skip(Feature.DRAFT_CHECK, getattr(exc, "reason", exc.__class__.__name__), node_key)
        return ""
    data = result.data or {}
    tip = " ".join(str(data.get("suggestion") or "").split())
    if not data.get("worth_saying") or not tip:
        _skip(Feature.DRAFT_CHECK, "not_needed", node_key)
        return ""
    return tip[:200]


def help_answer(*, step_text: str, question: str, lang: str, user, node_key: str, target: str = "") -> str:
    from apps.assistant.gateway import ask
    from apps.assistant.models import Feature

    if not _ready(Feature.HELP, node_key):
        return ""
    try:
        result = ask(
            Feature.HELP, user=user, system_parts=_parts(lang, HELP_INSTRUCTIONS, question=step_text),
            messages=[{"role": "user", "content": f"The step asks: {step_text}\nThey wrote: {question}"}],
            json_schema=HELP_SCHEMA, language=lang, max_tokens=300, effort="low", target=target,
        )
    except Exception as exc:
        _skip(Feature.HELP, getattr(exc, "reason", exc.__class__.__name__), node_key)
        return ""
    return " ".join(str((result.data or {}).get("answer") or "").split())[:400]


def document_notes(*, document_id: str, lang: str, node_key: str = "") -> list[str]:
    """At most 3 short notes from the AI helper's document review, or [] when it cannot answer."""
    from apps.assistant import document_review
    from apps.assistant.models import Feature
    from apps.documents.models import SubmissionDocument

    if not _ready(Feature.DOCUMENT_REVIEW, node_key):
        return []
    document = SubmissionDocument.objects.filter(pk=document_id).first()
    if document is None:
        return []
    owner = getattr(document.application_draft, "innovator", None) if document.application_draft_id else None
    try:
        data = document_review.review(user=owner, document=document, role="innovator", requested_language=lang)
    except Exception as exc:
        _skip(Feature.DOCUMENT_REVIEW, getattr(exc, "reason", exc.__class__.__name__), node_key)
        return []
    notes = [" ".join(str(item.get("text") or "").split())[:160] for item in data.get("key_points") or []]
    return [note for note in notes if note][:MAX_NOTES]


def queue_document_notes(*, connection_id: str, phone: str, document_ids: list[str], lang: str, node_key: str) -> None:
    """Review the files in the background after this message is answered, then send the notes."""
    from django.conf import settings
    from django.db import transaction

    from apps.channels.tasks import send_document_notes

    args = (str(connection_id), phone, [str(d) for d in document_ids], lang, node_key)

    def run():
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            send_document_notes(*args)
            return
        try:
            send_document_notes.delay(*args)
        except Exception:  # no broker: do it now rather than lose it
            send_document_notes(*args)

    transaction.on_commit(run)


class AIGuidanceMixin:
    """Methods ``JourneyRunner`` uses for AI guidance."""

    def _ai_on(self, node: dict) -> bool:
        return self.channel == "whatsapp" and not self.dry_run and bool((node.get("settings") or {}).get("ai_guidance"))

    def _ai_key(self, node: dict) -> str:
        field = (self.state.get("fq") or {}).get("current") if node["type"] == "form_questions" else ""
        return f"{node['key']}:{field}" if field else node["key"]

    def _ai_once(self, node: dict) -> bool:
        """True the first time this step uses AI; never more than one AI message per step."""
        used = self.state.setdefault("ai_used", [])
        key = self._ai_key(node)
        if key in used:
            _skip("any", "already_used_on_this_step", node["key"])
            return False
        used.append(key)
        return True

    def _ai_help(self, node: dict, text: str):
        from apps.channels.way_out import norm

        value = norm(text)
        if not self._ai_on(node) or not (value in HELP_WORDS or text.strip() == "?") or self.media:
            return None
        from apps.assistant.models import Feature

        if not _ready(Feature.HELP, node["key"]):
            return None  # no AI: "help" is an ordinary answer, as without AI guidance
        if not self._ai_once(node):
            return self.repeat()
        step_text = self.t(node.get("text"))
        if node["type"] == "form_questions":
            field = self._fq_current_field(node)
            step_text = (field or {}).get("label") or step_text
        answer = help_answer(step_text=step_text, question=text, lang=self.lang, user=self.user, node_key=node["key"], target=f"journey:{self.session_id}")
        self._say("person", text[:300])
        self.logged_steps.append((node["key"], node["type"], "help"))
        return self.repeat([answer] if answer else [])

    def _ai_after_long_answer(self, node: dict, field: dict, value):
        """After a long text answer: maybe one suggestion with Add more and Keep my answer."""
        if not self._ai_on(node) or field.get("type") not in LONG_TEXT_TYPES or not isinstance(value, str):
            return None
        if not self._ai_once(node):
            return None
        tip = suggestion(question=field.get("label") or "", answer=value, lang=self.lang, user=self.user, node_key=node["key"], target=f"journey:{self.session_id}")
        if not tip:
            return None
        from apps.channels.engine import Choice, Screen

        self.state["pending"] = {"kind": "ai_more", "field": field.get("key") or ""}
        body = f"{text('label', self.lang)}: {tip}"
        screen = Screen(text=body, end=False, node_key=node["key"], node_type=node["type"], choices=[Choice("1", text("add_more", self.lang)), Choice("2", text("keep", self.lang))], expects="choice", node_title=node.get("title") or "", lang=self.lang)
        self._say("bot", body)
        return screen

    def _ai_pending(self, node: dict, text_in: str):
        """Answers to the suggestion: Add more (then their extra text) or Keep my answer."""
        pending = self.state.get("pending") or {}
        if pending.get("kind") not in ("ai_more", "ai_add"):
            return None
        from apps.channels.engine import Screen

        key = pending.get("field") or ""
        if pending["kind"] == "ai_more":
            index = self._choose(text_in, 2, [text("add_more", self.lang), text("keep", self.lang)])
            if index == 2:
                self.state.pop("pending", None)
                self._record_answer(node, text_in)
                return self._fq_advance(node, key)
            if index == 1:
                self.state["pending"] = {"kind": "ai_add", "field": key}
                body = text("type_more", self.lang)
                self._say("bot", body)
                return Screen(text=body, end=False, node_key=node["key"], node_type=node["type"], expects="text", node_title=node.get("title") or "", lang=self.lang)
            # They typed more instead of tapping: take it as the extra text.
        self.state.pop("pending", None)
        extra = text_in.strip()
        if extra:
            current = self._answers().get(key) or ""
            self._store_answer(key, f"{current}\n{extra}".strip() if current else extra, (node.get("settings") or {}).get("title_field") or "title")
            self._record_answer(node, extra)
        return self._fq_advance(node, key)

    def _ai_documents(self, node: dict, document_ids: list[str]) -> str:
        """Queue the review of saved files; returns the "Reading your document..." note, or ""."""
        if not document_ids or not self._ai_on(node) or not self._ai_once(node):
            return ""
        from apps.assistant.gateway import unavailable_reason
        from apps.assistant.models import Feature

        reason = unavailable_reason(Feature.DOCUMENT_REVIEW)
        if reason:
            _skip(Feature.DOCUMENT_REVIEW, reason, node["key"])
            return ""
        self.effects["ai_documents"] = {"ids": list(document_ids), "lang": self.lang, "node": node["key"]}
        return text("reading", self.lang)
