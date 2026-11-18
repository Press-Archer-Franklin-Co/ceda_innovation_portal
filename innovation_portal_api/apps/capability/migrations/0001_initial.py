
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
            name='TalentPoolTag',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=120, unique=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CapabilityAssessment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('notes', models.TextField(blank=True)),
                ('assessed_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='capability_assessments', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CapabilityScore',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('dimension', models.CharField(max_length=120)),
                ('score', models.DecimalField(decimal_places=2, max_digits=5)),
                ('assessment', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='scores', to='capability.capabilityassessment')),
            ],
            options={
                'abstract': False,
            },
        ),
    ]
