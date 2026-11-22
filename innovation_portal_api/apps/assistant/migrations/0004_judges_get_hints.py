"""Copilot A6: judges get assistant.hints, for the entries assigned to them only (the selector decides).

Reversible: the reverse step removes only this row.
"""

from django.db import migrations


def seed(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for role in Role.objects.filter(code="judge"):
        RoleCapability.objects.get_or_create(role=role, capability="assistant.hints")


def unseed(apps, schema_editor):
    apps.get_model("accounts", "RoleCapability").objects.filter(role__code="judge", capability="assistant.hints").delete()


class Migration(migrations.Migration):
    dependencies = [("assistant", "0003_copilot_core")]

    operations = [migrations.RunPython(seed, unseed)]
