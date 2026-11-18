
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0003_submissiondocument_is_current_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='submissiondocument',
            name='softexpert_document_id',
            field=models.CharField(blank=True, db_index=True, max_length=100),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='softexpert_revision_id',
            field=models.CharField(blank=True, max_length=100),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='softexpert_category',
            field=models.CharField(blank=True, max_length=50),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='storage_backend',
            field=models.CharField(choices=[('local', 'Local'), ('softexpert', 'SoftExpert')], default='local', max_length=20),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='softexpert_migrated_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='upload_status',
            field=models.CharField(
                choices=[('synced', 'Synced'), ('pending_sync', 'Pending Sync'), ('sync_failed', 'Sync Failed')],
                default='synced',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='sync_attempts',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='last_sync_error',
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='next_retry_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
