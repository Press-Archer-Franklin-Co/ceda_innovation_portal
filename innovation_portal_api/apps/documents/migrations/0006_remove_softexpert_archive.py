
from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0005_document_storage_lifecycle'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='submissiondocument',
            name='archived_at',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='last_sync_error',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='local_copy_expires_at',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='next_retry_at',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='softexpert_category',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='softexpert_document_id',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='softexpert_migrated_at',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='softexpert_revision_id',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='storage_backend',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='sync_attempts',
        ),
        migrations.RemoveField(
            model_name='submissiondocument',
            name='upload_status',
        ),
        migrations.DeleteModel(
            name='DocumentRetrievalRequest',
        ),
    ]
