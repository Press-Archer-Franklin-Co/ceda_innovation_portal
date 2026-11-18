from django.db import migrations, models


def backfill_snapshots(apps, schema_editor):
    CriterionScore = apps.get_model("evaluation", "CriterionScore")
    for score in CriterionScore.objects.select_related(
        "criterion",
        "stage_criterion",
        "marking_criteria_item",
    ).iterator():
        name = ""
        max_score = None
        if score.criterion_id:
            name = score.criterion.name
            max_score = score.criterion.max_score
        elif score.stage_criterion_id:
            name = score.stage_criterion.name
            max_score = score.stage_criterion.max_score
        elif score.marking_criteria_item_id:
            name = score.marking_criteria_item.name
            max_score = score.marking_criteria_item.max_score
        CriterionScore.objects.filter(id=score.id).update(
            criterion_name_snapshot=name,
            criterion_max_score_snapshot=max_score,
        )


def clear_snapshots(apps, schema_editor):
    CriterionScore = apps.get_model("evaluation", "CriterionScore")
    CriterionScore.objects.update(
        criterion_name_snapshot="",
        criterion_max_score_snapshot=None,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("evaluation", "0005_timed_review_windows"),
    ]

    operations = [
        migrations.AddField(
            model_name="criterionscore",
            name="criterion_name_snapshot",
            field=models.CharField(blank=True, max_length=255),
        ),
        migrations.AddField(
            model_name="criterionscore",
            name="criterion_max_score_snapshot",
            field=models.DecimalField(blank=True, decimal_places=2, max_digits=8, null=True),
        ),
        migrations.RunPython(backfill_snapshots, clear_snapshots),
    ]
