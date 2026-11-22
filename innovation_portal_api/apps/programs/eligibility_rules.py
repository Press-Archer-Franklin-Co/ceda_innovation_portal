"""R-48 (3.6b): eligibility rules as blocks, and the plain-words sentence for them.

A block is {field, operator, value}. Each block also gives the yes/no question that the public
"Can you enter?" page (U10) asks, so the builder preview and 1.9 say the same thing. A negative
block ("is not") asks the positive question and expects "no".
"""

from __future__ import annotations

from rest_framework.exceptions import ValidationError

from apps.core.constants import BusinessStage
from apps.core.i18n import get_text

LANGS = ("en", "tn")
CITIZENSHIP = ("citizen", "resident")
STAGE_ORDER = [choice.value for choice in BusinessStage]

# Operators each field takes.
OPERATORS = {
    "age": ("is_between", "is_at_least"),
    "citizenship": ("is", "is_not"),
    "district": ("is", "is_not", "is_one_of"),
    "sector": ("is", "is_not", "is_one_of"),
    "business_stage": ("is", "is_not", "is_one_of", "is_at_least"),
    "registered_company": ("is",),
}

STAGE_NAMES = {
    "en": {"idea": "Idea", "testing": "Testing", "selling": "Selling", "growing": "Growing"},
    "tn": {"idea": "Kakanyo", "testing": "Go leka", "selling": "Go rekisa", "growing": "Go gola"},
}


def _bad(message: str):
    raise ValidationError({"rules": message})


def _whole(value, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, (int, float)) or int(value) != value or not 0 <= value <= 120:
        _bad(f"{name} must be a whole number from 0 to 120.")
    return int(value)


def _ids(model, value) -> list[str]:
    values = value if isinstance(value, list) else [value]
    if not values or not all(isinstance(item, str) for item in values):
        _bad(f"Pick at least one {model._meta.verbose_name}.")
    found = {str(pk) for pk in model.objects.filter(id__in=values).values_list("id", flat=True)}
    missing = [item for item in values if item not in found]
    if missing:
        _bad(f"Unknown {model._meta.verbose_name}: {', '.join(missing)}.")
    return values


def clean_block(field: str, operator: str, value):
    """Checks one block and returns its value in the stored shape."""
    from apps.reference.models import District, Sector

    if field not in OPERATORS:
        _bad(f"field must be one of: {', '.join(OPERATORS)}.")
    if operator not in OPERATORS[field]:
        _bad(f"{field} takes: {', '.join(OPERATORS[field])}.")
    if field == "age":
        if operator == "is_between":
            if not isinstance(value, list) or len(value) != 2:
                _bad("age is_between takes [lowest, highest].")
            low, high = _whole(value[0], "age"), _whole(value[1], "age")
            if low > high:
                _bad("The lowest age must not be above the highest.")
            return [low, high]
        return _whole(value, "age")
    if field == "citizenship":
        if value not in CITIZENSHIP:
            _bad(f"citizenship takes: {', '.join(CITIZENSHIP)}.")
        return value
    if field in ("district", "sector"):
        model = District if field == "district" else Sector
        values = _ids(model, value)
        if operator == "is_one_of":
            return values
        if len(values) != 1:
            _bad(f"{field} {operator} takes one id.")
        return values[0]
    if field == "business_stage":
        values = value if isinstance(value, list) else [value]
        if not values or any(item not in STAGE_ORDER for item in values):
            _bad(f"business_stage takes: {', '.join(STAGE_ORDER)}.")
        if operator == "is_one_of":
            return values
        if len(values) != 1:
            _bad(f"business_stage {operator} takes one stage.")
        return values[0]
    if not isinstance(value, bool):
        _bad("registered_company takes true or false.")
    return value


def _names(model, ids, lang: str) -> list[str]:
    ids = ids if isinstance(ids, list) else [ids]
    rows = {str(item.id): get_text(item.name, lang) or item.slug for item in model.objects.filter(id__in=ids)}
    return [rows[item] for item in ids if item in rows]


def _join(items: list[str], lang: str) -> str:
    word = " or " if lang == "en" else " kgotsa "
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + word + items[-1]


def expects_yes(rule) -> bool:
    """A negative block asks the positive question and needs "no"."""
    if rule.field == "registered_company":
        return bool(rule.value)
    return rule.operator != "is_not"


def phrase(rule, lang: str, *, positive: bool) -> str:
    """The condition after "you": "are 18 to 35 years old", "live in Gaborone". positive drops "not"."""
    from apps.reference.models import District, Sector

    field, operator, value = rule.field, rule.operator, rule.value
    yes = positive or expects_yes(rule)
    en = lang == "en"
    if field == "age":
        if operator == "is_between":
            return f"are {value[0]} to {value[1]} years old" if en else f"na le dingwaga di le {value[0]} go ya go {value[1]}"
        return f"are at least {value} years old" if en else f"na le dingwaga di le {value} kgotsa go feta"
    if field == "citizenship":
        if value == "citizen":
            text = ("are a citizen of Botswana", "are not a citizen of Botswana") if en else ("moagi wa Botswana", "se moagi wa Botswana")
        else:
            text = ("are a resident of Botswana", "are not a resident of Botswana") if en else ("nna mo Botswana ka tetla ya bonno", "sa nne mo Botswana ka tetla ya bonno")
        return text[0 if yes else 1]
    if field == "district":
        places = _join(_names(District, value, lang), lang)
        if en:
            return f"live in {places}" if yes else f"do not live in {places}"
        return f"nna kwa {places}" if yes else f"sa nne kwa {places}"
    if field == "sector":
        sectors = _join(_names(Sector, value, lang), lang)
        if en:
            return f"work in {sectors}" if yes else f"do not work in {sectors}"
        return f"dira mo lephateng la {sectors}" if yes else f"sa dire mo lephateng la {sectors}"
    if field == "business_stage":
        stages = _join([STAGE_NAMES[lang][item] for item in (value if isinstance(value, list) else [value])], lang)
        further = (" stage or further" if en else " kgotsa go feta") if operator == "is_at_least" else (" stage" if en else "")
        if en:
            return f"have a business at the {stages}{further}" if yes else f"do not have a business at the {stages}{further}"
        return f"na le kgwebo e e mo legatong la {stages}{further}" if yes else f"se na kgwebo e e mo legatong la {stages}{further}"
    # registered_company
    if en:
        return "have a registered company" if yes else "do not have a registered company"
    return "na le khampani e e kwadisitsweng" if yes else "se na khampani e e kwadisitsweng"


def question(rule, lang: str) -> str:
    """The yes/no question for a block, always in the positive."""
    text = phrase(rule, lang, positive=True)
    if lang == "tn":
        return f"A o {text}?"
    if text.startswith("are "):
        return f"Are you {text[4:]}?"
    return f"Do you {text}?"


def sentence(rules, lang: str) -> str:
    """One plain-words sentence for all active rules, blocks and yes/no questions alike."""
    parts = []
    for rule in rules:
        if rule.field:
            parts.append(phrase(rule, lang, positive=False))
        else:
            asked = ((rule.translations or {}).get("tn") or {}).get("question") if lang == "tn" else ""
            asked = (asked or rule.question or rule.title or "").strip()
            if asked:
                parts.append(f'answer "{"yes" if rule.required_answer else "no"}" to "{asked}"' if lang == "en" else f'araba "{"ee" if rule.required_answer else "nnyaa"}" mo go "{asked}"')
    if not parts:
        return "Anyone can enter." if lang == "en" else "Mongwe le mongwe a ka tsenela."
    if lang == "en":
        body = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " and " + parts[-1]
        return f"You can enter if you {body}."
    body = parts[0] if len(parts) == 1 else ", ".join(parts[:-1]) + " mme o " + parts[-1]
    return f"O ka tsenela fa o {body}."


def sentences(rules) -> dict:
    return {lang: sentence(rules, lang) for lang in LANGS}
