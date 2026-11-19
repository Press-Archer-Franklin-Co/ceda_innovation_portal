from django.core.management.base import BaseCommand
from django.db import transaction

from apps.platform_config.crypto import configured_keys, rotate_token
from apps.platform_config.models import IntegrationConnection


class Command(BaseCommand):
    help = (
        "Re-encrypt every saved integration secret with the newest key in "
        "INNOVATION_PORTAL_CONFIG_ENCRYPTION_KEY. Put the new key first, keep the old ones "
        "after it, run this command, then remove the old keys."
    )

    def add_arguments(self, parser):
        parser.add_argument("--dry-run", action="store_true", help="Check every secret can be decrypted, change nothing.")

    def handle(self, *args, dry_run=False, **options):
        keys = configured_keys()
        if len(keys) < 2:
            self.stdout.write(self.style.WARNING("Only one key is configured; secrets will be re-encrypted with the same key."))
        count = 0
        with transaction.atomic():
            for connection in IntegrationConnection.objects.select_for_update().exclude(secrets_encrypted=""):
                rotated = rotate_token(connection.secrets_encrypted)
                count += 1
                if not dry_run:
                    connection.secrets_encrypted = rotated
                    connection.save(update_fields=["secrets_encrypted", "updated_at"])
        verb = "Checked" if dry_run else "Re-encrypted"
        self.stdout.write(self.style.SUCCESS(f"{verb} secrets for {count} connection(s)."))
