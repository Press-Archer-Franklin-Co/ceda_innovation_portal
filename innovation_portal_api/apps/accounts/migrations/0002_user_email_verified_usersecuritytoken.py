
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='email_verified',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='UserSecurityToken',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('purpose', models.CharField(choices=[('password_reset', 'Password Reset'), ('email_verification', 'Email Verification')], max_length=40)),
                ('token', models.CharField(max_length=64, unique=True)),
                ('expires_at', models.DateTimeField()),
                ('used_at', models.DateTimeField(blank=True, null=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='security_tokens', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['user', 'purpose'], name='accounts_us_user_id_bea013_idx'), models.Index(fields=['token'], name='accounts_us_token_d59425_idx')],
            },
        ),
    ]
