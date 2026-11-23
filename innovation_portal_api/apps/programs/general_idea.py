"""The one place that answers "which programme and form take an ordinary idea?".

Every general idea goes here: the home quick start, /submit, WhatsApp and USSD "Submit an idea", the assistant
and the Need help guide. Challenges and hackathons keep their own programme, form and workflow.
The database allows only one General ideas programme (programs 0025).
"""
from __future__ import annotations

# Where "send it as a general idea" links point on the public site.
URL = "/submit"


class GeneralIdeaProgram:
    @staticmethod
    def get():
        """The General ideas programme, created with its standard published form the first time it is needed."""
        from apps.programs.general_intake import GeneralIntakeService

        return GeneralIntakeService.program()

    @staticmethod
    def find():
        """The programme if it exists, without creating it (for read-only lists)."""
        from apps.programs.models import Program

        return Program.objects.filter(is_general_intake=True).select_related("form").first()

    @classmethod
    def form(cls):
        return cls.get().form

    @staticmethod
    def is_it(program) -> bool:
        return bool(program is not None and program.is_general_intake)


def form_ready(program) -> bool:
    """A programme can take entries only with a form that has a published version (prompt 31)."""
    form = getattr(program, "form", None) if program is not None else None
    if form is None or form.is_template:
        return False
    return form.versions.exists()


FORM_NOT_READY = "This challenge is not taking entries yet. Its form has not been published."


def ensure_published_version(form, *, FormVersion=None, SubmissionForm=None) -> bool:
    """Publish version 1 of a form that has never been published (seed and data migration use).

    Works with real or historical models. Returns True when it published something.
    """
    from apps.programs.form_schema import build_form_schema

    if FormVersion is None or SubmissionForm is None:
        from apps.programs.models import FormVersion as _FormVersion, SubmissionForm as _SubmissionForm

        FormVersion = FormVersion or _FormVersion
        SubmissionForm = SubmissionForm or _SubmissionForm
    if form is None or form.is_template or form.status == "archived" or FormVersion.objects.filter(form=form).exists():
        return False
    full = SubmissionForm.objects.prefetch_related("sections", "fields__options", "fields__field_rules").get(pk=form.pk)
    FormVersion.objects.create(form=full, number=1, schema=build_form_schema(full, include_inactive=False))
    if full.status == "draft":
        SubmissionForm.objects.filter(pk=full.pk).update(status="live")
    return True
