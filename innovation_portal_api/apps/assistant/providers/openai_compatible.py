"""Any service that speaks the OpenAI Chat Completions API (for example one hosted in Botswana or
on CEDA's servers): the OpenAI adapter with a base URL and a free-text model name."""

from __future__ import annotations

from apps.assistant.providers.openai import OpenAIProvider


class OpenAICompatibleProvider(OpenAIProvider):
    key = "openai_compatible"
    label = "Other service (OpenAI-compatible address)"
    service_name = "The AI service"
    supports_files = False
    token_parameter = "max_tokens"

    def __init__(self, settings):
        super().__init__(settings)
        # Not every compatible server enforces a JSON schema; the admin can say so on the connection.
        self.supports_json_schema = bool(settings.extra.get("json_schema", True))
