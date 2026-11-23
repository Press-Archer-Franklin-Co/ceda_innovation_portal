"""The ai_helper switch's description named one vendor. Make it vendor neutral (open to any AI service).

Only changes the row while it still has the old text. Reversible.
"""

from django.db import migrations

OLD = (
    "Claude guides innovators, gives officers hints and answers questions about the portal. "
    "Needs an active, tested Claude connection."
)
NEW = "The AI helper guides innovators, gives officers summaries and answers questions about the portal. Needs an active, tested AI service."


def forward(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key="ai_helper", description=OLD).update(description=NEW)


def backward(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key="ai_helper", description=NEW).update(description=OLD)


class Migration(migrations.Migration):
    dependencies = [("assistant", "0007_cost_not_set"), ("platform_config", "0003_quick_start_basics_only_flag")]

    operations = [migrations.RunPython(forward, backward)]
