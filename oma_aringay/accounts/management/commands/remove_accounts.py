from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

User = get_user_model()


def related_row_count(user):
    """How many rows in other tables point at this user (records they logged, notifications, locks, requests...)."""
    total = 0
    for rel in User._meta.related_objects:
        if rel.one_to_many or rel.one_to_one:
            total += rel.related_model._default_manager.filter(**{rel.field.name: user}).count()
    return total


class Command(BaseCommand):
    help = (
        'Delete leftover test accounts, only the ones you name. Without --confirm it only shows what it would do. '
        'It refuses any account that is still active or that has any related records (history), and if any named '
        'account is refused or not found, it deletes nothing at all.'
    )

    def add_arguments(self, parser):
        parser.add_argument('emails', nargs='*', help='Email (or username) of each account to delete.')
        parser.add_argument('--confirm', action='store_true', help='Really delete. Without it nothing changes.')

    def handle(self, *args, **options):
        names = [e.strip() for e in options['emails'] if e.strip()]
        if not names:
            raise CommandError('Name at least one account, for example: remove_accounts old-test@example.com')

        plan, problems = [], []
        for name in names:
            user = User.objects.filter(email__iexact=name).first() or User.objects.filter(username__iexact=name).first()
            if user is None:
                problems.append(f'{name}: no such account')
            elif user.is_active:
                problems.append(f'{name}: is still active (deactivate it first; an account in use is never deleted)')
            elif related_row_count(user):
                problems.append(f'{name}: has related records ({related_row_count(user)} rows point at it), so it is kept')
            else:
                plan.append(user)
                self.stdout.write(f'  would delete #{user.pk} {user.role} {user.email or user.username}')

        if problems:
            for line in problems:
                self.stdout.write(self.style.ERROR('  refused  ' + line))
            self.stdout.write(self.style.WARNING('Nothing was deleted: fix or remove the refused names and run it again.'))
            return
        if not options['confirm']:
            self.stdout.write(self.style.WARNING(f'Nothing was deleted. {len(plan)} account(s) listed above; add --confirm to delete them.'))
            return
        with transaction.atomic():
            for user in plan:
                user.delete()
        self.stdout.write(self.style.SUCCESS(f'Deleted {len(plan)} account(s).'))
