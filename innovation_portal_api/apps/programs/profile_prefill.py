"""Prompt 37: fill form questions from the signed-in person's profile, so they are not asked again.

A question is filled from the profile when:
- it maps to a profile field: its "Profile field" setting (``profile_field``) or, when that is empty, its type
  (phone, email, district, Omang ID). The setting "none" switches it off;
- the profile holds a value for it (and, for a choice question, the value matches one of its options);
- the person has not answered it yet: nothing they typed is ever replaced;
- the person can see it: active, not a layout block, and shown under the current answers (``visible_if``).
  A question hidden by a condition is never filled.

Used by the full form (the draft's ``profile_prefill``, shown as "From your profile" with Edit) and by the
WhatsApp and USSD form questions (a known answer is shown to confirm instead of asked).
Only the person's own profile is read, and only for their own draft.
"""
from __future__ import annotations

import re
from datetime import date
from types import SimpleNamespace

from apps.core.constants import LAYOUT_FIELD_TYPES, SubmissionFormFieldType as T

NONE = "none"
PROFILE_FIELDS = ("first_name", "last_name", "full_name", "phone", "email", "district", "organisation", "gender", "age_group", "omang")
# The form builder's "people" field types fill themselves unless the setting says otherwise.
TYPE_DEFAULTS = {T.PHONE: "phone", T.EMAIL: "email", T.DISTRICT: "district", T.OMANG_ID: "omang"}
CHOICE_TYPES = {T.SELECT, T.RADIO}
EMPTY = (None, "", [], {})


def profile_key(field: dict) -> str | None:
    """The profile field a question takes its answer from, or None."""
    chosen = (field.get("profile_field") or "").strip()
    if chosen == NONE:
        return None
    if chosen in PROFILE_FIELDS:
        return chosen
    return TYPE_DEFAULTS.get(field.get("type"))


def profile_values(user) -> dict:
    """What the profile holds, by profile field. Missing values are left out."""
    if user is None or not getattr(user, "is_authenticated", False):
        return {}
    profile = getattr(user, "innovator_profile", None) if hasattr(user, "innovator_profile") else None
    first, last = (user.first_name or "").strip(), (user.last_name or "").strip()
    values = {
        "first_name": first,
        "last_name": last,
        "full_name": " ".join(part for part in (first, last) if part),
        "phone": (user.phone_number or "").strip(),
        "email": (user.email or "").strip(),
    }
    if profile is not None:
        values["district"] = profile.district.slug if profile.district_id and profile.district.slug else ""
        values["gender"] = (profile.gender or "").strip()
        values["omang"] = (profile.national_id or "").strip()
        if profile.date_of_birth:
            values["age"] = _age(profile.date_of_birth)
    org = user.organization_profiles.order_by("created_at").values_list("legal_name", flat=True).first() if hasattr(user, "organization_profiles") else None
    values["organisation"] = (org or "").strip()
    return {key: value for key, value in values.items() if value not in EMPTY}


def _age(born: date) -> int:
    today = date.today()
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


def _option_for(field: dict, wanted) -> str | None:
    """The option a profile value stands for: same value or label (any case), or the age band holding the age."""
    options = field.get("options") or []
    if isinstance(wanted, int):  # age: options like "18-35", "36+" or "Under 18"
        for option in options:
            text = f"{option.get('value', '')} {_label(option)}"
            low, high = _band(text)
            if low is not None and low <= wanted <= high:
                return option.get("value")
        return None
    norm = str(wanted).strip().lower()
    for option in options:
        if norm in (str(option.get("value", "")).strip().lower(), _label(option).strip().lower()):
            return option.get("value")
    return None


def _label(option: dict) -> str:
    label = option.get("label")
    if isinstance(label, dict):
        return str(label.get("en") or next(iter(label.values()), ""))
    return str(label or "")


def _band(text: str) -> tuple[int | None, int]:
    text = text.lower()
    match = re.search(r"(\d+)\s*(?:-|to|\u2013)\s*(\d+)", text)
    if match:
        return int(match.group(1)), int(match.group(2))
    match = re.search(r"(\d+)\s*\+|(\d+)\s*(?:and|or)\s*(?:over|older|above)", text)
    if match:
        return int(match.group(1) or match.group(2)), 200
    match = re.search(r"(?:under|below)\s*(\d+)", text)
    if match:
        return 0, int(match.group(1)) - 1
    return None, 0


def value_for(field: dict, known: dict):
    """The answer the profile gives this question, or None."""
    key = profile_key(field)
    if not key:
        return None
    if key == "age_group":
        age = known.get("age")
        return _option_for(field, age) if age is not None and field.get("type") in CHOICE_TYPES else None
    value = known.get(key)
    if value in EMPTY:
        return None
    if field.get("type") in CHOICE_TYPES:
        return _option_for(field, value)
    if field.get("type") in (T.MULTISELECT, T.CHECKBOXES, T.FILE, T.MEDIA, T.BOOLEAN, T.YES_NO):
        return None  # a profile value never stands for these
    return value


def visible(field: dict, values: dict) -> bool:
    from apps.programs.condition_services import FormConditionService

    shim = SimpleNamespace(key=field.get("key") or "", visible_if=field.get("visible_if") or {}, enabled_if=field.get("enabled_if") or {}, required=bool(field.get("required")), required_if=field.get("required_if") or {})
    try:
        return bool(FormConditionService.field_state(shim, values)["visible"])
    except Exception:
        return False  # a condition we cannot read: do not fill a question the person may not see


def prefill(fields, user, answers: dict | None) -> dict:
    """{question key: {"value", "source"}} for the questions the profile can fill now."""
    from apps.programs.condition_services import FormConditionService

    known = profile_values(user)
    if not known:
        return {}
    answers = dict(answers or {})
    effective = dict(answers)
    age = FormConditionService._derive_age(effective)
    if age is not None:
        effective["applicant_age"] = age
    out = {}
    for field in fields:
        key = field.get("key") or ""
        if not key or not field.get("is_active", True) or field.get("type") in LAYOUT_FIELD_TYPES:
            continue
        if answers.get(key) not in EMPTY:
            continue  # never replace what the person typed
        if not visible(field, effective):
            continue
        value = value_for(field, known)
        if value not in EMPTY:
            out[key] = {"value": value, "source": profile_key(field), "display": display(field, value)}
    return out


def display(field: dict, value) -> str:
    """The answer as the person reads it: a district's name, a choice's label."""
    if field.get("type") == T.DISTRICT:
        from apps.reference.models import District

        district = District.objects.filter(slug=value).only("name").first()
        return district.name if district else str(value)
    for option in field.get("options") or []:
        if option.get("value") == value:
            return _label(option) or str(value)
    return str(value)


def schema_fields(document: dict | None) -> list[dict]:
    """Every question in a published form document, in order."""
    if not document:
        return []
    from apps.programs.form_schema import iter_schema_fields

    return [field for step, field in iter_schema_fields(document) if step is None or step.get("is_active", True)]
