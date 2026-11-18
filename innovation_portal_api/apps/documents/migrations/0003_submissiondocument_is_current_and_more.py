
import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('documents', '0002_submissiondocument_application_draft_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='submissiondocument',
            name='is_current',
            field=models.BooleanField(db_index=True, default=True),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='replaced_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='replaces', to='documents.submissiondocument'),
        ),
        migrations.AddField(
            model_name='submissiondocument',
            name='upload_group_id',
            field=models.UUIDField(db_index=True, default=uuid.uuid4),
        ),
    ]
