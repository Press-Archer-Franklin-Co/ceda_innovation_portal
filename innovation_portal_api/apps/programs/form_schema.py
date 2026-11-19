"""The form document: one nested JSON shape for a whole form.

Used three ways:
- ``GET/PUT /api/forms/{id}/draft/`` (staff editing, every language as ``{"en", "tn"}``),
- ``FormVersion.schema`` (the frozen copy made on publish),
- ``GET /api/forms/{id}/published/?lang=`` (one language, English fallback per text).

Only attribute and related-manager access is used here, so the migration that
publishes existing forms can call ``build_form_schema`` with historical models.

Shape::

    {
      "id", "name": {en, tn}, "description": {en, tn}, "languages": ["en", "tn"],
      "steps": [
        {"id", "code", "title": {en, tn}, "description": {en, tn}, "is_active",
         "rows": [{"row": 1, "fields": [FIELD, ...]}, ...]}
      ],
      "loose_fields": [FIELD, ...]   # old fields that are not in any step
    }

    FIELD = {"id", "key", "type", "label": {en, tn}, "help_text": {en, tn},
             "placeholder": {en, tn}, "required", "width", "is_active",
             "visible_if", "required_if", "enabled_if", "validation_rules",
             "media_config", "default_value", "example_value", "link_url",
             "options": [{"id", "value", "label": {en, tn}}],
             "rules": [{"rule_type", "rule_value", "error_message"}]}
"""

from __future__ import annotations

from typing import Any

DEFAULT_LANGUAGE = "en"
OTHER_LANGUAGES = ("tn",)

# Document key -> model attribute holding the English text.
FORM_TEXTS = {"name": "title", "description": "description"}
STEP_TEXTS = {"title": "title", "description": "description"}
FIELD_TEXTS = {"label": "label", "help_text": "help_text", "placeholder": "placeholder"}
OPTION_TEXTS = {"label": "label"}

FIELD_DATA_KEYS = (
    "visible_if",
    "required_if",
    "enabled_if",
    "validation_rules",
    "media_config",
    "default_value",
    "example_value",
)


def bilingual(obj, attr: str) -> dict[str, str]:
    """``{"en": <column>, "tn": <translations.tn.attr>}`` for one translatable attribute."""
    translations = getattr(obj, "translations", None) or {}
    result = {DEFAULT_LANGUAGE: getattr(obj, attr, "") or ""}
    for lang in OTHER_LANGUAGES:
        value = (translations.get(lang) or {}).get(attr, "")
        result[lang] = value if isinstance(value, str) else ""
    return result


def _texts(obj, mapping: dict[str, str]) -> dict[str, dict[str, str]]:
    return {doc_key: bilingual(obj, attr) for doc_key, attr in mapping.items()}


def field_document(field) -> dict[str, Any]:
    options = sorted(field.options.all(), key=lambda option: (option.ordering, option.value))
    rules = sorted(
        (rule for rule in field.field_rules.all() if rule.is_active),
        key=lambda rule: (rule.rule_type, rule.rule_value),
    )
    doc = {
        "id": str(field.id),
        "key": field.key,
        "type": field.field_type,
        **_texts(field, FIELD_TEXTS),
        "required": bool(field.required),
        "width": getattr(field, "width", "full") or "full",
        "is_active": bool(field.is_active),
        "link_url": field.link_url or "",
        "options": [{"id": str(option.id), "value": option.value, **_texts(option, OPTION_TEXTS)} for option in options],
        "rules": [
            {"rule_type": rule.rule_type, "rule_value": rule.rule_value, "error_message": rule.error_message or ""}
            for rule in rules
        ],
    }
    for key in FIELD_DATA_KEYS:
        doc[key] = getattr(field, key) or {}
    return doc


def _rows(fields) -> list[dict[str, Any]]:
    rows: dict[int, list] = {}
    for field in sorted(fields, key=lambda item: (getattr(item, "row", 1) or 1, item.ordering, item.key)):
        rows.setdefault(getattr(field, "row", 1) or 1, []).append(field)
    return [{"row": index, "fields": [field_document(field) for field in rows[number]]} for index, number in enumerate(sorted(rows), start=1)]


def build_form_schema(form, *, include_inactive: bool = True) -> dict[str, Any]:
    """The whole form as one nested document (see the module docstring)."""
    sections = sorted(form.sections.all(), key=lambda section: (section.ordering, section.title))
    all_fields = list(form.fields.all())
    steps = []
    for section in sections:
        if not include_inactive and not section.is_active:
            continue
        section_fields = [
            field
            for field in all_fields
            if field.section_id == section.id and (include_inactive or field.is_active)
        ]
        steps.append(
            {
                "id": str(section.id),
                "code": section.code,
                **_texts(section, STEP_TEXTS),
                "is_active": bool(section.is_active),
                "rows": _rows(section_fields),
            }
        )
    loose = [field for field in all_fields if field.section_id is None and (include_inactive or field.is_active)]
    return {
        "id": str(form.id),
        **_texts(form, FORM_TEXTS),
        "languages": list(getattr(form, "languages", None) or [DEFAULT_LANGUAGE]),
        "steps": steps,
        "loose_fields": [field_document(field) for field in sorted(loose, key=lambda item: (item.ordering, item.key))],
    }


def iter_schema_fields(schema: dict[str, Any]):
    """Yield (step or None, field) for every field in a document."""
    for step in schema.get("steps") or []:
        for row in step.get("rows") or []:
            for field in row.get("fields") or []:
                yield step, field
    for field in schema.get("loose_fields") or []:
        yield None, field


def _pick(value: Any, lang: str) -> Any:
    if isinstance(value, dict) and DEFAULT_LANGUAGE in value and set(value) <= {DEFAULT_LANGUAGE, *OTHER_LANGUAGES}:
        text = value.get(lang) or ""
        return text if text.strip() else (value.get(DEFAULT_LANGUAGE) or "")
    return value


def localize_schema(schema: dict[str, Any], lang: str) -> dict[str, Any]:
    """Turn every ``{"en", "tn"}`` text into a string in ``lang`` (English when missing)."""

    def texts(item: dict, keys) -> dict:
        out = dict(item)
        for key in keys:
            if key in out:
                out[key] = _pick(out[key], lang)
        return out

    def field(item: dict) -> dict:
        out = texts(item, FIELD_TEXTS)
        out["options"] = [texts(option, OPTION_TEXTS) for option in item.get("options") or []]
        return out

    result = texts(schema, FORM_TEXTS)
    result["steps"] = [
        {**texts(step, STEP_TEXTS), "rows": [{**row, "fields": [field(f) for f in row.get("fields") or []]} for row in step.get("rows") or []]}
        for step in schema.get("steps") or []
    ]
    result["loose_fields"] = [field(f) for f in schema.get("loose_fields") or []]
    result["language"] = lang
    return result
