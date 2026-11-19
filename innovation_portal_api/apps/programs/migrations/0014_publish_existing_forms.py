"""Publish every existing form as version 1 so applicants keep seeing the forms they use today.

Active forms become "live" with a FormVersion 1 snapshot of their current sections and fields.
Inactive forms stay "draft" without a version.

Reverse: deletes the versions this migration made (number 1 with no publisher) and sets the
forms back to "draft".
"""

from django.db import migrations
from django.utils import timezone


def publish_existing_forms(apps, schema_editor):
    from apps.programs.form_schema import build_form_schema

    SubmissionForm = apps.get_model("programs", "SubmissionForm")
    FormVersion = apps.get_model("programs", "FormVersion")
    now = timezone.now()
    forms = SubmissionForm.objects.filter(active=True, is_template=False).prefetch_related(
        "sections", "fields__options", "fields__field_rules"
    )
    for form in forms:
        if FormVersion.objects.filter(form=form).exists():
            continue
        FormVersion.objects.create(
            form=form,
            number=1,
            schema=build_form_schema(form, include_inactive=False),
            published_at=now,
        )
        SubmissionForm.objects.filter(id=form.id).update(status="live")


def unpublish_existing_forms(apps, schema_editor):
    SubmissionForm = apps.get_model("programs", "SubmissionForm")
    FormVersion = apps.get_model("programs", "FormVersion")
    versions = FormVersion.objects.filter(number=1, published_by__isnull=True)
    SubmissionForm.objects.filter(id__in=versions.values("form_id")).update(status="draft")
    versions.delete()


class Migration(migrations.Migration):
    dependencies = [("programs", "0013_form_builder")]

    operations = [migrations.RunPython(publish_existing_forms, unpublish_existing_forms)]
