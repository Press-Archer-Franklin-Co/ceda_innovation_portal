
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0001_initial'),
        ('submissions', '0002_alter_submission_current_status_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='submissiondocument',
            name='application_draft',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='submissions.applicationdraft'),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='field_key',
            field=models.SlugField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='metadata',
            field=models.JSONField(blank=True, default=dict),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='mime_type',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='size_bytes',
            field=models.PositiveBigIntegerField(default=0),
        ),
        migrations.AlterField(
            model_name='submissiondocument',
            name='submission',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='submissions.submission'),
        ),
    ]
