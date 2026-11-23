"""Prompt 31: a programme takes entries only with a published form. Tests that build challenges use this."""
from apps.core.constants import SubmissionFormFieldType
from apps.programs.general_idea import ensure_published_version
from apps.programs.models import FormSection, SubmissionForm, SubmissionFormField


def published_form(program=None, *, title="Entry form", key="idea"):
    form = SubmissionForm.objects.create(title=title)
    section = FormSection.objects.create(form=form, title="Your idea", code="your-idea", ordering=1)
    SubmissionFormField.objects.create(form=form, section=section, key=key, label="Your idea", field_type=SubmissionFormFieldType.TEXTAREA, required=True, ordering=1)
    ensure_published_version(form)
    if program is not None:
        program.form = form
        program.save(update_fields=["form", "updated_at"])
    form.refresh_from_db()
    return form
