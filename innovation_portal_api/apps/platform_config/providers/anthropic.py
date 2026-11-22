"""AI services for the AI Copilot (integration kind `ai`): Claude, OpenAI, or any OpenAI-compatible address.

Keys are secret fields: stored encrypted, never returned, never logged, never in environment
variables. Each connection says whether it holds a test or a live key; 3.34b chooses which keys
are in use and which service each feature uses. The calls themselves are in apps/assistant/providers.
"""

from __future__ import annotations

import time

from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register

ANTHROPIC_MODELS = (
    ("claude-opus-5-5", "Claude Opus 5.5 (best answers)"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 (cheaper)"),
    ("claude-haiku-5-5", "Claude Haiku 5.5 (cheapest, for short answers)"),
)
# Check this list against OpenAI's model page before the live key goes in (needs-you).
OPENAI_MODELS = (
    ("gpt-5", "GPT-5"),
    ("gpt-5-mini", "GPT-5 mini (cheaper)"),
    ("gpt-5-nano", "GPT-5 nano (cheapest)"),
)
DEFAULT_MODEL = "claude-opus-5-5"

ENVIRONMENT = FieldSpec(
    "environment",
    "Key type",
    FieldType.SELECT,
    required=True,
    default="test",
    choices=(("test", "Test key"), ("live", "Live key")),
    help_text="3.34b decides whether test or live keys are in use.",
)
TIME_LIMIT = FieldSpec(
    "timeout_seconds",
    "Time limit per answer (seconds)",
    FieldType.NUMBER,
    default=30,
    help_text="If the service has not answered in this time, the feature stays hidden for that request.",
)


class BaseAIProvider(BaseProvider):
    kind = "ai"
    sdk_key = ""

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        timeout = config.get("timeout_seconds")
        if timeout not in (None, "") and not 5 <= float(timeout) <= 180:
            errors["timeout_seconds"] = ["Enter between 5 and 180 seconds."]
        return errors, warnings

    def test(self, **inputs) -> TestReport:
        from apps.assistant.gateway import check_connection

        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        started = time.monotonic()
        ok, detail = check_connection(provider_key=self.sdk_key, config=self.config, api_key=self.secrets.get("api_key", ""))
        report.add("Connected" if ok else "The service answered", ok, detail, int((time.monotonic() - started) * 1000))
        return report


@register
class AnthropicProvider(BaseAIProvider):
    key = "anthropic"
    sdk_key = "anthropic"
    label = "Claude (Anthropic)"
    description = "Claude for the AI Copilot. It guides innovators, gives officers summaries and answers questions about the portal."
    setup_steps = (
        "In the Claude Console (platform.claude.com), create an API key for CEDA. Use a test key first.",
        "Paste the key here. It is stored encrypted and never shown again.",
        "Choose the model and whether this is a test or a live key, then press Test.",
        "Activate the connection, then choose the keys in use on AI helper > Services and usage.",
    )
    fields = (
        FieldSpec("api_key", "API key", required=True, secret=True, placeholder="sk-ant-..."),
        FieldSpec("model", "Model", FieldType.SELECT, required=True, default=DEFAULT_MODEL, choices=ANTHROPIC_MODELS),
        ENVIRONMENT,
        TIME_LIMIT,
    )


@register
class OpenAIProvider(BaseAIProvider):
    key = "openai"
    sdk_key = "openai"
    label = "OpenAI"
    description = "OpenAI models for any AI Copilot feature."
    setup_steps = (
        "In the OpenAI platform, create a project API key for CEDA. Use a test key first.",
        "Paste the key here. It is stored encrypted and never shown again.",
        "Choose the model and whether this is a test or a live key, then press Test.",
    )
    fields = (
        FieldSpec("api_key", "API key", required=True, secret=True, placeholder="sk-..."),
        FieldSpec("model", "Model", FieldType.SELECT, required=True, default="gpt-5", choices=OPENAI_MODELS),
        ENVIRONMENT,
        TIME_LIMIT,
    )


@register
class OpenAICompatibleProvider(BaseAIProvider):
    key = "openai_compatible"
    sdk_key = "openai_compatible"
    label = "Other service (OpenAI-compatible address)"
    description = "Any AI service that speaks the OpenAI API, for example one hosted in Botswana or on CEDA's servers."
    setup_steps = (
        "Ask the service for its address (base URL), an API key and the exact model name.",
        "Fill them in, choose test or live, then press Test.",
        "If the service cannot follow a JSON schema, switch off 'Follows a JSON schema'.",
    )
    fields = (
        FieldSpec("base_url", "Address (base URL)", FieldType.URL, required=True, placeholder="https://ai.example.co.bw/v1"),
        FieldSpec("api_key", "API key", required=True, secret=True),
        FieldSpec("model", "Model name", required=True, placeholder="the model name the service gives you"),
        FieldSpec("json_schema", "Follows a JSON schema", FieldType.BOOLEAN, default=True),
        ENVIRONMENT,
        TIME_LIMIT,
    )
