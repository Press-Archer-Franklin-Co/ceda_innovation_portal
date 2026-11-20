"""Add the "Send ideas with just the basics" switch (R-23), on by default.

The row is needed: public_config() reads the public switches from the database.
Reversible: the reverse step deletes only this flag.
"""

from django.db import migrations

KEY = "quick_start_basics_only"


def seed(apps, schema_editor):
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    FeatureFlag.objects.get_or_create(
        key=KEY,
        defaults={
            "label": "Send ideas with just the basics",
            "description": (
                "Quick-start ideas for General ideas can be sent with a title, name and phone. Officers see which "
                "answers are still missing. Switch off to ask for the full form before Send."
            ),
            "group": "ideas",
            "enabled": True,
            "is_public": True,
            "coming_soon": False,
            "ordering": 45,
        },
    )


def unseed(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key=KEY).delete()


class Migration(migrations.Migration):
    dependencies = [("platform_config", "0002_seed_feature_flags")]

    operations = [migrations.RunPython(seed, unseed)]
