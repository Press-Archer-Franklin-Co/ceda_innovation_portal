"""Seed the four form templates: Challenge entry, Pitch an idea, Quick idea (USSD), Event registration.

English only; staff add Setswana on the translations screen. Reverse deletes the
templates by code (forms made from them are separate copies and are kept).
"""

from django.db import migrations


def seed_templates(apps, schema_editor):
    from apps.programs.form_templates import TEMPLATES, create_template

    models = {
        "SubmissionForm": apps.get_model("programs", "SubmissionForm"),
        "FormSection": apps.get_model("programs", "FormSection"),
        "SubmissionFormField": apps.get_model("programs", "SubmissionFormField"),
        "SubmissionFormFieldOption": apps.get_model("programs", "SubmissionFormFieldOption"),
    }
    for spec in TEMPLATES:
        create_template(spec, **models)


def remove_templates(apps, schema_editor):
    from apps.programs.form_templates import TEMPLATE_CODES

    SubmissionForm = apps.get_model("programs", "SubmissionForm")
    SubmissionForm.objects.filter(is_template=True, code__in=TEMPLATE_CODES).delete()


class Migration(migrations.Migration):
    dependencies = [("programs", "0015_form_tips_challenge_questions")]

    operations = [migrations.RunPython(seed_templates, remove_templates)]
