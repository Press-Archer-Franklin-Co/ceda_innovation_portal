from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ("assignments", "0003_assignment_completed_at"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="previous_assignment",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="reassignments",
                to="assignments.assignment",
            ),
        ),
        migrations.AddField(
            model_name="assignment",
            name="reassigned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
