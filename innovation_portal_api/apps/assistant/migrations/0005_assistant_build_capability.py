"""Copilot B2: assistant.build for Innovation manager and Administrator. Reversible."""

from django.db import migrations

ROLES = ["administrator", "innovation_manager"]


def seed(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for role in Role.objects.filter(code__in=ROLES):
        RoleCapability.objects.get_or_create(role=role, capability="assistant.build")


def unseed(apps, schema_editor):
    apps.get_model("accounts", "RoleCapability").objects.filter(capability="assistant.build").delete()


class Migration(migrations.Migration):
    dependencies = [("assistant", "0004_judges_get_hints")]

    operations = [migrations.RunPython(seed, unseed)]
