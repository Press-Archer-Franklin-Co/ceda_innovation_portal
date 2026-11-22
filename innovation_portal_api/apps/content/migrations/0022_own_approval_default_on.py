from django.db import migrations, models


def own_change_on(apps, schema_editor):
    # Nshathisi (22 Nov): people may approve their own change by default; she switches it off in Approval steps
    # when a second approver is needed. Undoes 0021, which had switched it off.
    apps.get_model("content", "ApprovalFlow").objects.update(approvers_can_approve_own_work=True)


class Migration(migrations.Migration):

    dependencies = [
        ("content", "0021_u9_staff_admin"),
    ]

    operations = [
        migrations.AlterField(
            model_name="approvalflow",
            name="approvers_can_approve_own_work",
            field=models.BooleanField(default=True, help_text="People who can approve a step may approve their own change. On by default; switch it off to need a second approver."),
        ),
        migrations.RunPython(own_change_on, migrations.RunPython.noop),
    ]
