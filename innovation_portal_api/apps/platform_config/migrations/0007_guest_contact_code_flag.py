"""Add "Confirm a guest's phone or email with a code before they send" (23 Nov), off by default.

The row is needed: public_config() reads the public switches from the database.
Reversible: the reverse step deletes only this flag.
"""

from django.db import migrations

KEY = "guest_contact_code"


def seed(apps, schema_editor):
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    FeatureFlag.objects.get_or_create(
        key=KEY,
        defaults={
            "label": "Confirm a guest's phone or email with a code before they send",
            "description": (
                "People who send an idea without an account must first confirm the email or phone they gave with a "
                "one-time code. Off: no code is needed."
            ),
            "group": "ideas",
            "enabled": False,
            "is_public": True,
            "coming_soon": False,
            "ordering": 46,
        },
    )


def unseed(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key=KEY).delete()


class Migration(migrations.Migration):
    dependencies = [("platform_config", "0006_ai_several_active")]

    operations = [migrations.RunPython(seed, unseed)]
