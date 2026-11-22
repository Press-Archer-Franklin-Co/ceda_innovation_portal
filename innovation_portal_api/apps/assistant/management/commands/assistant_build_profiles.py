"""Fill in idea profiles for sent ideas that have none or whose text changed (A5).

    python manage.py assistant_build_profiles [--limit 200] [--force]
"""

from django.core.management.base import BaseCommand

from apps.assistant import gateway
from apps.assistant.models import Feature
from apps.assistant.profiles import build_profile, fingerprint
from apps.submissions.models import Submission


class Command(BaseCommand):
    help = "Build AI idea profiles for sent submissions (used to match similar ideas across languages)."

    def add_arguments(self, parser):
        parser.add_argument("--limit", type=int, default=200)
        parser.add_argument("--force", action="store_true", help="Rebuild even when the text has not changed.")

    def handle(self, *args, limit, force, **options):
        reason = gateway.unavailable_reason(Feature.IDEA_PROFILE)
        if reason:
            self.stdout.write(f"The AI helper cannot build profiles now ({reason}). Nothing was changed.")
            return
        built = skipped = failed = 0
        for submission in Submission.objects.exclude(current_status="draft").select_related("sector", "district", "idea_profile").order_by("-submitted_at")[:limit]:
            profile = getattr(submission, "idea_profile", None)
            if profile is not None and profile.fingerprint == fingerprint(submission) and not force:
                skipped += 1
                continue
            if build_profile(submission, force=force) is None:
                failed += 1
            else:
                built += 1
        self.stdout.write(f"Built {built}, already up to date {skipped}, could not build {failed}.")
