"""S2: built-in roles become system roles, and today's capability map moves into the database.

The map is copied here as it was on 20 Nov 2026 (after S1), so later code changes do not
rewrite history. Nobody's access changes on day one; tests compare the database with
apps/core/capabilities.CAPABILITIES. Reverse deletes the rows this migration made.
"""

from django.db import migrations

SYSTEM_ROLES = {
    "innovator": "Innovator",
    "innovation_officer": "Innovation Officer",
    "innovation_manager": "Innovation Manager",
    "innovation_analyst": "Innovation Analyst",
    "staff_member": "Staff Member",
    "judge": "Judge",
    "specialist": "Specialist",
    "exo": "EXO",
    "mentor": "Mentor",
    "administrator": "Administrator",
    "management_viewer": "Management Viewer",
}

DAY_ONE_MAP = {
    "dashboard.view": ['administrator', 'innovation_officer', 'management_viewer'],
    "analytics.view": ['administrator', 'innovation_officer', 'management_viewer'],
    "reports.export": ['administrator', 'innovation_officer', 'management_viewer'],
    "audit.view": ['administrator', 'innovation_officer', 'management_viewer'],
    "entries.review": ['administrator', 'exo', 'innovation_analyst', 'innovation_manager', 'innovation_officer', 'judge', 'mentor', 'specialist', 'staff_member'],
    "entries.search": ['administrator', 'innovation_manager', 'innovation_officer'],
    "entries.score": ['judge'],
    "entries.assign": ['administrator', 'innovation_officer'],
    "challenges.manage": ['administrator', 'innovation_officer'],
    "forms.manage": ['administrator', 'innovation_officer'],
    "criteria.manage": ['administrator', 'innovation_officer'],
    "content.edit": ['administrator', 'innovation_manager', 'innovation_officer'],
    "content.approve": ['administrator', 'innovation_manager'],
    "users.manage": ['administrator'],
    "settings.manage": ['administrator'],
}


def seed(apps, schema_editor):
    Role = apps.get_model("accounts", "Role")
    RoleCapability = apps.get_model("accounts", "RoleCapability")
    for code, name in SYSTEM_ROLES.items():
        role, _ = Role.objects.get_or_create(code=code, defaults={"name": name})
        Role.objects.filter(pk=role.pk).update(is_system=True, is_active=True)
    roles = {role.code: role for role in Role.objects.filter(code__in=SYSTEM_ROLES)}
    for capability, codes in DAY_ONE_MAP.items():
        for code in codes:
            RoleCapability.objects.get_or_create(role=roles[code], capability=capability)


def unseed(apps, schema_editor):
    apps.get_model("accounts", "RoleCapability").objects.all().delete()
    apps.get_model("accounts", "Role").objects.update(is_system=False)


class Migration(migrations.Migration):
    dependencies = [("accounts", "0011_roles_and_approvals")]

    operations = [migrations.RunPython(seed, unseed)]
