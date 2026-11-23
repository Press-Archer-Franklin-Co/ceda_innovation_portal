"""Make the example WhatsApp journey do the whole idea in WhatsApp (see apps/channels/upgrade.py).

    python manage.py upgrade_example_whatsapp_journey            # the journeys live WhatsApp numbers run
    python manage.py upgrade_example_whatsapp_journey --journey <id>
    python manage.py upgrade_example_whatsapp_journey --undo     # back to the version before
"""

from django.core.management.base import BaseCommand, CommandError

from apps.channels import upgrade
from apps.channels.models import Journey


class Command(BaseCommand):
    help = "Upgrade the example WhatsApp journey: the form's questions, a file, Send the idea, and My ideas."

    def add_arguments(self, parser):
        parser.add_argument("--journey", help="Journey id (default: the journeys active WhatsApp connections run, else the example)")
        parser.add_argument("--undo", action="store_true", help="Put back the version from before the upgrade")

    def handle(self, *args, **options):
        if options.get("journey"):
            journeys = list(Journey.objects.filter(id=options["journey"]))
            if not journeys:
                raise CommandError("No journey with that id.")
        else:
            journeys = upgrade.target_journeys()
        if not journeys:
            raise CommandError(f"No live WhatsApp journey and no journey called {upgrade.EXAMPLE_NAME!r}.")
        for journey in journeys:
            try:
                result = (upgrade.undo if options.get("undo") else upgrade.upgrade)(journey)
            except ValueError as exc:
                raise CommandError(str(exc)) from exc
            except Exception as exc:  # publishing refused: show the problems
                detail = getattr(exc, "detail", exc)
                raise CommandError(f"{journey.name}: {detail}") from exc
            self.stdout.write(f"{journey.name} (version {result.version}):")
            for line in result.lines:
                self.stdout.write(f"  - {line}")
