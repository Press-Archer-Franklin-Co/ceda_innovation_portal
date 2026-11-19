"""Create the always-open "General ideas" programme when an owner exists.

On a fresh database (no superuser yet) nothing is created here; the programme is
then created the first time it is needed (apps.programs.general_intake).
"""
import uuid

from django.db import migrations


def create_general_intake(apps, schema_editor):
    from apps.programs import general_intake as spec

    Program = apps.get_model("programs", "Program")
    if Program.objects.filter(is_general_intake=True).exists():
        return
    User = apps.get_model("accounts", "User")
    owner = User.objects.filter(is_superuser=True, is_active=True).order_by("created_at").first()
    if owner is None:
        return
    ProgramType = apps.get_model("programs", "ProgramType")
    program_type = ProgramType.objects.filter(code="idea").first()
    if program_type is None:
        program_type = ProgramType.objects.create(id=uuid.uuid4(), code="idea", name="Idea Submission")
    slug = spec.SLUG if not Program.objects.filter(slug=spec.SLUG).exists() else f"{spec.SLUG}-{uuid.uuid4().hex[:6]}"
    program = Program.objects.create(id=uuid.uuid4(), slug=slug, program_type=program_type, owner=owner, **spec.program_defaults())
    spec.build_form(
        program=program,
        SubmissionForm=apps.get_model("programs", "SubmissionForm"),
        FormSection=apps.get_model("programs", "FormSection"),
        SubmissionFormField=apps.get_model("programs", "SubmissionFormField"),
    )


class Migration(migrations.Migration):
    dependencies = [
        ("programs", "0011_general_intake_sectors_stage_text"),
        ("accounts", "0009_nullable_email_phone_login"),
    ]

    operations = [
        migrations.RunPython(create_general_intake, migrations.RunPython.noop),
    ]
