"""Answer checks for the form field types added in B4 (radio, checkboxes, yes_no, district, omang_id)."""

from __future__ import annotations

import re

from apps.core.constants import LAYOUT_FIELD_TYPES, SubmissionFormFieldType

OMANG_PATTERN = re.compile(r"^\d{9}$")
YES_NO_VALUES = {"yes", "no"}


def is_layout(field_type: str) -> bool:
    return field_type in LAYOUT_FIELD_TYPES


def omang_error(value) -> str | None:
    """A Botswana national ID (Omang) has 9 digits; the 5th digit is 1 (male) or 2 (female)."""
    text = re.sub(r"[\s-]", "", str(value))
    if not OMANG_PATTERN.match(text):
        return "Enter the 9 digits of the Omang number."
    if text[4] not in {"1", "2"}:
        return "This is not a valid Omang number. Check the 5th digit."
    return None


def answer_errors(field, value) -> list[str]:
    """Type checks for one non-empty answer. Older field types are not checked here."""
    field_type = field.field_type
    if field_type == SubmissionFormFieldType.OMANG_ID:
        error = omang_error(value)
        return [error] if error else []
    if field_type == SubmissionFormFieldType.YES_NO:
        if isinstance(value, bool) or str(value).strip().lower() in YES_NO_VALUES:
            return []
        return ["Choose yes or no."]
    if field_type in {SubmissionFormFieldType.RADIO, SubmissionFormFieldType.CHECKBOXES}:
        allowed = {str(option.value) for option in field.options.all()}
        chosen = value if isinstance(value, list) else [value]
        if field_type == SubmissionFormFieldType.RADIO and isinstance(value, list):
            return ["Choose one option."]
        if allowed and any(str(item) not in allowed for item in chosen):
            return ["Choose from the options given."]
        return []
    if field_type == SubmissionFormFieldType.DISTRICT:
        from apps.reference.models import District

        text = str(value).strip()
        lookup = District.objects.filter(active=True)
        if lookup.filter(slug=text).exists():
            return []
        try:
            if lookup.filter(id=text).exists():
                return []
        except Exception:  # not a UUID
            pass
        return ["Choose a district from the list."]
    return []
