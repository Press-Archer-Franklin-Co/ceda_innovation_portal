
import apps.documents.models
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0004_submissiondocument_softexpert_fields'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='submissiondocument',
            name='archived_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='local_copy_expires_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='sha256',
            field=models.CharField(blank=True, max_length=64),
        ),
        migrations.AlterField(
            model_name='submissiondocument',
            name='file',
            field=models.FileField(blank=True, upload_to=apps.documents.models.document_upload_path),
        ),
        migrations.CreateModel(
            name='DocumentRetrievalRequest',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('retain_days', models.PositiveSmallIntegerField(default=0)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('ready', 'Ready'), ('failed', 'Failed')], db_index=True, default='pending', max_length=20)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('last_error', models.TextField(blank=True)),
                ('next_attempt_at', models.DateTimeField(blank=True, db_index=True, null=True)),
                ('deadline_at', models.DateTimeField()),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='retrieval_requests', to='documents.submissiondocument')),
                ('requested_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('-created_at',),
            },
        ),
    ]
