
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('submissions', '0005_submissionfeedbacksnapshot'),
    ]

    operations = [
        migrations.AlterField(
            model_name='applicationdraft',
            name='submission_type',
            field=models.CharField(choices=[('idea', 'Idea'), ('hackathon_application', 'Hackathon Application'), ('innovation_challenge', 'Innovation Challenge Entry')], max_length=40),
        ),
        migrations.AlterField(
            model_name='submission',
            name='submission_type',
            field=models.CharField(choices=[('idea', 'Idea'), ('hackathon_application', 'Hackathon Application'), ('innovation_challenge', 'Innovation Challenge Entry')], max_length=40),
        ),
    ]
