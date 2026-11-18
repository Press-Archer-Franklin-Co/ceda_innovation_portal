from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("evaluation", "0004_marking_criteria_library"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AddField(
            model_name="stageevaluationconfig",
            name="review_mode",
            field=models.CharField(
                choices=[
                    ("fixed_count", "Fixed reviewer count"),
                    ("time_window", "Timed review window"),
                ],
                default="fixed_count",
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name="stageevaluationconfig",
            name="review_window_hours",
            field=models.PositiveIntegerField(
                default=0,
                help_text="For timed review windows, number of hours before the cycle closes.",
            ),
        ),
        migrations.AddField(
            model_name="stageevaluationconfig",
            name="minimum_reviews_required",
            field=models.PositiveIntegerField(
                default=1,
                help_text="For timed review windows, minimum submitted reviews needed before auto-decision.",
            ),
        ),
        migrations.AddField(
            model_name="stageevaluationconfig",
            name="maximum_reviews_allowed",
            field=models.PositiveIntegerField(
                blank=True,
                help_text="For timed review windows, maximum reviewers that may claim this step.",
                null=True,
            ),
        ),
        migrations.AddField(
            model_name="reviewcycle",
            name="closes_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reviewcycle",
            name="extended_count",
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name="reviewcycle",
            name="last_extended_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="reviewcycle",
            name="extension_reason",
            field=models.TextField(blank=True),
        ),
        migrations.AddField(
            model_name="reviewcycle",
            name="last_extended_by",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="review_cycles_extended",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.AlterField(
            model_name="reviewcycle",
            name="status",
            field=models.CharField(
                choices=[
                    ("open", "Open"),
                    ("completed", "Completed"),
                    ("needs_attention", "Needs Attention"),
                    ("cancelled", "Cancelled"),
                ],
                default="open",
                max_length=20,
            ),
        ),
    ]
