"""Prompt 37: the General ideas form's first and last name questions fill from the person's profile.

Sets their "Profile field" and adds it to the published versions of that form, so open drafts fill too. Answers
are not touched.
"""
from django.db import migrations

NAMES = {"first_name": "first_name", "last_name": "last_name"}


def forwards(apps, schema_editor):
    Program = apps.get_model("programs", "Program")
    SubmissionFormField = apps.get_model("programs", "SubmissionFormField")
    FormVersion = apps.get_model("programs", "FormVersion")
    for program in Program.objects.filter(is_general_intake=True).exclude(form__isnull=True):
        for key, profile in NAMES.items():
            SubmissionFormField.objects.filter(form_id=program.form_id, key=key, profile_field="").update(profile_field=profile)
        for version in FormVersion.objects.filter(form_id=program.form_id):
            schema = version.schema or {}
            changed = False
            fields = [f for step in schema.get("steps") or [] for row in step.get("rows") or [] for f in row.get("fields") or []] + list(schema.get("loose_fields") or [])
            for field in fields:
                if field.get("key") in NAMES and not field.get("profile_field"):
                    field["profile_field"] = NAMES[field["key"]]
                    changed = True
            if changed:
                FormVersion.objects.filter(pk=version.pk).update(schema=schema)


class Migration(migrations.Migration):
    dependencies = [("programs", "0027_field_profile_field")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
