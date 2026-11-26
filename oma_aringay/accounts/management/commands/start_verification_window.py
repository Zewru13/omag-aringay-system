"""Run once when the 3-day verification rule goes live: every citizen account that is set up but not yet verified (never
signed in, or still on its temporary password) gets the full 3 days from now. Their passwords are not changed.

  python manage.py start_verification_window            # preview, changes nothing
  python manage.py start_verification_window --confirm
"""
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db.models import Q
from django.utils import timezone

from accounts.models import User


class Command(BaseCommand):
    help = 'Give citizen accounts that are not yet verified 3 days from now (preview unless --confirm).'

    def add_arguments(self, parser):
        parser.add_argument('--confirm', action='store_true')

    def handle(self, *args, **options):
        pending = User.objects.filter(Q(must_change_password=True) | Q(last_login__isnull=True),
                                      role=User.Roles.CITIZEN, is_active=True)
        ids = list(pending.order_by('pk').values_list('pk', flat=True))
        deadline = timezone.now() + timedelta(days=settings.CITIZEN_SETUP_VALID_DAYS)
        self.stdout.write(f'{len(ids)} account(s) not yet verified: {", ".join(map(str, ids)) or "-"}')
        if not options['confirm']:
            self.stdout.write('Preview only. Nothing was changed. Add --confirm to apply.')
            return
        User.objects.filter(pk__in=ids).update(must_change_password=True, temp_password_expires_at=deadline)
        self.stdout.write(self.style.SUCCESS(f'They have until {timezone.localtime(deadline):%B %d, %Y %I:%M %p}.'))
