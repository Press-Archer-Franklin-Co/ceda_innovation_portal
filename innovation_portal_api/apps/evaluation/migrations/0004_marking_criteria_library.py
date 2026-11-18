
import django.db.models.deletion
import uuid
from decimal import Decimal
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('evaluation', '0003_stagecriterion_stageevaluationconfig_and_more'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='stageevaluationconfig',
            name='rubric',
            field=models.ForeignKey(blank=True, help_text='Legacy: reuse a programme-level rubric template.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stage_configs', to='evaluation.rubric'),
        ),
        migrations.CreateModel(
            name='MarkingCriteria',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='marking_criteria_created', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'verbose_name_plural': 'Marking criteria',
                'ordering': ('title',),
            },
        ),
        migrations.AddField(
            model_name='stageevaluationconfig',
            name='marking_criteria',
            field=models.ForeignKey(blank=True, help_text='Reusable marking criteria from the library. Preferred over custom criteria.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stage_configs', to='evaluation.markingcriteria'),
        ),
        migrations.CreateModel(
            name='MarkingCriteriaItem',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True, db_index=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('name', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True, help_text='Guidance shown to the reviewer.')),
                ('max_score', models.DecimalField(decimal_places=2, max_digits=5)),
                ('min_score', models.DecimalField(decimal_places=2, default=Decimal('0'), max_digits=5)),
                ('weight', models.DecimalField(decimal_places=2, default=Decimal('1.00'), max_digits=8)),
                ('ordering', models.PositiveIntegerField(default=1)),
                ('comment_required_below', models.DecimalField(blank=True, decimal_places=2, help_text='Require a comment when the raw score falls below this threshold.', max_digits=5, null=True)),
                ('criteria', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='items', to='evaluation.markingcriteria')),
            ],
            options={
                'ordering': ('ordering',),
            },
        ),
        migrations.AddField(
            model_name='criterionscore',
            name='marking_criteria_item',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='criterion_scores', to='evaluation.markingcriteriaitem'),
        ),
        migrations.AddConstraint(
            model_name='criterionscore',
            constraint=models.UniqueConstraint(condition=models.Q(('marking_criteria_item__isnull', False)), fields=('score_sheet', 'marking_criteria_item'), name='uq_criterion_score_library'),
        ),
    ]
