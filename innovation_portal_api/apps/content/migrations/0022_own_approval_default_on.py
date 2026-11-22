"""Approving your own change is a switch Nshathisi controls in Approval steps (3.29). On by default, so one
person can make a change and approve it on the demo; switching it off needs a second approver.

0021 set it off on existing flows. This puts it back on and makes on the default. Reverse leaves the data as it is.
"""

from django.db import migrations, models


def own_change_on(apps, schema_editor):
    apps.get_model("content", "ApprovalFlow").objects.update(approvers_can_approve_own_work=True)


class Migration(migrations.Migration):
    dependencies = [("content", "0021_u9_staff_admin")]

    operations = [
        migrations.AlterField(
            model_name="approvalflow",
            name="approvers_can_approve_own_work",
            field=models.BooleanField(default=True, help_text="People who can approve a step may approve their own change. On by default; switch it off to need a second approver."),
        ),
        migrations.RunPython(own_change_on, migrations.RunPython.noop),
    ]
