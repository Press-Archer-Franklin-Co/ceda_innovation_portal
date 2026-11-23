"""Remove the public "Similar ideas" switch (23 Nov).

Only officers see similar ideas (Nshathisi's data protection rule), so the website no longer
searches them and public-config no longer lists the switch. The officer tool sits behind the
AI helper settings instead.

Reversible: the reverse step brings the row back, switched off.
"""

from django.db import migrations

KEY = "similar_ideas"


def remove(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key=KEY).delete()


def restore(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.get_or_create(
        key=KEY,
        defaults={
            "label": "Similar ideas",
            "description": "Show similar ideas while someone writes theirs.",
            "group": "ideas",
            "enabled": False,
            "is_public": True,
            "coming_soon": False,
        },
    )


class Migration(migrations.Migration):
    dependencies = [("platform_config", "0007_guest_contact_code_flag")]

    operations = [migrations.RunPython(remove, restore)]
