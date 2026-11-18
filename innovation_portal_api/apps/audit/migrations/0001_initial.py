
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
            name='ActivityLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action_type', models.CharField(max_length=120)),
                ('description', models.TextField()),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='activity_logs', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('action_type', models.CharField(db_index=True, max_length=120)),
                ('target_model', models.CharField(db_index=True, max_length=120)),
                ('target_id', models.CharField(db_index=True, max_length=120)),
                ('before_state', models.JSONField(blank=True, default=dict)),
                ('after_state', models.JSONField(blank=True, default=dict)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('actor', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['target_model', 'target_id', 'created_at'], name='audit_audit_target__b40aca_idx')],
            },
        ),
    ]
