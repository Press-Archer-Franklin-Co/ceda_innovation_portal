
import uuid

from django.db import migrations, models


def add_innovation_challenge_type(apps, schema_editor):
    ProgramType = apps.get_model("programs", "ProgramType")
    if not ProgramType.objects.filter(code="innovation_challenge").exists():
        ProgramType.objects.create(
            id=uuid.uuid4(),
            name="Innovation Challenge",
            code="innovation_challenge",
            description="Challenge for CEDA staff, the public, or both, with judged entries and automatically announced winners.",
        )


def remove_innovation_challenge_type(apps, schema_editor):
    ProgramType = apps.get_model("programs", "ProgramType")
    ProgramType.objects.filter(code="innovation_challenge", programs__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('programs', '0006_submissionformfield_link_url'),
    ]

    operations = [
        migrations.AddField(
            model_name='program',
            name='audience',
            field=models.CharField(choices=[('internal', 'Internal (CEDA staff only)'), ('public', 'Public (non-CEDA only)'), ('both', 'Internal and public')], default='both', max_length=20),
        ),
        migrations.AddField(
            model_name='program',
            name='results_announced_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='program',
            name='results_hold_reason',
            field=models.TextField(blank=True),
        ),
        migrations.AlterField(
            model_name='programtype',
            name='code',
            field=models.CharField(choices=[('idea', 'Idea'), ('hackathon', 'Hackathon'), ('challenge_call', 'Challenge Call'), ('innovation_challenge', 'Innovation Challenge')], max_length=50, unique=True),
        ),
        migrations.RunPython(add_innovation_challenge_type, remove_innovation_challenge_type),
    ]
