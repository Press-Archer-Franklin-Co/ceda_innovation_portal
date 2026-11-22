"""C2: give channels.manage to the roles in the capability map, and take the WhatsApp and
USSD switches out of "coming soon" (they stay off until an admin turns them on).

Reversible: the reverse removes the rows added here and puts "coming soon" back.
"""

from django.db import migrations

ROLES = ["innovation_officer", "administrator"]
FLAGS = {
    "whatsapp_messages": "WhatsApp journeys and messages. Needs at least one active WhatsApp connection.",
    "ussd": "Let people use the portal from a USSD menu. Needs at least one active USSD connection.",
}
OLD_DESCRIPTIONS = {"whatsapp_messages": "Send WhatsApp messages.", "ussd": "Let people use the portal from a USSD menu."}


def forward(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for role in Role.objects.filter(code__in=ROLES):
        RoleCapability.objects.get_or_create(role=role, capability="channels.manage")
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    for key, description in FLAGS.items():
        FeatureFlag.objects.filter(key=key).update(coming_soon=False, description=description)


def backward(apps, schema_editor):
    apps.get_model("accounts", "RoleCapability").objects.filter(capability="channels.manage").delete()
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    for key, description in OLD_DESCRIPTIONS.items():
        FeatureFlag.objects.filter(key=key).update(coming_soon=True, enabled=False, description=description)


class Migration(migrations.Migration):
    dependencies = [
        ("channels", "0001_initial"),
        ("accounts", "0012_seed_roles_and_capabilities"),
        ("platform_config", "0004_channels_ussd_kind_multi_active"),
    ]

    operations = [migrations.RunPython(forward, backward)]
