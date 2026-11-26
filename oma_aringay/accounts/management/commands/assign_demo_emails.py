"""Give every ACTIVE farmer, fisherfolk and organization account that has no working e-mail a demo address that really
receives mail, using "plus addressing": omag.demo+farmer91@gmail.com is delivered to the omag.demo@gmail.com inbox.
Each account gets its own address (its own sign-in), and one inbox receives all their reset links and notifications.
A new temporary password (--passwords-file) must be replaced by the person's own within 3 days, or the setup is cancelled.

Whoever can open that inbox can reset the password of every one of these accounts, so use an inbox made for the demo,
and replace each address with the person's own before real use.

  python manage.py assign_demo_emails --base-email omag.demo@gmail.com                 # preview, changes nothing
  python manage.py assign_demo_emails --base-email omag.demo@gmail.com --confirm
  python manage.py assign_demo_emails --base-email ... --passwords-file C:\\path\\logins.csv --confirm
  python manage.py assign_demo_emails --undo docs\\demo-emails-<time>.json --confirm
"""
import csv
import json
import os

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.db import transaction
from django.utils import timezone

from accounts import login_email
from accounts.models import User
from accounts.utils import issue_temporary_password

# An address on one of these is taken to be a real mailbox and is kept.
DEFAULT_KEEP_DOMAINS = 'gmail.com,yahoo.com,outlook.com,hotmail.com'
KINDS = {'FARMER': 'farmer', 'FISHERFOLK': 'fisherfolk', 'FARMERS_ORG': 'farmersorg', 'FISHERFOLK_ORG': 'fisherfolkorg'}


class Command(BaseCommand):
    help = 'Give active citizen accounts without a working e-mail a demo address (preview unless --confirm).'

    def add_arguments(self, parser):
        parser.add_argument('--base-email', help='The inbox that receives everything, e.g. omag.demo@gmail.com')
        parser.add_argument('--keep-domains', default=DEFAULT_KEEP_DOMAINS)
        parser.add_argument('--passwords-file', help='Also give each of these accounts a new temporary password, listed in this CSV.')
        parser.add_argument('--backup-dir', default=str(settings.BASE_DIR.parent / 'docs'))
        parser.add_argument('--undo', help='A manifest written by an earlier run: put the old e-mails back.')
        parser.add_argument('--confirm', action='store_true')

    def handle(self, *args, **options):
        if options['undo']:
            return self._undo(options['undo'], options['confirm'])
        base = self._base_address(options['base_email'])
        keep = {d.strip().lower() for d in options['keep_domains'].split(',') if d.strip()}
        passwords_file = options['passwords_file']
        if passwords_file and os.path.exists(passwords_file):
            raise CommandError(f'{passwords_file} already exists. Choose a new file name.')

        changes, unlinked = self._plan(base, keep)
        for change in changes:
            how = 'demo address' if change['demo'] else 'their own address'
            self.stdout.write(f"account {change['user_id']} ({KINDS[change['record_type']]}): "
                              f"{change['old_account_email'] or '(none)'} -> {change['new_email']}  [{how}]")
        if unlinked:
            self.stdout.write(f'Skipped, not linked to any record: account(s) {", ".join(map(str, unlinked))}.')
        self.stdout.write(f'{len(changes)} account(s) to change, {sum(c["demo"] for c in changes)} of them with a demo address.')
        if not options['confirm']:
            self.stdout.write('Preview only. Nothing was changed. Add --confirm to apply.')
            return
        if not changes:
            return

        os.makedirs(options['backup_dir'], exist_ok=True)
        manifest = os.path.join(options['backup_dir'], f'demo-emails-{timezone.localtime():%Y%m%d-%H%M%S}.json')
        with open(manifest, 'x', encoding='utf-8') as handle:
            json.dump({'changes': changes}, handle, indent=2)
        logins = []
        with transaction.atomic():
            for change in changes:
                user = User.objects.get(pk=change['user_id'])
                login_email.apply_login_email(user, change['new_email'])
                if passwords_file and change['demo']:
                    logins.append(self._new_password(user, change))
            if passwords_file:
                # Written inside the transaction: if the file cannot be written, no password changes.
                with open(passwords_file, 'x', newline='', encoding='utf-8-sig') as handle:
                    writer = csv.DictWriter(handle, ['account_type', 'name', 'login_email', 'temporary_password', 'expires'])
                    writer.writeheader()
                    writer.writerows(logins)
        self.stdout.write(self.style.SUCCESS(f'Done. To undo: --undo "{manifest}" --confirm'))
        if passwords_file:
            self.stdout.write(f'Sign-in list: {passwords_file}. It holds passwords: keep it private and delete it after the demo.')

    def _base_address(self, value):
        value = login_email.normalize(value)
        try:
            validate_email(value)
        except ValidationError:
            raise CommandError('--base-email must be a real email address, for example omag.demo@gmail.com')
        if '+' in value:
            raise CommandError('--base-email must be the plain address, without a "+" part.')
        return value

    def _plan(self, base, keep):
        local, domain = base.split('@')
        changes, unlinked = [], []
        claimed = set()
        for user in User.objects.filter(role=User.Roles.CITIZEN, is_active=True).order_by('pk'):
            record_type, record = user.linked_record_type, user.get_linked_record()
            if record is None:
                unlinked.append(user.pk)
                continue
            field = login_email.record_field(record_type)
            old_account = user.email
            old_record = getattr(record, field)
            own = next((e for e in map(login_email.normalize, (old_account, old_record))
                        if e.rpartition('@')[2] in keep and e not in claimed
                        and not login_email.is_taken(e, exclude_user_id=user.pk)), None)
            new = own or f'{local}+{KINDS[record_type]}{user.pk}@{domain}'
            claimed.add(new)
            if login_email.normalize(old_account) == new and login_email.normalize(old_record) == new:
                continue
            changes.append({'user_id': user.pk, 'record_type': record_type, 'record_id': record.pk, 'demo': own is None,
                            'old_account_email': old_account, 'old_record_email': old_record, 'new_email': new})
        return changes, unlinked

    def _new_password(self, user, change):
        from accounts.views import _blacklist_outstanding_tokens
        password = issue_temporary_password(user)
        _blacklist_outstanding_tokens(user)
        return {'account_type': KINDS[change['record_type']], 'name': user.full_name, 'login_email': user.email,
                'temporary_password': password,
                'expires': f'{timezone.localtime(user.temp_password_expires_at):%Y-%m-%d %H:%M}'}

    def _undo(self, path, confirm):
        with open(path, encoding='utf-8') as handle:
            changes = json.load(handle)['changes']
        restored = 0
        with transaction.atomic():
            for change in changes:
                user = User.objects.filter(pk=change['user_id']).first()
                if user is None or login_email.normalize(user.email) != change['new_email']:
                    self.stdout.write(f"account {change['user_id']}: changed since then, left as it is.")
                    continue
                restored += 1
                if confirm:
                    User.objects.filter(pk=user.pk).update(email=change['old_account_email'])
                    field = login_email.record_field(change['record_type'])
                    login_email.record_model(change['record_type']).objects.filter(pk=change['record_id']).update(
                        **{field: change['old_record_email']})
        verb = 'Restored' if confirm else 'Would restore'
        self.stdout.write(f'{verb} {restored} account(s). Passwords are not undone.')
