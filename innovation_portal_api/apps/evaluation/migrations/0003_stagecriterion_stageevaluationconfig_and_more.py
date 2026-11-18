
import django.db.models.deletion
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluation', '0002_scoresheet_is_final_scoresheet_overall_comment'),
        ('submissions', '0004_submission_response_snapshots'),
        ('workflow', '0012_unify_node_form_bindings'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='StageCriterion',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, help_text='Guidance shown to the reviewer.')),
                ('max_score', models.DecimalField(decimal_places=2, help_text='Maximum score a reviewer can award for this criterion.', max_digits=5)),
                ('min_score', models.DecimalField(decimal_places=2, default=0, max_digits=5)),
                ('weight', models.DecimalField(decimal_places=2, default=Decimal('1.00'), help_text='Weight for weighted-average aggregation.', max_digits=8)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('comment_required_below', models.DecimalField(blank=True, decimal_places=2, help_text='Require a reviewer comment when the raw score falls below this threshold.', max_digits=5, null=True)),
            ],
            options={
                'ordering': ('ordering',),
            },
        ),
        migrations.CreateModel(
            name='StageEvaluationConfig',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('required_reviewer_count', models.PositiveIntegerField(default=1, help_text='Number of independent reviewers required before a decision is made.')),
                ('aggregation_method', models.CharField(choices=[('average', 'Average'), ('min', 'Minimum'), ('max', 'Maximum'), ('median', 'Median')], default='average', max_length=20)),
                ('threshold_reject_below', models.DecimalField(decimal_places=2, default=Decimal('40.00'), help_text='Aggregate score % strictly below this value → automatic rejection.', max_digits=5)),
                ('threshold_pass_above', models.DecimalField(decimal_places=2, default=Decimal('70.00'), help_text='Aggregate score % at or above this value → advance to next stage. Between reject and pass → return for correction.', max_digits=5)),
                ('blind_scoring', models.BooleanField(default=True, help_text='Prevent reviewers from seeing peer scores before submitting their own.')),
                ('allow_applicant_feedback', models.BooleanField(default=True, help_text='Allow applicants to see criterion-level feedback after a decision.')),
                ('max_score_override', models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
            ],
            options={
                'abstract': False,
            },
        ),
        migrations.AlterUniqueTogether(
            name='criterionscore',
            unique_together=set(),
        ),
        migrations.AlterUniqueTogether(
            name='scoresheet',
            unique_together=set(),
        ),
        migrations.AlterField(
            model_name='criterionscore',
            name='criterion',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='criterion_scores', to='evaluation.rubriccriterion'),
        ),
        migrations.AlterField(
            model_name='scoresheet',
            name='evaluation_round',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='score_sheets', to='evaluation.evaluationround'),
        ),
        migrations.CreateModel(
            name='ReviewCycle',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('cycle_number', models.PositiveIntegerField(default=1)),
                ('status', models.CharField(choices=[('open', 'Open'), ('completed', 'Completed'), ('cancelled', 'Cancelled')], default='open', max_length=20)),
                ('outcome', models.CharField(choices=[('pending', 'Pending'), ('pass', 'Pass / Advance'), ('return_for_correction', 'Return for Correction'), ('reject', 'Reject')], default='pending', max_length=30)),
                ('aggregate_score', models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True)),
                ('aggregate_pct', models.DecimalField(blank=True, decimal_places=2, help_text='Aggregate score as a percentage of max possible score.', max_digits=5, null=True)),
                ('closed_at', models.DateTimeField(blank=True, null=True)),
                ('decision_note', models.TextField(blank=True)),
                ('submission', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='review_cycles', to='submissions.submission')),
                ('workflow_step', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='review_cycles', to='workflow.workflowstep')),
            ],
            options={
                'ordering': ('submission', 'cycle_number'),
            },
        ),
        migrations.AddField(
            model_name='scoresheet',
            name='review_cycle',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='scorecards', to='evaluation.reviewcycle'),
        ),
        migrations.AddConstraint(
            model_name='scoresheet',
            constraint=models.UniqueConstraint(condition=models.Q(('review_cycle__isnull', True), ('evaluation_round__isnull', False)), fields=('submission', 'judge', 'evaluation_round'), name='uq_scoresheet_legacy'),
        ),
        migrations.AddConstraint(
            model_name='scoresheet',
            constraint=models.UniqueConstraint(condition=models.Q(('review_cycle__isnull', False)), fields=('submission', 'judge', 'review_cycle'), name='uq_scoresheet_per_cycle'),
        ),
        migrations.AddField(
            model_name='criterionscore',
            name='stage_criterion',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='criterion_scores', to='evaluation.stagecriterion'),
        ),
        migrations.AddConstraint(
            model_name='criterionscore',
            constraint=models.UniqueConstraint(condition=models.Q(('criterion__isnull', False)), fields=('score_sheet', 'criterion'), name='uq_criterion_score_rubric'),
        ),
        migrations.AddConstraint(
            model_name='criterionscore',
            constraint=models.UniqueConstraint(condition=models.Q(('stage_criterion__isnull', False)), fields=('score_sheet', 'stage_criterion'), name='uq_criterion_score_stage'),
        ),
        migrations.AddField(
            model_name='stageevaluationconfig',
            name='created_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stage_configs_created', to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name='stageevaluationconfig',
            name='rubric',
            field=models.ForeignKey(blank=True, help_text='Reuse an existing rubric template. Leave blank to use custom criteria.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stage_configs', to='evaluation.rubric'),
        ),
        migrations.AddField(
            model_name='stageevaluationconfig',
            name='workflow_step',
            field=models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='evaluation_config', to='workflow.workflowstep'),
        ),
        migrations.AddField(
            model_name='stagecriterion',
            name='stage_config',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='custom_criteria', to='evaluation.stageevaluationconfig'),
        ),
        migrations.AddField(
            model_name='reviewcycle',
            name='stage_config',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='review_cycles', to='evaluation.stageevaluationconfig'),
        ),
        migrations.AddConstraint(
            model_name='reviewcycle',
            constraint=models.UniqueConstraint(fields=('submission', 'workflow_step', 'cycle_number'), name='uq_review_cycle_per_step'),
        ),
    ]
