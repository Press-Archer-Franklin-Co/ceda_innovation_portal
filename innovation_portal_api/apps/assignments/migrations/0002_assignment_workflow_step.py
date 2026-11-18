
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('assignments', '0001_initial'),
        ('workflow', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='assignment',
            name='workflow_step',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assignments', to='workflow.workflowstep'),
        ),
    ]
