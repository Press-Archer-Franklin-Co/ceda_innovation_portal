
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='InnovatorProfile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('national_id', models.CharField(blank=True, max_length=100)),
                ('gender', models.CharField(blank=True, max_length=50)),
                ('date_of_birth', models.DateField(blank=True, null=True)),
                ('region', models.CharField(blank=True, max_length=120)),
                ('bio', models.TextField(blank=True)),
                ('sector_interests', models.JSONField(blank=True, default=list)),
                ('skills', models.JSONField(blank=True, default=list)),
                ('certifications', models.JSONField(blank=True, default=list)),
                ('portfolio_url', models.URLField(blank=True)),
                ('linkedin_url', models.URLField(blank=True)),
                ('past_participation_summary', models.TextField(blank=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='innovator_profile', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ContactVerification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('channel', models.CharField(max_length=30)),
                ('target', models.CharField(max_length=255)),
                ('code', models.CharField(max_length=12)),
                ('is_verified', models.BooleanField(default=False)),
                ('verified_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='contact_verifications', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['user', 'channel', 'is_verified'], name='profiles_co_user_id_46235e_idx')],
            },
        ),
    ]
