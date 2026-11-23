"""Prompt 31 part A, data only. Nothing is deleted: no idea, draft, history or form.

1. One General ideas programme: if more than one has is_general_intake, keep the one with the most ideas and
   drafts (the oldest on a tie). The others stop being General ideas and are archived; their ideas stay.
2. The old "CEDA Idea Submission" programme (seed_idea_submission) is a second always-open place for ordinary
   ideas, and WhatsApp listed it next to "General idea". It is archived and taken off the public site. Its form
   is archived too when no programme that still takes entries uses it.
3. Every challenge or hackathon that takes entries gets its form published as version 1 when it has never been
   published (as programs 0014 did for forms that existed then), so "Enter" leads to a form that loads.
"""

from django.db import migrations
from django.db.models import Count
from django.utils import timezone

DUPLICATE_IDEA_SLUGS = ("ceda-idea-submission",)


def forwards(apps, schema_editor):
    from apps.programs.general_idea import ensure_published_version

    Program = apps.get_model("programs", "Program")
    SubmissionForm = apps.get_model("programs", "SubmissionForm")
    FormVersion = apps.get_model("programs", "FormVersion")

    general = list(
        Program.objects.filter(is_general_intake=True)
        .annotate(n_subs=Count("submissions", distinct=True), n_drafts=Count("application_drafts", distinct=True))
        .order_by("created_at")
    )
    if len(general) > 1:
        keep = max(general, key=lambda p: (p.n_subs + p.n_drafts, -p.created_at.timestamp()))
        for program in general:
            if program.pk != keep.pk:
                Program.objects.filter(pk=program.pk).update(is_general_intake=False, status="archived", is_public=False, updated_at=timezone.now())

    for program in Program.objects.filter(slug__in=DUPLICATE_IDEA_SLUGS, is_general_intake=False).exclude(status="archived"):
        Program.objects.filter(pk=program.pk).update(status="archived", is_public=False, updated_at=timezone.now())
        if program.form_id:
            still_used = Program.objects.filter(form_id=program.form_id).exclude(pk=program.pk).exclude(status__in=("archived", "closed")).exists()
            if not still_used:
                SubmissionForm.objects.filter(pk=program.form_id).update(status="archived", updated_at=timezone.now())

    now = timezone.now()
    for program in Program.objects.filter(status="published", is_general_intake=False, form__isnull=False).select_related("form"):
        closes = program.closes_at or program.closing_date
        if closes and closes < now:
            continue
        ensure_published_version(program.form, FormVersion=FormVersion, SubmissionForm=SubmissionForm)


class Migration(migrations.Migration):
    dependencies = [("programs", "0023_results_show_names")]

    operations = [migrations.RunPython(forwards, migrations.RunPython.noop)]
