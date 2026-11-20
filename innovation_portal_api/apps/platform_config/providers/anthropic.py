"""AI helper provider: Claude, through the official Anthropic Python SDK (C3).

The API key is a secret field, so it is stored encrypted and never returned. The calls
themselves live in apps/assistant/client.py; this class only describes the settings and runs
the connection test.
"""

from __future__ import annotations

import time

from apps.platform_config.providers.base import BaseProvider, FieldSpec, FieldType, TestReport, register

MODEL_CHOICES = (
    ("claude-opus-5-5", "Claude Opus 5.5 (best answers)"),
    ("claude-sonnet-5-5", "Claude Sonnet 5.5 (cheaper)"),
    ("claude-haiku-5-5", "Claude Haiku 5.5 (cheapest, for short hints)"),
)
DEFAULT_MODEL = "claude-opus-5-5"

# Feature keys the admin can switch on and off on the connection. Each endpoint checks its own.
FEATURES = (
    ("feature_draft_check", "Innovator guidance", "Check my idea on each step of the innovator form."),
    ("feature_hints", "Officer hints", "Summary, points to check and a suggested next step on each submission."),
    ("feature_related", "Idea matching", "Similar and complementary ideas, so officers can suggest people work together."),
    ("feature_help", "Help with the portal", "Answers how do I questions from the user manual."),
    ("feature_web_chat", "Website help chat first answer", "The helper answers the first message in the website help chat."),
)


@register
class AnthropicProvider(BaseProvider):
    key = "anthropic"
    kind = "ai"
    label = "Claude (Anthropic)"
    description = "The AI helper. It guides innovators, gives officers hints and answers questions about the portal."
    setup_steps = (
        "In the Claude Console (platform.claude.com), create an API key for CEDA.",
        "Paste the key here. It is stored encrypted and never shown again.",
        "Choose the model and a monthly spending limit, then press Test.",
        "Activate the connection, then switch on AI helper in Feature switches.",
    )
    fields = (
        FieldSpec("api_key", "API key", required=True, secret=True, placeholder="sk-ant-..."),
        FieldSpec("model", "Model", FieldType.SELECT, required=True, default=DEFAULT_MODEL, choices=MODEL_CHOICES),
        FieldSpec(
            "monthly_limit_usd",
            "Monthly spending limit (US dollars)",
            FieldType.NUMBER,
            required=True,
            default=50,
            help_text="The helper stops for the rest of the month when this is reached.",
        ),
        FieldSpec(
            "timeout_seconds",
            "Time limit per answer (seconds)",
            FieldType.NUMBER,
            default=30,
            help_text="If Claude has not answered in this time, the helper stays hidden for that request.",
        ),
        *(FieldSpec(name, label, FieldType.BOOLEAN, default=True, help_text=help_text) for name, label, help_text in FEATURES),
        FieldSpec(
            "allow_guests_help",
            "Guests can ask for help",
            FieldType.BOOLEAN,
            default=False,
            help_text="People who are not signed in can ask how do I questions.",
        ),
    )

    @classmethod
    def validate(cls, config, secrets):
        errors, warnings = super().validate(config, secrets)
        limit = config.get("monthly_limit_usd")
        if limit not in (None, "") and float(limit) < 0:
            errors["monthly_limit_usd"] = ["Enter 0 or more."]
        timeout = config.get("timeout_seconds")
        if timeout not in (None, "") and not 5 <= float(timeout) <= 120:
            errors["timeout_seconds"] = ["Enter between 5 and 120 seconds."]
        return errors, warnings

    def test(self, **inputs) -> TestReport:
        from apps.assistant.client import AssistantClient

        report = TestReport()
        missing = self.missing_required(self.config, self.secrets)
        report.add("Settings complete", not missing, f"Missing: {', '.join(missing)}." if missing else "All required settings are filled in.")
        if missing:
            return report
        started = time.monotonic()
        ok, detail = AssistantClient.check_connection(config=self.config, api_key=self.secrets.get("api_key", ""))
        report.add("Connected" if ok else "Claude answered", ok, detail, int((time.monotonic() - started) * 1000))
        return report
