
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
            name='OrganizationProfile',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('legal_name', models.CharField(max_length=255)),
                ('registration_number', models.CharField(blank=True, max_length=100)),
                ('sector', models.CharField(blank=True, max_length=150)),
                ('website', models.URLField(blank=True)),
                ('address', models.TextField(blank=True)),
                ('region', models.CharField(blank=True, max_length=120)),
                ('contact_person', models.CharField(blank=True, max_length=255)),
                ('owner', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='organization_profiles', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [models.Index(fields=['legal_name'], name='organizatio_legal_n_8aef8c_idx'), models.Index(fields=['registration_number'], name='organizatio_registr_4d0b2c_idx')],
            },
        ),
    ]
