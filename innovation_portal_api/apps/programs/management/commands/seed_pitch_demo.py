"""Demo: one shortlisted idea with a pitch session for each demo innovator account (safe to run again).

  manage.py seed_pitch_demo            uses the test accounts (is_demo_account) that are innovators
  manage.py seed_pitch_demo --dry-run  says what it would do

The session is the idea's own, five days from today at 10:00 Gaborone time, in person at CEDA House. It never
touches ideas of real people.
"""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.accounts.models import User
from apps.core.constants import ProgramStatus, RoleType, SubmissionStatus, SubmissionType

GABORONE = ZoneInfo("Africa/Gaborone")
TITLE = "Solar cold room for vegetable sellers"


class Command(BaseCommand):
    help = "Give each demo innovator one shortlisted idea with a pitch session."

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true")

    def handle(self, *args, dry_run=False, **options):
        from apps.programs import pitch
        from apps.programs.models import Program
        from apps.submissions.models import Submission
        from apps.workflow.services import WorkflowRuntimeService

        people = User.objects.filter(is_demo_account=True, is_active=True, user_roles__role__code=RoleType.INNOVATOR, user_roles__is_active=True).distinct()
        program = Program.objects.filter(status=ProgramStatus.PUBLISHED, is_general_intake=False).order_by("-created_at").first()
        if not people.exists() or program is None:
            self.stdout.write("Nothing to do: no demo innovator account or no published challenge.")
            return
        when = datetime.combine(timezone.localdate(timezone.now(), GABORONE) + timedelta(days=5), time(10, 0), tzinfo=GABORONE)
        for person in people:
            idea = Submission.objects.filter(innovator=person, submitted_at__isnull=False).order_by("-submitted_at").first()
            label = f"{person.full_name or person.pk}"
            if dry_run:
                self.stdout.write(f"WOULD shortlist {'their idea ' + idea.reference_number if idea else 'a new idea in ' + program.title} for {label} with a pitch on {when:%Y-%m-%d %H:%M} Gaborone time")
                continue
            with transaction.atomic():
                if idea is None:
                    count = Submission.objects.filter(program=program).count() + 1
                    idea = Submission.objects.create(
                        reference_number=f"DEMO-PITCH-{count:04d}", program=program, innovator=person, submission_type=SubmissionType.IDEA,
                        title=TITLE, submitted_at=timezone.now(), current_status=SubmissionStatus.UNDER_JUDGING,
                    )
                if idea.current_status not in pitch.SHORTLISTED:
                    WorkflowRuntimeService._sync_submission(idea, status_value=SubmissionStatus.SHORTLISTED, locked=True)
                pitch.save_for_idea(
                    idea,
                    {
                        "starts_at": when.isoformat(),
                        "duration_minutes": 20,
                        "format": "in_person",
                        "place": {"en": "CEDA House, Gaborone, boardroom 2", "tn": "Ntlo ya CEDA, Gaborone, phaposi ya dikopano 2"},
                        "instructions": {"en": "Bring a 5-slide deck. You have 10 minutes to pitch and 10 minutes for questions.", "tn": "Tla le ditsebe di le 5. O na le metsotso e le 10 go tlhagisa le e le 10 ya dipotso."},
                    },
                    actor=None,
                )
            self.stdout.write(f"Shortlisted {idea.reference_number} for {label}; pitch on {when:%Y-%m-%d %H:%M} Gaborone time.")
