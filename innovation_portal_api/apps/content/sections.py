"""Home page section types (B6). A new type is added here; no migration is needed.

Each type declares its settings. Field kinds:
- ``text``: bilingual ``{"en": "...", "tn": "..."}`` (a plain string is English)
- ``string``, ``bool``, ``int`` (with ``min``/``max``)
- ``button``: ``{"label": text, "url": string}``
- ``list``: a list of objects whose fields are declared in ``item`` (``max`` items)
- ``photo`` (U7): ``null`` or ``{"asset": "<HeroPhoto id>", "size": "small|medium|large", "alt": text}``;
  the alt text (photo description) is required in English when a photo is set
"""

from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any

LANGS = ("en", "tn")

BUTTON = {"kind": "button"}


def _text(default="", required=False, max_length=300):
    return {"kind": "text", "default": default, "required": required, "max": max_length}


SECTION_TYPES: dict[str, dict] = {
    "hero_banner": {
        "label": "Banner",
        "fixed_first": True,
        "can_disable": False,
        "settings": {
            "headline": _text("Turn your idea into a business", required=True, max_length=120),
            "highlighted_words": {"kind": "string", "default": "", "max": 120},
            "text": _text(max_length=300),
            # U7: after the supporting text, as in the Hero banner editor (Figma 3.8).
            "photo": {"kind": "photo"},
            "primary_button": BUTTON,
            "secondary_button": BUTTON,
            "show_watermark": {"kind": "bool", "default": True},
            "show_quick_start": {"kind": "bool", "default": True},
        },
    },
    "partners_strip": {
        "label": "Partners and sponsors",
        "settings": {"title": _text("Our partners"), "max_items": {"kind": "int", "default": 12, "min": 1, "max": 30}},
    },
    "challenges": {
        "label": "Challenges",
        "settings": {
            "title": _text("Open challenges"),
            "max_items": {"kind": "int", "default": 3, "min": 1, "max": 12},
            "only_open": {"kind": "bool", "default": True},
        },
    },
    "leadership_quotes": {
        "label": "Leadership quotes",
        "settings": {"title": _text(""), "max_items": {"kind": "int", "default": 5, "min": 1, "max": 10}},
    },
    "news_flash": {
        "label": "News flash",
        "settings": {"title": _text("News flash"), "max_items": {"kind": "int", "default": 5, "min": 1, "max": 10}},
    },
    "bulletin_board": {
        "label": "Bulletin board",
        "settings": {"title": _text("Bulletin board"), "max_items": {"kind": "int", "default": 6, "min": 1, "max": 12}},
    },
    "sectors": {
        "label": "Sectors",
        "settings": {
            "title": _text("Ideas we support"),
            "items": {
                "kind": "list",
                "max": 12,
                "item": {
                    "sector": {"kind": "string", "required": True, "max": 80, "help": "Sector id or slug"},
                    "example": _text(max_length=160),
                    "icon": {"kind": "string", "max": 40},
                },
            },
        },
    },
    "how_it_works": {
        "label": "How it works",
        "settings": {
            "title": _text("How it works"),
            "steps": {
                "kind": "list",
                "max": 6,
                "item": {"title": _text(required=True, max_length=80), "text": _text(max_length=200), "icon": {"kind": "string", "max": 40}},
            },
        },
    },
    "cta_band": {
        "label": "Call to action band",
        "settings": {"headline": _text("Have an idea? Start in two minutes.", required=True, max_length=120), "text": _text(max_length=200), "button": BUTTON},
    },
    "stories": {
        "label": "Stories",
        "settings": {"title": _text("Success stories"), "max_items": {"kind": "int", "default": 3, "min": 1, "max": 3}},
    },
}

DEFAULT_ORDER = [
    "hero_banner",
    "partners_strip",
    "challenges",
    "news_flash",
    "sectors",
    "how_it_works",
    "leadership_quotes",
    "stories",
    "bulletin_board",
    "cta_band",
]


class SettingsError(Exception):
    def __init__(self, errors: list[dict]):
        self.errors = errors
        super().__init__(errors)


def _empty_text():
    return {lang: "" for lang in LANGS}


def _normalize_text(value, spec, path, errors):
    if value is None:
        value = spec.get("default", "")
    if isinstance(value, str):
        value = {"en": value}
    if not isinstance(value, dict) or set(value) - set(LANGS) or any(v is not None and not isinstance(v, str) for v in value.values()):
        errors.append({"path": path, "message": 'Enter text as {"en": "...", "tn": "..."} or a plain English string.'})
        return _empty_text()
    result = {lang: (value.get(lang) or "") for lang in LANGS}
    limit = spec.get("max")
    for lang, text in result.items():
        if limit and len(text) > limit:
            errors.append({"path": f"{path}.{lang}", "message": f"At most {limit} characters."})
    if spec.get("required") and not result["en"].strip():
        errors.append({"path": path, "message": "English text is required."})
    return result


def _normalize(value, spec, path, errors):
    kind = spec["kind"]
    if kind == "text":
        return _normalize_text(value, spec, path, errors)
    if kind == "string":
        value = spec.get("default", "") if value is None else value
        if not isinstance(value, str):
            errors.append({"path": path, "message": "Must be text."})
            return ""
        if spec.get("max") and len(value) > spec["max"]:
            errors.append({"path": path, "message": f"At most {spec['max']} characters."})
        if spec.get("required") and not value.strip():
            errors.append({"path": path, "message": "Required."})
        return value
    if kind == "bool":
        value = spec.get("default", False) if value is None else value
        if not isinstance(value, bool):
            errors.append({"path": path, "message": "Must be true or false."})
            return bool(spec.get("default", False))
        return value
    if kind == "int":
        value = spec.get("default", 0) if value is None else value
        if isinstance(value, bool) or not isinstance(value, int):
            errors.append({"path": path, "message": "Must be a whole number."})
            return spec.get("default", 0)
        if ("min" in spec and value < spec["min"]) or ("max" in spec and value > spec["max"]):
            errors.append({"path": path, "message": f"Must be between {spec.get('min')} and {spec.get('max')}."})
        return value
    if kind == "button":
        value = value or {}
        if not isinstance(value, dict):
            errors.append({"path": path, "message": "A button is {label, url}."})
            return {"label": _empty_text(), "url": ""}
        label = _normalize_text(value.get("label", ""), {"max": 40}, f"{path}.label", errors)
        url = value.get("url") or ""
        if not isinstance(url, str):
            errors.append({"path": f"{path}.url", "message": "Must be text."})
            url = ""
        if label["en"].strip() and not url.strip():
            errors.append({"path": f"{path}.url", "message": "A button with a label needs a link."})
        return {"label": label, "url": url}
    if kind == "photo":
        return _normalize_photo(value, path, errors)
    if kind == "list":
        value = value or []
        if not isinstance(value, list):
            errors.append({"path": path, "message": "Must be a list."})
            return []
        if spec.get("max") and len(value) > spec["max"]:
            errors.append({"path": path, "message": f"At most {spec['max']} items."})
        items = []
        for index, item in enumerate(value):
            if not isinstance(item, dict):
                errors.append({"path": f"{path}[{index}]", "message": "Each item must be an object."})
                continue
            items.append({key: _normalize(item.get(key), sub, f"{path}[{index}].{key}", errors) for key, sub in spec["item"].items()})
        return items
    raise ValueError(kind)


def _normalize_photo(value, path, errors):
    if not value or not (isinstance(value, dict) and value.get("asset")):
        if value not in (None, {}, "") and not isinstance(value, dict):
            errors.append({"path": path, "message": "A photo is {asset, size, alt}."})
        return None
    from apps.content.hero_photo import DEFAULT_SIZE, SIZES
    from apps.content.models import HeroPhoto

    asset = str(value.get("asset"))
    try:
        exists = HeroPhoto.objects.filter(id=uuid.UUID(asset)).exists()
    except ValueError:
        exists = False
    if not exists:
        errors.append({"path": f"{path}.asset", "message": "Upload the photo again: this one was not found."})
    size = value.get("size") or DEFAULT_SIZE
    if size not in SIZES:
        errors.append({"path": f"{path}.size", "message": "Choose Small, Medium or Large."})
        size = DEFAULT_SIZE
    alt = _normalize_text(value.get("alt"), {"max": 200, "required": True}, f"{path}.alt", errors)
    return {"asset": asset, "size": size, "alt": alt}


def normalize_settings(section_type: str, settings: Any, *, path: str = "settings") -> dict:
    """Fill defaults and check one section's settings. Raises SettingsError with [{path, message}]."""
    if section_type not in SECTION_TYPES:
        raise SettingsError([{"path": "type", "message": f"Unknown section type `{section_type}`."}])
    if settings is None:
        settings = {}
    if not isinstance(settings, dict):
        raise SettingsError([{"path": path, "message": "Settings must be an object."}])
    spec = SECTION_TYPES[section_type]["settings"]
    errors: list[dict] = []
    unknown = sorted(set(settings) - set(spec))
    if unknown:
        errors.append({"path": path, "message": f"Unknown settings: {', '.join(unknown)}."})
    result = {key: _normalize(settings.get(key), field_spec, f"{path}.{key}", errors) for key, field_spec in spec.items()}
    if errors:
        raise SettingsError(errors)
    return result


def default_settings(section_type: str) -> dict:
    errors: list[dict] = []
    spec = SECTION_TYPES[section_type]["settings"]
    return {key: _normalize(None, field_spec, key, errors) for key, field_spec in spec.items()}


def localize(value: Any, lang: str) -> Any:
    """Turn every {"en", "tn"} text inside settings into a string (English when missing)."""
    if isinstance(value, dict):
        if set(value) and set(value) <= set(LANGS) and all(isinstance(v, str) for v in value.values()):
            text = value.get(lang) or ""
            return text if text.strip() else value.get("en", "")
        return {key: localize(item, lang) for key, item in value.items()}
    if isinstance(value, list):
        return [localize(item, lang) for item in value]
    return value


def describe_types() -> list[dict]:
    return [
        {
            "type": key,
            "label": spec["label"],
            "fixed_first": bool(spec.get("fixed_first")),
            "can_disable": spec.get("can_disable", True),
            "settings_schema": deepcopy(spec["settings"]),
            "default_settings": default_settings(key),
        }
        for key, spec in SECTION_TYPES.items()
    ]
