"""What may be sent to Anthropic (C3 privacy rule).

Only the text a feature needs is sent. These answers are always left out:
- field types that carry personal details: email, phone, Omang ID, date (often a birth date),
  file, photo or video, district;
- any field the form builder marks sensitive (``validation_rules: {"sensitive": true}``);
- any field whose key looks like a person's name, contact, password, ID number, bank or account detail.
Names, phone numbers and emails of innovators are never sent either: the content builders
below use only the idea's title and answers.
"""

from __future__ import annotations

import re

from apps.core.constants import LAYOUT_FIELD_TYPES

SENSITIVE_TYPES = frozenset({"email", "phone", "omang_id", "date", "file", "media", "district"})
# Parts of a field key (split on _ and -) that mark it personal.
SENSITIVE_PARTS = frozenset(
    {
        "password", "pass", "omang", "passport", "bank", "iban", "swift", "pin", "phone", "mobile", "cell", "email", "mail",
        "birth", "dob", "surname", "contact", "address", "salary", "income",
    }
)
# Whole-key patterns (several parts together).
SENSITIVE_KEY = re.compile(
    r"national_?id|id_?(number|no)|account_?(number|no)|branch_?code|e_?mail|first_?name|last_?name|full_?name|given_?name|^name$",
    re.IGNORECASE,
)
# Long answers are cut so one idea cannot fill the request.
MAX_ANSWER_CHARS = 2000


def is_sensitive(*, key: str, field_type: str, validation_rules: dict | None = None) -> bool:
    if field_type in SENSITIVE_TYPES:
        return True
    if isinstance(validation_rules, dict) and validation_rules.get("sensitive"):
        return True
    key = (key or "").lower()
    if SENSITIVE_PARTS & set(re.split(r"[_\-\s.]+", key)):
        return True
    return bool(SENSITIVE_KEY.search(key))


def answer_text(value) -> str:
    """Plain text for an answer value. Anything that is not text, a number or a choice is dropped."""
    if value is None or isinstance(value, bool):
        return "yes" if value is True else ("no" if value is False else "")
    if isinstance(value, (int, float)):
        return str(value)
    if isinstance(value, str):
        return value.strip()[:MAX_ANSWER_CHARS]
    if isinstance(value, list):
        return ", ".join(part for part in (answer_text(item) for item in value if not isinstance(item, dict)) if part)[:MAX_ANSWER_CHARS]
    if isinstance(value, dict):
        for key in ("text", "value", "label"):
            if isinstance(value.get(key), (str, int, float)):
                return answer_text(value[key])
    return ""


def _label(field: dict, language: str) -> str:
    label = field.get("label")
    if isinstance(label, dict):
        return (label.get(language) or label.get("en") or field.get("key") or "").strip()
    return str(label or field.get("key") or "").strip()


def safe_fields(fields: list[dict], answers: dict, *, language: str = "en") -> list[dict]:
    """[{key, label, required, answer}] for the fields that may be sent, in form order."""
    result = []
    for field in fields:
        key = field.get("key") or ""
        field_type = field.get("type") or ""
        if not key or field_type in LAYOUT_FIELD_TYPES or not field.get("is_active", True):
            continue
        if is_sensitive(key=key, field_type=field_type, validation_rules=field.get("validation_rules")):
            continue
        result.append(
            {
                "key": key,
                "label": _label(field, language),
                "required": bool(field.get("required")),
                "help": (field.get("help_text") or {}).get(language, "") if isinstance(field.get("help_text"), dict) else "",
                "answer": answer_text(answers.get(key)),
            }
        )
    return result


def safe_submission_answers(submission) -> list[dict]:
    """[{key, label, answer}] from a sent idea's stored answers, without sensitive fields."""
    rows = []
    for response in submission.responses.select_related("form_field").order_by("form_field__ordering", "created_at"):
        field = response.form_field
        key = response.field_key_snapshot or getattr(field, "key", "")
        field_type = response.field_type_snapshot or getattr(field, "field_type", "")
        rules = getattr(field, "validation_rules", None) if field else None
        if field_type in LAYOUT_FIELD_TYPES or is_sensitive(key=key, field_type=field_type, validation_rules=rules):
            continue
        text = answer_text(response.value)
        if text:
            rows.append({"key": key, "label": response.field_label_snapshot or key, "answer": text})
    return rows
