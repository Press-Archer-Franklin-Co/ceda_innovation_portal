"""Instructions and answer shapes (JSON schemas) for each AI helper feature.

The schemas are sent as structured output, so every answer has the same sections and the screens
can show them without guessing. Limits such as "up to 3 questions" are also enforced in code.
"""

from __future__ import annotations


def _obj(properties: dict) -> dict:
    return {"type": "object", "properties": properties, "required": list(properties), "additionalProperties": False}


def _list(item: dict) -> dict:
    return {"type": "array", "items": item}


TEXT = {"type": "string"}

DRAFT_CHECK_INSTRUCTIONS = """Task: give an innovator feedback on ONE step of their idea form while they write it.

You get the step's fields (label, whether required, help text) and the innovator's current answers.
Return:
- clear: up to 3 short points about what is already clear and good.
- unclear: sentences that are hard to follow. Quote the exact sentence from the answer in `quote`, name the field key, and suggest in one sentence what to make clearer. Do not rewrite their answer for them.
- missing: things the form, the help text or the CEDA guidance asks for that the answers do not cover yet. Name the field key (or "" if it is not one field).
- officer_questions: up to 3 questions an officer may ask about this step.
Be kind and specific. Suggestions only; the innovator decides what to change. Never rewrite the whole idea."""

DRAFT_CHECK_SCHEMA = _obj(
    {
        "clear": _list(TEXT),
        "unclear": _list(_obj({"field_key": TEXT, "quote": TEXT, "suggestion": TEXT})),
        "missing": _list(_obj({"field_key": TEXT, "what": TEXT})),
        "officer_questions": _list(TEXT),
    }
)

HINTS_INSTRUCTIONS = """Task: help an officer read a submitted idea faster.

Return:
- summary: at most 5 short lines that say what the idea is, who it is for and how it works.
- strengths: up to 4 points.
- points_to_check: up to 5 things the officer should check or ask about (gaps, claims to verify, risks).
- next_step: one suggested next step for the officer, in one sentence.
Do not score, approve or reject. The officer reads everything and decides."""

HINTS_SCHEMA = _obj({"summary": _list(TEXT), "strengths": _list(TEXT), "points_to_check": _list(TEXT), "next_step": TEXT})

RELATED_INSTRUCTIONS = """Task: an officer is looking at one idea (the main idea) and a shortlist of other ideas found by a database search.

For each shortlisted idea, decide:
- "similar": it does much the same thing for the same people, so the two could merge;
- "complementary": it is different but fits together, for example one produces a raw material the other turns into products, or one has the customers the other needs;
- "none": no useful link.
Give one plain sentence `why` for similar and complementary ideas (empty for none). Use only the ids you were given."""

RELATED_SCHEMA = _obj({"items": _list(_obj({"id": TEXT, "relation": {"type": "string", "enum": ["similar", "complementary", "none"]}, "why": TEXT}))})

HELP_INSTRUCTIONS = """Task: answer a "how do I..." question about using the CEDA Innovation Portal, from the user manual above.

Return:
- answer: short steps the person can follow. Use only what the manual says.
- page_ids: ids of the manual pages you used (from "### Page <id>").
- screenshot_ids: ids of up to 2 screenshots that show the steps (from "Screenshot <id>").
- confident: false when the manual does not answer the question, or you are unsure.
- wants_person: true when the person asks to talk to a person, or is upset, or the question is about their own idea's decision or money.
If you are not confident, say briefly that you will pass the question to the CEDA team."""

HELP_SCHEMA = _obj({"answer": TEXT, "page_ids": _list(TEXT), "screenshot_ids": _list(TEXT), "confident": {"type": "boolean"}, "wants_person": {"type": "boolean"}})

WEB_CHAT_INSTRUCTIONS = HELP_INSTRUCTIONS + """

This is the first message in the website help chat. Keep the answer under 80 words. A person from CEDA will read the chat too."""
