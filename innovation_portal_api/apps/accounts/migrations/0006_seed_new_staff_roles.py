"""
Data migration: seed new staff role types.
Adds Innovation Manager, Innovation Analyst, Staff Member, Specialist, and EXO
roles to the accounts_role table so users can be assigned these roles.
"""
from django.db import migrations

NEW_ROLES = [
    ("innovation_manager", "Innovation Manager"),
    ("innovation_analyst", "Innovation Analyst"),
    ("staff_member", "Staff Member"),
    ("specialist", "Specialist"),
    ("exo", "EXO"),
]


def seed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    for code, name in NEW_ROLES:
        Role.objects.get_or_create(code=code, defaults={"name": name})


def unseed_roles(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    codes = [r[0] for r in NEW_ROLES]
    Role.objects.filter(code__in=codes).delete()


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0005_user_primary_auth_method"),
    ]

    operations = [
        migrations.RunPython(seed_roles, reverse_code=unseed_roles),
    ]
