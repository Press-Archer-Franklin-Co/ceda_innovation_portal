"""Join a phone-only WhatsApp or USSD account into a person's main account. Dry run unless --apply is given.

  manage.py join_phone_account --phone 7300XXXX --into <user id or email>          lists what would move
  manage.py join_phone_account --phone 7300XXXX --into <user id or email> --apply  moves it

Prints a masked phone only.
"""

from django.core.management.base import BaseCommand, CommandError
from django.db.models import Q

from apps.accounts.models import User
from apps.accounts.phone_accounts import accounts_with_phone, join_accounts
from apps.core.phone import mask_phone, try_normalize_phone


class Command(BaseCommand):
    help = "Join a phone-only account into the person's main account (dry run unless --apply)."

    def add_arguments(self, parser):
        parser.add_argument("--phone", required=True)
        parser.add_argument("--into", required=True, help="The account to keep: its id or email.")
        parser.add_argument("--apply", action="store_true")

    def handle(self, *args, phone, into, apply, **options):
        e164 = try_normalize_phone(phone)
        if not e164:
            raise CommandError("That is not a phone number.")
        query = Q(email__iexact=into)
        if len(into) == 36 and into.count("-") == 4:
            query |= Q(pk=into)
        target = User.objects.filter(query).first()
        if target is None:
            raise CommandError("No account to keep was found.")
        others = list(accounts_with_phone(e164, exclude=target))
        if not others:
            self.stdout.write(f"No other active account has {mask_phone(e164)}.")
            return
        for other in others:
            plan = join_accounts(other, target, actor=None, dry_run=not apply, source="join_phone_account_command")
            label = "MOVED" if apply and plan.allowed else "WOULD MOVE" if plan.allowed else "REFUSED"
            self.stdout.write(f"{label} account {other.pk} ({mask_phone(e164)}) into {target.pk}: {plan.reason or plan.moves}")
