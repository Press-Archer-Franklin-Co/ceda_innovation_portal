
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluation', '0007_scoresheet_submission_snapshot'),
        ('programs', '0008_program_max_entries_per_person'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name='program',
            name='marking_criteria',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='challenge_programs', to='evaluation.markingcriteria'),
        ),
        migrations.CreateModel(
            name='ChallengeJudge',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('email', models.EmailField(max_length=254)),
                ('token', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('invited_at', models.DateTimeField(blank=True, null=True)),
                ('accepted_at', models.DateTimeField(blank=True, null=True)),
                ('last_reminded_at', models.DateTimeField(blank=True, null=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='challenge_judges', to='programs.program')),
                ('user', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='challenge_judgeships', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'ordering': ('created_at',),
                'constraints': [models.UniqueConstraint(fields=('program', 'email'), name='uq_challenge_judge_program_email')],
            },
        ),
    ]
