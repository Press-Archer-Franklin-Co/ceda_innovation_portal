"""Bilingual (English + Setswana) text helpers.

Translated text is stored in a JSONField shaped like ``{"en": "...", "tn": "..."}``.
English is the source language and the fallback: when the Setswana value is missing
or blank, readers get the English text.

Usage on a model::

    title = models.JSONField(default=translated_default, blank=True, validators=[validate_translated_text])

Usage on a serializer::

    title = TranslatedTextField()

The field returns a plain string in the request language (``?lang=en|tn`` or the
``Accept-Language`` header) and the full ``{"en": ..., "tn": ...}`` object when the
serializer context has ``full_translations=True`` or the request asks for ``?lang=all``
(staff editing screens).
"""

from __future__ import annotations

from typing import Any, Iterable

from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES: tuple[str, ...] = ("en", "tn")
ALL_LANGUAGES_PARAM = "all"


def translated_default() -> dict[str, str]:
    return {lang: "" for lang in SUPPORTED_LANGUAGES}


def normalize_language(value: str | None) -> str | None:
    """Map ``tn``, ``tn-BW``, ``TN`` etc. to a supported code, or None."""
    if not value:
        return None
    code = str(value).strip().lower().replace("_", "-").split("-")[0]
    if code == ALL_LANGUAGES_PARAM:
        return ALL_LANGUAGES_PARAM
    return code if code in SUPPORTED_LANGUAGES else None


def _language_from_accept_header(header: str | None) -> str | None:
    if not header:
        return None
    candidates: list[tuple[float, str]] = []
    for index, part in enumerate(header.split(",")):
        pieces = part.strip().split(";")
        lang = normalize_language(pieces[0])
        if not lang or lang == ALL_LANGUAGES_PARAM:
            continue
        quality = 1.0
        for param in pieces[1:]:
            param = param.strip()
            if param.startswith("q="):
                try:
                    quality = float(param[2:])
                except ValueError:
                    quality = 0.0
        # Keep header order as a tie breaker.
        candidates.append((quality - index * 1e-6, lang))
    if not candidates:
        return None
    candidates.sort(reverse=True)
    return candidates[0][1]


def resolve_request_language(request) -> str:
    """Return the language a request asked for: ``en``, ``tn`` or ``all``.

    ``?lang=`` wins over ``Accept-Language``. Unknown values fall back to English.
    """
    if request is None:
        return DEFAULT_LANGUAGE
    query_params = getattr(request, "query_params", None) or getattr(request, "GET", {})
    lang = normalize_language(query_params.get("lang") if query_params else None)
    if lang:
        return lang
    meta = getattr(request, "META", {}) or {}
    return _language_from_accept_header(meta.get("HTTP_ACCEPT_LANGUAGE")) or DEFAULT_LANGUAGE


def as_translated(value: Any) -> dict[str, str]:
    """Coerce a stored value into the ``{"en", "tn"}`` shape.

    A plain string (legacy data) is treated as English.
    """
    result = translated_default()
    if value is None:
        return result
    if isinstance(value, str):
        result[DEFAULT_LANGUAGE] = value
        return result
    if isinstance(value, dict):
        for lang in SUPPORTED_LANGUAGES:
            item = value.get(lang)
            result[lang] = item if isinstance(item, str) else ("" if item is None else str(item))
        return result
    result[DEFAULT_LANGUAGE] = str(value)
    return result


def get_text(value: Any, lang: str | None = DEFAULT_LANGUAGE) -> str:
    """Return the text for ``lang``, falling back to English when it is missing or blank."""
    translated = as_translated(value)
    lang = normalize_language(lang) or DEFAULT_LANGUAGE
    if lang == ALL_LANGUAGES_PARAM:
        lang = DEFAULT_LANGUAGE
    text = (translated.get(lang) or "").strip()
    if text:
        return translated[lang]
    return translated.get(DEFAULT_LANGUAGE, "")


def validate_translated_text(value: Any) -> None:
    """Model-level validator for translated JSON fields."""
    if value in (None, ""):
        return
    if not isinstance(value, dict):
        raise DjangoValidationError("Translated text must be an object such as {\"en\": \"...\", \"tn\": \"...\"}.")
    unknown = sorted(set(value) - set(SUPPORTED_LANGUAGES))
    if unknown:
        raise DjangoValidationError(f"Unsupported language code(s): {', '.join(unknown)}.")
    for lang, text in value.items():
        if text is not None and not isinstance(text, str):
            raise DjangoValidationError(f"Text for `{lang}` must be a string.")


def missing_translations_for_value(value: Any, languages: Iterable[str] = SUPPORTED_LANGUAGES) -> list[str]:
    translated = as_translated(value)
    return [lang for lang in languages if not (translated.get(lang) or "").strip()]


def missing_translations(
    obj: Any,
    fields: Iterable[str],
    *,
    languages: Iterable[str] = SUPPORTED_LANGUAGES,
    required: Iterable[str] | None = None,
) -> list[dict[str, Any]]:
    """List missing translations on ``obj`` for the given translated ``fields``.

    Returns ``[{"field": "title", "missing": ["tn"]}, ...]``. A field with no text in any
    language is only reported when it is listed in ``required`` (default: every field), so
    optional fields that were left empty on purpose do not block publishing.

    ``obj`` may be a model instance or a dict of field values.
    """
    languages = tuple(languages)
    required_fields = set(fields if required is None else required)
    report: list[dict[str, Any]] = []
    for field in fields:
        value = obj.get(field) if isinstance(obj, dict) else getattr(obj, field, None)
        missing = missing_translations_for_value(value, languages)
        if not missing:
            continue
        if len(missing) == len(languages) and field not in required_fields:
            continue
        report.append({"field": field, "missing": missing})
    return report


def has_complete_translations(obj: Any, fields: Iterable[str], **kwargs) -> bool:
    return not missing_translations(obj, fields, **kwargs)


class TranslatedTextField(serializers.JSONField):
    """Serializer field for ``{"en": ..., "tn": ...}`` values.

    Output: a string in the request language, or the full object for staff editing
    (``context["full_translations"] = True`` or ``?lang=all``).
    Input: a full or partial object, or a plain string (stored as English).
    """

    default_error_messages = {
        "invalid_shape": "Enter text as an object such as {\"en\": \"...\", \"tn\": \"...\"}.",
        "invalid_language": "Unsupported language code(s): {codes}.",
        "invalid_text": "Text for `{lang}` must be a string.",
        "required_english": "English text is required.",
        "max_length": "Text for `{lang}` must be at most {max_length} characters.",
    }

    def __init__(self, *args, require_english: bool = False, max_length: int | None = None, **kwargs):
        self.require_english = require_english
        self.max_length = max_length
        super().__init__(*args, **kwargs)

    def _wants_full_object(self) -> bool:
        context = getattr(self, "context", {}) or {}
        if context.get("full_translations"):
            return True
        return resolve_request_language(context.get("request")) == ALL_LANGUAGES_PARAM

    def _language(self) -> str:
        context = getattr(self, "context", {}) or {}
        if context.get("lang"):
            return normalize_language(context["lang"]) or DEFAULT_LANGUAGE
        return resolve_request_language(context.get("request"))

    def _existing_value(self) -> dict[str, str]:
        parent = getattr(self, "parent", None)
        instance = getattr(parent, "instance", None) if parent is not None else None
        if instance is None or isinstance(instance, (list, tuple)) or self.source in (None, "*"):
            return translated_default()
        current = instance
        for attr in self.source_attrs:
            current = current.get(attr) if isinstance(current, dict) else getattr(current, attr, None)
            if current is None:
                break
        return as_translated(current)

    def to_representation(self, value):
        if self._wants_full_object():
            return as_translated(value)
        return get_text(value, self._language())

    def to_internal_value(self, data):
        if isinstance(data, str):
            data = {DEFAULT_LANGUAGE: data}
        if not isinstance(data, dict):
            self.fail("invalid_shape")
        unknown = sorted(set(data) - set(SUPPORTED_LANGUAGES))
        if unknown:
            self.fail("invalid_language", codes=", ".join(unknown))
        # Languages left out of the payload keep their stored value, so a staff
        # member can send {"tn": "..."} without wiping the English text.
        result = self._existing_value()
        for lang in SUPPORTED_LANGUAGES:
            if lang not in data:
                continue
            text = data.get(lang, "")
            if text is None:
                text = ""
            if not isinstance(text, str):
                self.fail("invalid_text", lang=lang)
            if self.max_length is not None and len(text) > self.max_length:
                self.fail("max_length", lang=lang, max_length=self.max_length)
            result[lang] = text
        if self.require_english and not result[DEFAULT_LANGUAGE].strip():
            self.fail("required_english")
        return result
