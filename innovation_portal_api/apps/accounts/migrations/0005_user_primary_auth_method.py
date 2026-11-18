
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0004_socialauthstate_purpose_socialauthstate_user'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='primary_auth_method',
            field=models.CharField(blank=True, choices=[('password', 'Password'), ('google', 'Google'), ('github', 'GitHub'), ('microsoft', 'Microsoft')], default='', max_length=30),
        ),
    ]
