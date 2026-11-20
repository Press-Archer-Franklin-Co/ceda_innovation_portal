"""S2: the default website approval flow is today's behaviour: one step, content.approve, one approval, all languages.

Reverse deletes the flow.
"""

from django.db import migrations


def seed(apps, schema_editor):
    ApprovalFlow = apps.get_model("content", "ApprovalFlow")
    ApprovalStep = apps.get_model("content", "ApprovalStep")
    flow, created = ApprovalFlow.objects.get_or_create(key="content", defaults={"approvers_can_approve_own_work": True})
    if created or not flow.steps.exists():
        ApprovalStep.objects.create(flow=flow, order=1, name="Approval", capability="content.approve", approvals_needed=1, language="all")


def unseed(apps, schema_editor):
    apps.get_model("content", "ApprovalFlow").objects.filter(key="content").delete()


class Migration(migrations.Migration):
    dependencies = [("content", "0012_roles_and_approvals")]

    operations = [migrations.RunPython(seed, unseed)]
