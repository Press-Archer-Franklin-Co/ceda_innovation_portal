
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('submissions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='DocumentCategory',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=120, unique=True)),
                ('code', models.CharField(max_length=50, unique=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='SubmissionDocument',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('document_type', models.CharField(choices=[('file', 'File'), ('url', 'URL')], default='file', max_length=20)),
                ('file', models.FileField(blank=True, upload_to='submission_documents/')),
                ('external_url', models.URLField(blank=True)),
                ('original_filename', models.CharField(blank=True, max_length=255)),
                ('version_number', models.PositiveIntegerField(default=1)),
                ('is_latest', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=True)),
                ('category', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='documents', to='documents.documentcategory')),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='submissions.submission')),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='DocumentVersion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version_number', models.PositiveIntegerField()),
                ('file', models.FileField(blank=True, upload_to='submission_documents/versions/')),
                ('external_url', models.URLField(blank=True)),
                ('uploaded_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('document', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='documents.submissiondocument')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
