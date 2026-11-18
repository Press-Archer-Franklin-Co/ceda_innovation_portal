
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('workflow', '0004_workflowstep_evaluation_round_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='workflowstep',
            name='execution_mode',
            field=models.CharField(choices=[('sequential', 'Sequential'), ('parallel_all', 'Parallel All'), ('parallel_any', 'Parallel Any'), ('parallel_minimum', 'Parallel Minimum')], default='sequential', max_length=30),
        ),
        migrations.AddField(
            model_name='workflowstep',
            name='minimum_completions_required',
            field=models.PositiveIntegerField(default=1),
        ),
    ]
