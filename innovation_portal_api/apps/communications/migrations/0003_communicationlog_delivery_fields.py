
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("communications", "0002_notification_notification_type"),
    ]

    operations = [
        migrations.AddField(
            model_name="communicationlog",
            name="failure_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="last_attempt_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="notification",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="delivery_logs", to="communications.notification"),
        ),
        migrations.AddField(
            model_name="communicationlog",
            name="retry_count",
            field=models.PositiveIntegerField(default=0),
        ),
    ]
