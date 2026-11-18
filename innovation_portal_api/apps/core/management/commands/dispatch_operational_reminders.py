from django.core.management.base import BaseCommand

from apps.operations.services import OperationsService


class Command(BaseCommand):
    help = "Dispatch overdue assignment/evaluation reminders and create escalation tasks."

    def handle(self, *args, **options):
        result = OperationsService.dispatch_reminders_and_escalations()
        self.stdout.write(self.style.SUCCESS(f"Dispatched reminders: {result}"))
