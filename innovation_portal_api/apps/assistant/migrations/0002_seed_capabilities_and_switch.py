"""C3: give the AI helper capabilities to their day-one roles, and add the ai_helper switch (off).

Reversible: the reverse step removes only the rows this migration added.
"""

from django.db import migrations

CAPABILITIES = {
    "assistant.hints": ["administrator", "innovation_manager", "innovation_officer"],
    "assistant.manage": ["administrator"],
}
FLAG = {
    "key": "ai_helper",
    "label": "AI helper",
    "description": (
        "Claude guides innovators, gives officers hints and answers questions about the portal. "
        "Needs an active, tested Claude connection."
    ),
    "group": "integrations",
    "enabled": False,
    "is_public": True,
    "coming_soon": False,
    "ordering": 20,
}


def seed(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for capability, codes in CAPABILITIES.items():
        for role in Role.objects.filter(code__in=codes):
            RoleCapability.objects.get_or_create(role=role, capability=capability)
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    FeatureFlag.objects.get_or_create(key=FLAG["key"], defaults={k: v for k, v in FLAG.items() if k != "key"})


def unseed(apps, schema_editor):
    apps.get_model("accounts", "RoleCapability").objects.filter(capability__in=list(CAPABILITIES)).delete()
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key=FLAG["key"]).delete()


class Migration(migrations.Migration):
    dependencies = [
        ("assistant", "0001_initial"),
        ("accounts", "0012_seed_roles_and_capabilities"),
        ("platform_config", "0003_quick_start_basics_only_flag"),
    ]

    operations = [migrations.RunPython(seed, unseed)]
