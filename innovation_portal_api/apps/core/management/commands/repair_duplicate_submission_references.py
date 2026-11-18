from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count

from apps.submissions.models import Submission
from apps.submissions.services import ReferenceNumberService


class Command(BaseCommand):
    help = "Repair duplicate submission reference numbers by keeping the newest record per duplicate reference and renumbering older collisions."

    def add_arguments(self, parser):
        parser.add_argument(
            "--apply",
            action="store_true",
            help="Persist the repaired reference numbers. Without this flag the command performs a dry run.",
        )

    @transaction.atomic
    def handle(self, *args, **options):
        apply_changes = options["apply"]
        reserved_references = set(
            Submission.objects.exclude(reference_number="")
            .values_list("reference_number", flat=True)
        )
        duplicates = (
            Submission.objects.exclude(reference_number="")
            .values("reference_number")
            .annotate(count=Count("id"))
            .filter(count__gt=1)
            .order_by("reference_number")
        )

        if not duplicates:
            self.stdout.write(self.style.SUCCESS("No duplicate submission references found."))
            return

        repaired = 0
        for row in duplicates:
            reference_number = row["reference_number"]
            submissions = list(
                Submission.objects.filter(reference_number=reference_number)
                .select_related("program__program_type")
                .order_by("-submitted_at", "-created_at", "-id")
            )
            keeper = submissions[0]
            self.stdout.write(
                f"Keeping {reference_number} on submission {keeper.id} ({keeper.title})"
            )
            for submission in reversed(submissions[1:]):
                new_reference = self._next_unique_reference(submission, reserved_references)
                self.stdout.write(
                    f"  {'Updating' if apply_changes else 'Would update'} "
                    f"{submission.id} ({submission.title}) -> {new_reference}"
                )
                reserved_references.add(new_reference)
                if apply_changes:
                    submission.reference_number = new_reference
                    submission.save(update_fields=["reference_number", "updated_at"])
                repaired += 1

        if not apply_changes:
            transaction.set_rollback(True)
            self.stdout.write(self.style.WARNING(f"Dry run only. {repaired} submissions would be updated."))
            return

        self.stdout.write(self.style.SUCCESS(f"Repaired {repaired} submissions with duplicate references."))

    def _next_unique_reference(self, submission, reserved_references):
        year = submission.submitted_at.year if submission.submitted_at else submission.created_at.year
        prefix = ReferenceNumberService.PREFIX_MAP.get(submission.program.program_type.code, "CEDA-PROG")
        stem = f"{prefix}-{year}-"
        sequence = (
            Submission.objects.filter(reference_number__startswith=stem)
            .exclude(reference_number="")
            .count()
            + 1
        )
        while True:
            candidate = f"{stem}{sequence:06d}"
            if candidate not in reserved_references:
                return candidate
            sequence += 1
