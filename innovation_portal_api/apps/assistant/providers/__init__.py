"""AI provider adapters. Each feature reaches them only through apps.assistant.gateway."""

from __future__ import annotations

from apps.assistant.providers.base import (  # noqa: F401
    REASONS,
    AIFile,
    AIProvider,
    AIResult,
    AssistantUnavailable,
    ProviderSettings,
    SystemPart,
)


def provider_classes() -> dict[str, type[AIProvider]]:
    from apps.assistant.providers.anthropic import AnthropicProvider
    from apps.assistant.providers.openai import OpenAIProvider
    from apps.assistant.providers.openai_compatible import OpenAICompatibleProvider

    return {cls.key: cls for cls in (AnthropicProvider, OpenAIProvider, OpenAICompatibleProvider)}


def build_provider(provider_key: str, *, config: dict, api_key: str, model: str = "") -> AIProvider | None:
    """A provider for one saved connection (config and decrypted key), or None if the key is unknown."""
    cls = provider_classes().get(provider_key)
    if cls is None or not api_key:
        return None
    settings = ProviderSettings(
        api_key=api_key,
        model=model or config.get("model") or "",
        timeout_seconds=float(config.get("timeout_seconds") or 30),
        base_url=(config.get("base_url") or "").strip(),
        extra={"json_schema": config.get("json_schema", True)},
    )
    if not settings.model:
        return None
    return cls(settings)
