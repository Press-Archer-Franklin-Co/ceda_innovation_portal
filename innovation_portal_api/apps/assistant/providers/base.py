"""The provider layer of the AI Copilot: one small interface in front of each AI service.

Only modules in this package import an AI SDK. Everything else calls
``apps.assistant.gateway.ask``, which picks the provider from the settings in the staff
console. Every provider error becomes ``AssistantUnavailable(reason)`` with one of
REASONS, so callers only ever hide the feature.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

REASONS = ("no_connection", "key_refused", "limit_reached", "timeout", "busy", "unreachable", "refused", "bad_output")


class AssistantUnavailable(Exception):
    """The helper has no answer. Callers hide it; `reason` (one of REASONS or a gateway reason) and
    `detail` (plain words, never the key or the text sent) are for admins only."""

    def __init__(self, reason: str, detail: str = ""):
        super().__init__(reason)
        self.reason = reason
        self.detail = detail


@dataclass
class SystemPart:
    """A piece of the system prompt. `cache` marks the stable part (guidance, manual, knowledge)."""

    text: str
    cache: bool = False


@dataclass
class AIFile:
    """A file sent with the request (only to providers that support files)."""

    filename: str
    mime_type: str
    data: bytes


@dataclass
class AIResult:
    text: str = ""
    data: dict | None = None
    model: str = ""
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    request_id: str = ""


@dataclass
class ProviderSettings:
    """What a provider needs to make a call, read from one IntegrationConnection."""

    api_key: str
    model: str
    timeout_seconds: float = 30.0
    base_url: str = ""
    extra: dict = field(default_factory=dict)


class AIProvider:
    key: str = ""
    label: str = ""
    supports_files: bool = False
    supports_json_schema: bool = True

    def __init__(self, settings: ProviderSettings):
        self.settings = settings

    def generate(
        self,
        *,
        system_parts: list[SystemPart],
        messages: list[dict],
        json_schema: dict | None = None,
        files: list[AIFile] | None = None,
        max_tokens: int = 8000,
        timeout: float | None = None,
        effort: str = "medium",
    ) -> AIResult:
        raise NotImplementedError

    def check(self) -> tuple[bool, str]:
        """One tiny request. Returns (ok, plain message)."""
        raise NotImplementedError


def parse_json(text: str) -> dict:
    """The JSON object in a structured answer, or AssistantUnavailable('bad_output')."""
    try:
        data = json.loads(text)
    except (TypeError, ValueError):
        start, end = (text or "").find("{"), (text or "").rfind("}")
        if start < 0 or end <= start:
            raise AssistantUnavailable("bad_output", "The answer was not in the expected shape.") from None
        try:
            data = json.loads(text[start : end + 1])
        except ValueError:
            raise AssistantUnavailable("bad_output", "The answer was not in the expected shape.") from None
    if not isinstance(data, dict):
        raise AssistantUnavailable("bad_output", "The answer was not in the expected shape.")
    return data
