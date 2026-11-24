import datetime
import json
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core import serializers
from django.core.management.base import BaseCommand
from django.db import transaction

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization

User = get_user_model()


def attached_rows(org):
    """What still hangs on an organization, as {what: how many}: every row in any table that points at it (members past or present, officers,
    equipment, crops, assistance...). A record with anything attached is not an empty organization: removing it would lose history."""
    found = {}
    for rel in FarmersOrganization._meta.related_objects:
        if not (rel.one_to_many or rel.one_to_one):
            continue
        count = rel.related_model._default_manager.filter(**{rel.field.name: org}).count()
        if count:
            found[rel.related_model._meta.verbose_name_plural] = count
    return found


def login_accounts(org):
    """The citizen login accounts of this organization that belong to nothing else (an account also linked to another record is left alone)."""
    links = UserLinkedRecord.objects.filter(record_type='FARMERS_ORG', record_id=org.id)
    users = []
    for user in User.objects.filter(pk__in=links.values_list('user_id', flat=True)).filter(role='CITIZEN'):
        elsewhere = UserLinkedRecord.objects.filter(user=user).exclude(record_type='FARMERS_ORG', record_id=org.id).exists()
        if not elsewhere:
            users.append(user)
    return users


def backup_rows(orgs_and_users):
    """JSON of the organizations, their account links and their accounts, for a restore by hand. No password hash is written."""
    orgs, links, users = [], [], []
    for org, org_users in orgs_and_users:
        orgs.append(org)
        links.extend(UserLinkedRecord.objects.filter(record_type='FARMERS_ORG', record_id=org.id))
        users.extend(org_users)
    user_fields = [f.name for f in User._meta.concrete_fields if f.name != 'password']
    rows = json.loads(serializers.serialize('json', orgs + links)) + json.loads(serializers.serialize('json', users, fields=user_fields))
    return json.dumps(rows, indent=1)


class Command(BaseCommand):
    help = (
        'Delete the farmers organizations that have no members, and their login accounts. Without --confirm it only shows what it would do. '
        'An organization with anything attached (members past or present, officers, equipment, crops, assistance) is kept and listed. '
        'Before deleting, a backup file is written to --backup-dir (default: the current folder).'
    )

    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true', help='Really delete. Without it nothing changes.')
        parser.add_argument('--backup-dir', default='.', help='Where the backup file is written (default: the current folder).')

    def handle(self, *args, **options):
        removable, kept = [], []
        for org in FarmersOrganization.objects.order_by('id'):
            if org.members.exists():
                kept.append((org, {'members': org.members.count()}))
                continue
            attached = attached_rows(org)
            if attached:
                kept.append((org, attached))
            else:
                removable.append((org, login_accounts(org)))

        for org, why in kept:
            self.stdout.write(f'  kept     #{org.id} {org.name}: ' + ', '.join(f'{n} {what}' for what, n in why.items()))
        if not removable:
            self.stdout.write(self.style.SUCCESS('No organization without members: nothing to do.'))
            return
        for org, users in removable:
            accounts = ', '.join(u.email or u.username for u in users) or 'no login account'
            self.stdout.write(f'  would delete  #{org.id} {org.name}  ({accounts})')

        if not options['confirm']:
            self.stdout.write(self.style.WARNING(
                f'Nothing was deleted. {len(removable)} organization(s) listed above; add --confirm to delete them and their login accounts.'))
            return

        stamp = datetime.datetime.now().strftime('%Y%m%d-%H%M%S')
        path = Path(options['backup_dir']) / f'removed-empty-organizations-{stamp}.json'
        path.write_text(backup_rows(removable), encoding='utf8')
        self.stdout.write(f'  backup written to {path}')

        deleted = 0
        for org, users in removable:
            try:
                with transaction.atomic():
                    for user in users:
                        user.delete()
                    UserLinkedRecord.objects.filter(record_type='FARMERS_ORG', record_id=org.id).delete()
                    org.delete()
                deleted += 1
            except Exception as err:            # one organization that cannot be removed never stops the rest
                self.stdout.write(self.style.ERROR(f'  refused  #{org.id} {org.name}: {err}'))
        self.stdout.write(self.style.SUCCESS(f'Deleted {deleted} organization(s) and their login accounts.'))
