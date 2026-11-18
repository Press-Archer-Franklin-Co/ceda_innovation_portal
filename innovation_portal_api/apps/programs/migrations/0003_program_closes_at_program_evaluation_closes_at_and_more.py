
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0002_submissionform_code_submissionform_version_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='program',
            name='closes_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='program',
            name='evaluation_closes_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='program',
            name='evaluation_opens_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='program',
            name='opens_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='program',
            name='results_publish_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
