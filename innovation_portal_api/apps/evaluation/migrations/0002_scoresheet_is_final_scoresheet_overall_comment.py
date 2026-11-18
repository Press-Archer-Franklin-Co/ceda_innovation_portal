
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluation', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='scoresheet',
            name='is_final',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='scoresheet',
            name='overall_comment',
            field=models.TextField(blank=True),
        ),
    ]
