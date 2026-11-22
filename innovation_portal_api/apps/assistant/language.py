"""Which language the helper answers in (Copilot A2).

The language the screen sends (the page's language switch, or "Show in Setswana") first, then the
person's profile language, then the language of what they wrote. The profile field defaults to
English for everyone, so it cannot override a person reading the site in Setswana. Setswana text and documents are sent as they are; they are never translated before
sending.
"""

from __future__ import annotations

import re

LANGUAGES = ("en", "tn")
# Common Setswana words that rarely appear in English text.
_TSWANA = re.compile(
    r"\b(le|go|ka|mo|ke|ya|wa|ba|tsa|tse|ga|gore|jaaka|thata|kgotsa|fela|mme|gape|jalo|bona|dira|ditiro|batho|motho|kakanyo|madi|kwa|teng|nna|rona|bone|gonne|fa|tsamaya)\b",
    re.IGNORECASE,
)


def detect(text: str) -> str:
    """'tn' when the text looks like Setswana, 'en' otherwise ('' for no text)."""
    words = re.findall(r"[A-Za-z']+", text or "")
    if len(words) < 3:
        return ""
    hits = len(_TSWANA.findall(text))
    return "tn" if hits / len(words) >= 0.18 else "en"


def resolve(*, user=None, requested: str | None = None, text: str = "") -> str:
    profile = getattr(user, "preferred_language", "") if getattr(user, "is_authenticated", False) else ""
    for value in (requested, profile, detect(text)):
        if value in LANGUAGES:
            return value
    return "en"


def instruction(language: str) -> str:
    if language == "tn":
        return (
            "Write every answer in Setswana, in plain words a person in Botswana uses every day. "
            "The material you read may be in English or Setswana; read it as it is. "
            'Set "language" to "tn".'
        )
    return (
        "Write every answer in English, in plain words. The material you read may be in English or Setswana; "
        'read it as it is and answer in English. Set "language" to "en".'
    )
