"""Idea profiles (Copilot A5): how a Setswana idea matches an English one with no new infrastructure.

For each sent submission the AI writes, once, an English summary, keywords in English and
Setswana, what the idea needs (inputs), what it makes (outputs) and who it serves. The related
ideas shortlist then compares these with PostgreSQL trigram and keyword overlap.
The profile is rebuilt only when the submission's text changes (fingerprint).
"""

from __future__ import annotations

import hashlib
import json
import logging

from django.db import transaction

from apps.assistant import language as lang_mod
from apps.assistant.models import Feature, IdeaProfile
from apps.assistant.privacy import safe_submission_answers
from apps.assistant.providers import AssistantUnavailable, SystemPart
from apps.core.i18n import get_text

logger = logging.getLogger("apps.assistant")

PROFILE_INSTRUCTIONS = """Task: describe one idea so it can be matched with other ideas, whatever language they are written in.

The idea may be written in English or Setswana. Read it as it is. Return:
- summary_en: 2 or 3 plain English sentences about what the idea does and for whom.
- keywords_en and keywords_tn: up to 8 short keywords each, in English and in Setswana.
- inputs: what the idea needs to work (raw materials, equipment, services), in English.
- outputs: what the idea makes or sells, in English.
- serves: who it serves or sells to, in English.
- source_language: "en" or "tn", the language the idea is mostly written in.
Do not judge the idea. Never include names, phone numbers or ID numbers."""


def _list(schema_item=None):
    return {"type": "array", "items": schema_item or {"type": "string"}}


PROFILE_SCHEMA = {
    "type": "object",
    "properties": {
        "summary_en": {"type": "string"},
        "keywords_en": _list(),
        "keywords_tn": _list(),
        "inputs": _list(),
        "outputs": _list(),
        "serves": _list(),
        "source_language": {"type": "string", "enum": ["en", "tn"]},
    },
    "required": ["summary_en", "keywords_en", "keywords_tn", "inputs", "outputs", "serves", "source_language"],
    "additionalProperties": False,
}


def idea_text(submission) -> str:
    lines = [f"Title: {submission.title}"]
    if submission.sector_id:
        lines.append(f"Sector: {get_text(submission.sector.name, 'en')}")
    if submission.district_id:
        lines.append(f"District: {get_text(submission.district.name, 'en')}")
    lines += [f"{row['label']}: {row['answer']}" for row in safe_submission_answers(submission)]
    return "\n".join(lines)


def fingerprint(submission) -> str:
    return hashlib.sha256(idea_text(submission).encode()).hexdigest()


def build_profile(submission, *, force: bool = False) -> IdeaProfile | None:
    """Write or refresh the profile. Returns None when the helper is off or fails (nothing breaks)."""
    from apps.assistant import gateway

    text = idea_text(submission)
    current = fingerprint(submission)
    existing = IdeaProfile.objects.filter(submission=submission).first()
    if existing and existing.fingerprint == current and not force:
        return existing
    try:
        result = gateway.ask(
            Feature.IDEA_PROFILE,
            user=None,
            system_parts=[SystemPart("You describe business ideas for the CEDA Innovation Portal in Botswana, plainly and without judging them.", cache=True), SystemPart(PROFILE_INSTRUCTIONS, cache=True)],
            messages=[{"role": "user", "content": text}],
            json_schema=PROFILE_SCHEMA,
            effort="low",
            max_tokens=2000,
            target=f"submission:{submission.pk}",
        )
    except AssistantUnavailable:
        return existing
    data = result.data or {}
    clean = lambda items, limit=8: [str(item).strip()[:80] for item in (items or []) if str(item).strip()][:limit]  # noqa: E731
    values = {
        "summary_en": str(data.get("summary_en") or "")[:1000],
        "keywords_en": clean(data.get("keywords_en")),
        "keywords_tn": clean(data.get("keywords_tn")),
        "inputs": clean(data.get("inputs")),
        "outputs": clean(data.get("outputs")),
        "serves": clean(data.get("serves")),
        "source_language": data.get("source_language") if data.get("source_language") in ("en", "tn") else (lang_mod.detect(text) or "en"),
        "sector_id": submission.sector_id,
        "district_id": submission.district_id,
        "fingerprint": current,
        "model": result.model,
    }
    values["search_text"] = " ".join([values["summary_en"], *values["keywords_en"], *values["keywords_tn"], *values["outputs"], *values["inputs"]])[:4000]
    profile, _ = IdeaProfile.objects.update_or_create(submission=submission, defaults=values)
    return profile


def queue_profile(submission_id) -> None:
    """Build the profile in the background after the current transaction commits."""
    from django.conf import settings

    from apps.assistant.tasks import build_idea_profile

    def run():
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            build_idea_profile(str(submission_id))
            return
        try:
            build_idea_profile.delay(str(submission_id))
        except Exception:  # no broker: build it now rather than lose it
            build_idea_profile(str(submission_id))

    transaction.on_commit(run)


def profile_dict(profile: IdeaProfile | None) -> dict | None:
    if profile is None:
        return None
    return json.loads(json.dumps({key: getattr(profile, key) for key in ("summary_en", "keywords_en", "keywords_tn", "inputs", "outputs", "serves", "source_language")}))

