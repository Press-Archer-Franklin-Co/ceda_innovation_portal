from django.core.management.base import BaseCommand, CommandError

from apps.communications.email_notifications import EmailNotificationService


class Command(BaseCommand):
    help = "Send a branded CEDA Innovation Portal test notification email."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Recipient email address.")

    def handle(self, *args, **options):
        to_email = options["to"].strip()
        if not to_email:
            raise CommandError("A recipient email is required.")
        EmailNotificationService.send_test_email(to_email=to_email)
        self.stdout.write(self.style.SUCCESS(f"Sent CEDA Innovation Portal test email to {to_email}"))
