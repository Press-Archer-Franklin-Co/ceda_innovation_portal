"""Provider registry building blocks.

A provider is one class: it declares its key, kind, label, the fields the admin console
renders as a form, a ``test()`` method and its runtime methods. Register it with
``@register`` and it appears in ``GET /api/platform/providers/``.
"""

from __future__ import annotations

import time
from dataclasses import asdict, dataclass, field
from typing import Any, Callable

from apps.core.constants import RoleType


class FieldType:
    TEXT = "text"
    TEXTAREA = "textarea"
    URL = "url"
    NUMBER = "number"
    BOOLEAN = "boolean"
    SELECT = "select"
    LIST = "list"  # list of strings
    MAPPING = "mapping"  # {string: string}
    JSON = "json"  # free JSON object


@dataclass(frozen=True)
class FieldSpec:
    name: str
    label: str
    type: str = FieldType.TEXT
    required: bool = False
    secret: bool = False
    default: Any = None
    help_text: str = ""
    choices: tuple[tuple[str, str], ...] = ()
    placeholder: str = ""

    def as_dict(self) -> dict:
        data = asdict(self)
        data["choices"] = [{"value": value, "label": label} for value, label in self.choices]
        return data


@dataclass
class TestStep:
    __test__ = False  # not a pytest test class

    step: str
    ok: bool
    detail: str = ""
    ms: int = 0
    skipped: bool = False

    def as_dict(self) -> dict:
        return asdict(self)


@dataclass
class TestReport:
    __test__ = False  # not a pytest test class

    steps: list[TestStep] = field(default_factory=list)
    extra: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return bool(self.steps) and all(step.ok for step in self.steps)

    def add(self, step: str, ok: bool, detail: str = "", ms: int = 0, skipped: bool = False) -> TestStep:
        item = TestStep(step=step, ok=ok, detail=detail, ms=ms, skipped=skipped)
        self.steps.append(item)
        return item

    def run(self, step: str, check: Callable[[], tuple[bool, str]]) -> bool:
        """Run ``check`` (returns ``(ok, detail)``), time it and record the step."""
        started = time.monotonic()
        try:
            ok, detail = check()
        except Exception as exc:  # a failing check must never break the report
            ok, detail = False, f"Unexpected error: {exc.__class__.__name__}"
        self.add(step, ok, detail, int((time.monotonic() - started) * 1000))
        return ok

    def as_dict(self) -> dict:
        return {"ok": self.ok, "steps": [step.as_dict() for step in self.steps], **self.extra}


# Roles an SSO connection may hand out. Administrator is never allowed.
SSO_ASSIGNABLE_ROLES: tuple[tuple[str, str], ...] = tuple(
    (value, label)
    for value, label in RoleType.choices
    if value not in {RoleType.ADMINISTRATOR, RoleType.INNOVATOR}
)


def scrub(text: str, secret_values) -> str:
    """Remove any secret value from text that may be shown, stored or logged."""
    if not text:
        return text
    for value in secret_values:
        if isinstance(value, str) and len(value) >= 4 and value in text:
            text = text.replace(value, "••••")
    return text


def iter_secret_strings(secrets: dict):
    for value in (secrets or {}).values():
        if isinstance(value, str):
            yield value
        elif isinstance(value, dict):
            for inner in value.values():
                if isinstance(inner, str):
                    yield inner


class BaseProvider:
    key: str = ""
    kind: str = ""
    label: str = ""
    description: str = ""
    setup_steps: tuple[str, ...] = ()
    fields: tuple[FieldSpec, ...] = ()
    shared_fields: tuple[FieldSpec, ...] = ()

    @classmethod
    def all_fields(cls) -> tuple[FieldSpec, ...]:
        return tuple(cls.fields) + tuple(cls.shared_fields)

    @classmethod
    def field_map(cls) -> dict[str, FieldSpec]:
        return {spec.name: spec for spec in cls.all_fields()}

    @classmethod
    def secret_field_names(cls) -> set[str]:
        return {spec.name for spec in cls.all_fields() if spec.secret}

    @classmethod
    def defaults(cls) -> dict:
        return {spec.name: spec.default for spec in cls.all_fields() if not spec.secret and spec.default is not None}

    @classmethod
    def as_dict(cls) -> dict:
        return {
            "key": cls.key,
            "kind": cls.kind,
            "label": cls.label,
            "description": cls.description,
            "setup_steps": list(cls.setup_steps),
            "fields": [spec.as_dict() for spec in cls.all_fields()],
        }

    # -- validation ---------------------------------------------------------

    @classmethod
    def validate_value(cls, spec: FieldSpec, value):
        """Return the cleaned value or raise ValueError with a readable message."""
        if value is None or value == "":
            return value
        if spec.type == FieldType.NUMBER:
            try:
                number = float(value)
            except (TypeError, ValueError) as exc:
                raise ValueError("Enter a number.") from exc
            return int(number) if number.is_integer() else number
        if spec.type == FieldType.BOOLEAN:
            if isinstance(value, bool):
                return value
            if str(value).lower() in {"true", "1", "yes", "on"}:
                return True
            if str(value).lower() in {"false", "0", "no", "off"}:
                return False
            raise ValueError("Enter true or false.")
        if spec.type == FieldType.LIST:
            if isinstance(value, str):
                value = [item for chunk in value.splitlines() for item in chunk.split(",")]
            if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
                raise ValueError("Enter a list of text values.")
            return [item.strip() for item in value if item.strip()]
        if spec.type == FieldType.MAPPING:
            if not isinstance(value, dict) or not all(isinstance(k, str) and isinstance(v, str) for k, v in value.items()):
                raise ValueError("Enter pairs of text values.")
            return {k.strip(): v.strip() for k, v in value.items() if k.strip()}
        if spec.type == FieldType.JSON:
            if not isinstance(value, dict):
                raise ValueError("Enter a JSON object.")
            return value
        if not isinstance(value, str):
            raise ValueError("Enter text.")
        value = value.strip()
        if spec.type == FieldType.URL and not (value.startswith("https://") or value.startswith("http://")):
            raise ValueError("Enter a URL starting with https://.")
        if spec.type == FieldType.SELECT and spec.choices and value not in {choice for choice, _ in spec.choices}:
            raise ValueError("Choose one of the listed options.")
        return value

    @classmethod
    def validate(cls, config: dict, secrets: dict) -> tuple[dict, list[str]]:
        """Provider-specific checks on the merged settings. Return (field errors, warnings)."""
        return {}, []

    @classmethod
    def missing_required(cls, config: dict, secrets: dict) -> list[str]:
        missing = []
        for spec in cls.all_fields():
            if not spec.required:
                continue
            value = (secrets if spec.secret else config).get(spec.name)
            if value in (None, "", [], {}):
                missing.append(spec.label)
        return missing

    # -- testing ------------------------------------------------------------

    def __init__(self, connection=None, *, config: dict | None = None, secrets: dict | None = None):
        self.connection = connection
        self.config = {**self.defaults(), **(config if config is not None else getattr(connection, "config", {}) or {})}
        self.secrets = secrets or {}

    def test(self, **inputs) -> TestReport:
        raise NotImplementedError


REGISTRY: dict[str, type[BaseProvider]] = {}


def register(provider_class: type[BaseProvider]) -> type[BaseProvider]:
    REGISTRY[provider_class.key] = provider_class
    return provider_class


def get_provider_class(key: str) -> type[BaseProvider] | None:
    return REGISTRY.get(key)


def providers_for(kind: str | None = None) -> list[type[BaseProvider]]:
    return [cls for cls in REGISTRY.values() if kind in (None, "", cls.kind)]
