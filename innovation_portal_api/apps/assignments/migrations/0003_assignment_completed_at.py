
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("assignments", "0002_assignment_workflow_step"),
    ]

    operations = [
        migrations.AddField(
            model_name="assignment",
            name="completed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
