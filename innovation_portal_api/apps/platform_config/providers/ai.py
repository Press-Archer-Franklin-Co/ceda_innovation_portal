"""AI services for the AI helper (integration kind `ai`). Open to any vendor.

No vendor is the default and no model is fixed in code: the person picks a service, pastes its
address (for the OpenAI-compatible one), its key and the model name their service gives them, tests
it and activates it. Keys are secret fields: stored encrypted, never returned, never logged, never in
environment variables. Prices per million tokens are optional fields on each connection; without them
usage records tokens and the cost shows as "not set".

The provider keys stay `openai_compatible`, `anthropic` and `openai` so saved connections keep working.
The calls themselves are in apps/assistant/providers.
"""

from __future__ import annotations

import time

from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register

MODEL_MISSING = "Enter the model name your service gives you."

ENVIRONMENT = FieldSpec(
    "environment",
    "Key type",
    FieldType.SELECT,
    required=True,
    default="test",
    choices=(("test", "Test key"), ("live", "Live key")),
    help_text="The AI settings below choose whether test or live keys are in use.",
)
TIME_LIMIT = FieldSpec(
    "timeout_seconds",
    "Time limit per answer (seconds)",
    FieldType.NUMBER,
    default=30,
    help_text="If the service has not answered in this time, the feature stays hidden for that request.",
)
PRICES = (
    FieldSpec("price_input", "Price per million input tokens (US dollars)", FieldType.NUMBER, help_text="Optional. From your service's price page. Without prices, usage shows tokens and the cost as not set."),
    FieldSpec("price_output", "Price per million output tokens (US dollars)", FieldType.NUMBER, help_text="Optional."),
    FieldSpec("price_cached", "Price per million cached input tokens (US dollars)", FieldType.NUMBER, help_text="Optional. Leave empty if your service does not cache."),
)


def model_field(help_text: str, placeholder: str = "") -> FieldSpec:
    return FieldSpec("model", "Model name", FieldType.TEXT, placeholder=placeholder, help_text=help_text)


class BaseAIProvider(BaseProvider):
    kind = "ai"
    sdk_key = ""
    shared_fields = (ENVIRONMENT, TIME_LIMIT, *PRICES)

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        if not str(config.get("model") or "").strip():
            errors["model"] = MODEL_MISSING
        timeout = config.get("timeout_seconds")
        if timeout not in (None, "") and not 5 <= float(timeout) <= 180:
            errors["timeout_seconds"] = "Enter between 5 and 180 seconds."
        for spec in PRICES:
            value = config.get(spec.name)
            if value not in (None, "") and float(value) < 0:
                errors[spec.name] = "Enter 0 or more."
        return errors, warnings

    @classmethod
    def missing_required(cls, config, secrets):
        missing = super().missing_required(config, secrets)
        if not str(config.get("model") or "").strip():
            missing.append("Model name")
        return missing

    def test(self, **inputs) -> TestReport:
        from apps.assistant.gateway import check_connection

        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        started = time.monotonic()
        ok, detail = check_connection(provider_key=self.sdk_key, config=self.config, api_key=self.secrets.get("api_key", ""))
        report.add("Connected" if ok else "The AI service answered", ok, detail, int((time.monotonic() - started) * 1000))
        return report


# Registered in this order on purpose: any service first, then the named ones alphabetically.


@register
class OpenAICompatibleProvider(BaseAIProvider):
    key = "openai_compatible"
    sdk_key = "openai_compatible"
    label = "Any AI service (OpenAI-compatible address)"
    description = (
        "Most AI services give an OpenAI-compatible address: for example OpenAI, Google Gemini, Mistral, Groq, DeepSeek, "
        "Azure OpenAI, a local Ollama server, or a service hosted in Botswana. Paste that address, the key and the model name."
    )
    setup_steps = (
        "In your AI service's console, find its OpenAI-compatible address (base URL), create an API key and note the model name.",
        "Paste the address, the key and the model name here. The key is stored encrypted and never shown again.",
        "Choose test or live key, then press Test. When the test passes, activate it.",
        "If the service cannot follow a JSON schema, switch off 'Follows a JSON schema'.",
    )
    fields = (
        FieldSpec("base_url", "Address (base URL)", FieldType.URL, required=True, placeholder="https://.../v1"),
        FieldSpec("api_key", "API key", required=True, secret=True),
        model_field("The exact model name your service gives you."),
        FieldSpec("json_schema", "Follows a JSON schema", FieldType.BOOLEAN, default=True),
    )


@register
class AnthropicProvider(BaseAIProvider):
    key = "anthropic"
    sdk_key = "anthropic"
    label = "Anthropic (Claude)"
    description = "Anthropic's own API. Create the key and pick the model in the Anthropic Console."
    setup_steps = (
        "In the Anthropic Console, create an API key and note the model name you want to use.",
        "Paste the key and the model name here. The key is stored encrypted and never shown again.",
        "Choose test or live key, then press Test. When the test passes, activate it.",
    )
    fields = (
        FieldSpec("api_key", "API key", required=True, secret=True),
        model_field("The model name from the Anthropic Console's model list."),
    )


@register
class OpenAIProvider(BaseAIProvider):
    key = "openai"
    sdk_key = "openai"
    label = "OpenAI"
    description = "OpenAI's own API. Create the key and pick the model on the OpenAI platform."
    setup_steps = (
        "On the OpenAI platform, create a project API key and note the model name you want to use.",
        "Paste the key and the model name here. The key is stored encrypted and never shown again.",
        "Choose test or live key, then press Test. When the test passes, activate it.",
    )
    fields = (
        FieldSpec("api_key", "API key", required=True, secret=True),
        model_field("The model name from the OpenAI platform's model list."),
    )
