from django.db import migrations
import uuid


def add_hackathon_type(apps, schema_editor):
    ProgramType = apps.get_model("programs", "ProgramType")
    if not ProgramType.objects.filter(code="hackathon").exists():
        ProgramType.objects.create(
            id=uuid.uuid4(),
            name="Hackathon",
            code="hackathon",
            description="Time-boxed competitive event where teams build and present solutions.",
        )


def remove_hackathon_type(apps, schema_editor):
    ProgramType = apps.get_model("programs", "ProgramType")
    ProgramType.objects.filter(code="hackathon").delete()


class Migration(migrations.Migration):

    dependencies = [
        ("programs", "0004_termsandconditions_document_url_pdf_file"),
    ]

    operations = [
        migrations.RunPython(add_hackathon_type, remove_hackathon_type),
    ]
