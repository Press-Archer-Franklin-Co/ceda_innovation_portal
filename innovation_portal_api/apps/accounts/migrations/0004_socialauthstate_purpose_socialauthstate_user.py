
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0003_socialauthstate_socialaccount'),
    ]

    operations = [
        migrations.AddField(
            model_name='socialauthstate',
            name='purpose',
            field=models.CharField(choices=[('login', 'Login'), ('link', 'Link')], default='login', max_length=20),
        ),
        migrations.AddField(
            model_name='socialauthstate',
            name='user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='social_auth_states', to=settings.AUTH_USER_MODEL),
        ),
    ]
