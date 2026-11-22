"""C1: the live_chat switch (off until an admin turns it on), conversations.reply for the roles in the
capability map, and the settings row with Innovation officers taking chats.

Reversible: the reverse removes only what this adds.
"""

from django.db import migrations

ROLES = ["innovation_officer", "innovation_manager", "administrator"]


def forward(apps, schema_editor):
    FeatureFlag = apps.get_model("platform_config", "FeatureFlag")
    FeatureFlag.objects.get_or_create(
        key="live_chat",
        defaults={
            "label": "Live chat",
            "description": "Website help chat and the staff Inbox for chats and hand-overs from WhatsApp, USSD and the AI helper.",
            "group": "messaging",
            "enabled": False,
            "is_public": True,
            "coming_soon": False,
            "ordering": 75,
        },
    )
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for role in Role.objects.filter(code__in=ROLES):
        RoleCapability.objects.get_or_create(role=role, capability="conversations.reply")
    LiveChatSettings = apps.get_model("conversations", "LiveChatSettings")
    if not LiveChatSettings.objects.exists():
        LiveChatSettings.objects.create(roles=["innovation_officer"])


def backward(apps, schema_editor):
    apps.get_model("platform_config", "FeatureFlag").objects.filter(key="live_chat").delete()
    apps.get_model("accounts", "RoleCapability").objects.filter(capability="conversations.reply").delete()


class Migration(migrations.Migration):
    dependencies = [
        ("conversations", "0001_c1_conversations"),
        ("accounts", "0013_u7_demo_accounts_auth_policy"),
        ("platform_config", "0004_channels_ussd_kind_multi_active"),
    ]

    operations = [migrations.RunPython(forward, backward)]
