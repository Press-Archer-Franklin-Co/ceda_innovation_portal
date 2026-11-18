
import django.db.models.deletion
import uuid
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('programs', '0001_initial'),
        ('submissions', '0001_initial'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='FinalDecision',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('decision', models.CharField(choices=[('approved', 'Approved'), ('rejected', 'Rejected'), ('finalist', 'Finalist'), ('winner', 'Winner'), ('selected_for_hackathon', 'Selected For Hackathon'), ('closed', 'Closed')], max_length=40)),
                ('rationale', models.TextField()),
                ('decided_at', models.DateTimeField(auto_now_add=True)),
                ('approved_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisions_approved', to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='decisions_made', to=settings.AUTH_USER_MODEL)),
                ('submission', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='decision_record', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ModerationRecord',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('rationale', models.TextField()),
                ('variance_detected', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('adjustment_metadata', models.JSONField(blank=True, default=dict)),
                ('moderated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='moderation_records', to='submissions.submission')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='Rubric',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('active', models.BooleanField(default=True)),
                ('version', models.PositiveIntegerField(default=1)),
                ('total_weight', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('program_type', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='rubrics', to='programs.programtype')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='EvaluationRound',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('required_judges', models.PositiveIntegerField(default=3)),
                ('variance_threshold', models.DecimalField(decimal_places=2, default=15, max_digits=5)),
                ('active', models.BooleanField(default=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='evaluation_rounds', to='programs.program')),
                ('rubric', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='evaluation_rounds', to='evaluation.rubric')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='RubricCriterion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('weight', models.DecimalField(decimal_places=2, max_digits=8)),
                ('min_score', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('max_score', models.DecimalField(decimal_places=2, max_digits=5)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('rubric', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='criteria', to='evaluation.rubric')),
            ],
            options={
                'ordering': ('ordering',),
            },
        ),
        migrations.CreateModel(
            name='RubricVersion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('version', models.PositiveIntegerField()),
                ('snapshot', models.JSONField(blank=True, default=dict)),
                ('rubric', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='versions', to='evaluation.rubric')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='ScoreSheet',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('status', models.CharField(choices=[('draft', 'Draft'), ('submitted', 'Submitted'), ('locked', 'Locked')], default='draft', max_length=20)),
                ('total_score', models.DecimalField(decimal_places=2, default=0, max_digits=8)),
                ('submitted_at', models.DateTimeField(blank=True, null=True)),
                ('evaluation_round', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='score_sheets', to='evaluation.evaluationround')),
                ('judge', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='score_sheets', to=settings.AUTH_USER_MODEL)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='score_sheets', to='submissions.submission')),
            ],
            options={
                'unique_together': {('submission', 'judge', 'evaluation_round')},
            },
        ),
        migrations.CreateModel(
            name='JudgeComment',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('comment', models.TextField()),
                ('score_sheet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='judge_comments', to='evaluation.scoresheet')),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.CreateModel(
            name='CriterionScore',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('raw_score', models.DecimalField(decimal_places=2, max_digits=8)),
                ('weighted_score', models.DecimalField(decimal_places=2, max_digits=8)),
                ('comment', models.TextField(blank=True)),
                ('criterion', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='criterion_scores', to='evaluation.rubriccriterion')),
                ('score_sheet', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='criterion_scores', to='evaluation.scoresheet')),
            ],
            options={
                'unique_together': {('score_sheet', 'criterion')},
            },
        ),
    ]
