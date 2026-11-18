from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("workflow", "0012_unify_node_form_bindings"),
    ]

    operations = [
        migrations.AlterField(
            model_name="workflowstep",
            name="role_required",
            field=models.CharField(
                blank=True,
                default="",
                max_length=50,
                choices=[
                    ("innovator", "Innovator"),
                    ("innovation_manager", "Innovation Manager"),
                    ("innovation_analyst", "Innovation Analyst"),
                    ("innovation_officer", "Innovation Officer"),
                    ("staff_member", "Staff Member"),
                    ("specialist", "Specialist"),
                    ("judge", "Judge"),
                    ("mentor", "Mentor"),
                    ("exo", "EXO"),
                    ("administrator", "Administrator"),
                    ("management_viewer", "Management Viewer"),
                ],
            ),
        ),
        migrations.AlterField(
            model_name="workflowstep",
            name="submission_status",
            field=models.CharField(
                blank=True,
                default="",
                max_length=40,
            ),
        ),
    ]
