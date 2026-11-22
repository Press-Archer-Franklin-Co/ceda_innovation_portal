"""WhatsApp full flow: two new step types, and WhatsApp buttons by default on Twilio.

- ``JourneyNode.type`` adds ``form_questions`` (Ask the form's questions) and ``my_ideas``
  (Show my ideas).
- Twilio WhatsApp connections still on the old default ("numbered", or nothing saved) are
  switched to "buttons". Each one changed is marked, so the reverse puts back only those.
  A connection where staff chose numbered text on purpose after this runs is left alone.
"""

from django.db import migrations, models

MARK = "0006_form_questions_my_ideas_and_buttons"


def buttons_on(apps, schema_editor):
    IntegrationConnection = apps.get_model("platform_config", "IntegrationConnection")
    for connection in IntegrationConnection.objects.filter(kind="whatsapp", provider="whatsapp_twilio"):
        config = dict(connection.config or {})
        if config.get("interactive_mode") not in (None, "", "numbered"):
            continue
        config["interactive_mode"] = "buttons"
        config["interactive_mode_set_by"] = MARK
        connection.config = config
        connection.save(update_fields=["config", "updated_at"])


def buttons_off(apps, schema_editor):
    IntegrationConnection = apps.get_model("platform_config", "IntegrationConnection")
    for connection in IntegrationConnection.objects.filter(kind="whatsapp", provider="whatsapp_twilio"):
        config = dict(connection.config or {})
        if config.get("interactive_mode_set_by") != MARK:
            continue
        config.pop("interactive_mode_set_by", None)
        config["interactive_mode"] = "numbered"
        connection.config = config
        connection.save(update_fields=["config", "updated_at"])


class Migration(migrations.Migration):
    dependencies = [
        ("channels", "0005_whatsapp_example_files_and_send"),
        ("platform_config", "0006_ai_several_active"),
    ]

    operations = [
        migrations.AlterField(
            model_name="journeynode",
            name="type",
            field=models.CharField(
                choices=[
                    ("menu", "Menu"), ("message", "Message"), ("question", "Question"), ("save_draft", "Save to an idea draft"),
                    ("lookup", "Look up"), ("condition", "Condition"), ("subscribe", "Subscribe"), ("language", "Language"),
                    ("handoff", "Talk to a person"), ("end", "End"), ("file", "Ask for a file"), ("submit", "Send the idea"),
                    ("form_questions", "Ask the form's questions"), ("my_ideas", "Show my ideas"),
                ],
                max_length=20,
            ),
        ),
        migrations.RunPython(buttons_on, buttons_off),
    ]
