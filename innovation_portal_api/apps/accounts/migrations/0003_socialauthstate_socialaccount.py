
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_user_email_verified_usersecuritytoken'),
    ]

    operations = [
        migrations.CreateModel(
            name='SocialAuthState',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.CharField(choices=[('google', 'Google'), ('github', 'GitHub'), ('microsoft', 'Microsoft'), ('linkedin', 'LinkedIn')], max_length=30)),
                ('state', models.CharField(db_index=True, max_length=120, unique=True)),
                ('nonce', models.CharField(blank=True, max_length=120)),
                ('redirect_uri', models.URLField()),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'indexes': [models.Index(fields=['provider', 'state'], name='accounts_so_provide_d921b6_idx'), models.Index(fields=['expires_at'], name='accounts_so_expires_e850a1_idx')],
            },
        ),
        migrations.CreateModel(
            name='SocialAccount',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('provider', models.CharField(choices=[('google', 'Google'), ('github', 'GitHub'), ('microsoft', 'Microsoft'), ('linkedin', 'LinkedIn')], max_length=30)),
                ('provider_user_id', models.CharField(max_length=255)),
                ('provider_email', models.EmailField(blank=True, max_length=254)),
                ('provider_email_verified', models.BooleanField(default=False)),
                ('last_login_at', models.DateTimeField(blank=True, null=True)),
                ('extra_data', models.JSONField(blank=True, default=dict)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='social_accounts', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['provider', 'provider_email'], name='accounts_so_provide_ebd436_idx'), models.Index(fields=['user', 'provider'], name='accounts_so_user_id_0a462a_idx')],
                'constraints': [models.UniqueConstraint(fields=('provider', 'provider_user_id'), name='uq_social_provider_user'), models.UniqueConstraint(fields=('user', 'provider'), name='uq_user_social_provider')],
            },
        ),
    ]
