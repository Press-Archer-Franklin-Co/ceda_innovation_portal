
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('content', '0007_sitesettings_prize_money_label_solutions_deployed'),
        ('submissions', '0006_innovation_challenge_submission_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='hackathondetail',
            name='eligibility',
            field=models.TextField(blank=True, default=''),
        ),
        migrations.AddField(
            model_name='winnerspotlight',
            name='prize_amount',
            field=models.CharField(blank=True, default='', max_length=120),
        ),
        migrations.AddField(
            model_name='winnerspotlight',
            name='prize_label',
            field=models.CharField(blank=True, default='', max_length=255),
        ),
        migrations.AddField(
            model_name='winnerspotlight',
            name='submission',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='winner_spotlight', to='submissions.submission'),
        ),
    ]
