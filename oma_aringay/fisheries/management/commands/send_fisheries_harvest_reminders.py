"""
python manage.py send_fisheries_harvest_reminders [--date YYYY-MM-DD] [--dry-run]

Creates the "Harvest in 7 Days" / "Harvest in 3 Days" notifications for active production cycles whose
expected harvest date (the one Fisheries Forecasting shows) is exactly 7 / 3 days from today, in the
project's TIME_ZONE. Meant to run once a day from a scheduler; safe to run any number of times:
  - each cycle gets each reminder at most once (already-sent reminders are skipped);
  - on PostgreSQL an advisory lock stops two simultaneous runs from both inserting;
  - everything is inserted in one transaction, and production cycles / stocking records are only read.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.db import connection, transaction
from django.utils import timezone

from core.models import Notification
from fisheries.notifications import build_harvest_reminders

ADVISORY_LOCK_KEY = 74_318_202_601   # arbitrary constant, unique to this command


class Command(BaseCommand):
    help = 'Send the 7-day and 3-day Fisheries harvest reminder notifications that are due today.'

    def add_arguments(self, parser):
        parser.add_argument('--date', help="Treat this date (YYYY-MM-DD) as today, e.g. to back-fill a missed day.")
        parser.add_argument('--dry-run', action='store_true', help='Show what would be sent without saving anything.')

    def handle(self, *args, **options):
        if options['date']:
            try:
                today = date.fromisoformat(options['date'])
            except ValueError as exc:
                raise CommandError('--date must be YYYY-MM-DD.') from exc
        else:
            today = timezone.localdate()   # Django's TIME_ZONE, never a browser clock

        with transaction.atomic():
            if connection.vendor == 'postgresql':
                with connection.cursor() as cursor:
                    cursor.execute('SELECT pg_try_advisory_xact_lock(%s)', [ADVISORY_LOCK_KEY])
                    if not cursor.fetchone()[0]:
                        self.stdout.write(self.style.WARNING('Another reminder run is in progress; nothing sent.'))
                        return
            rows, events, already = build_harvest_reminders(today)
            if options['dry_run']:
                transaction.set_rollback(True)
            elif rows:
                Notification.objects.bulk_create(rows)

        verb = 'Would send' if options['dry_run'] else 'Sent'
        self.stdout.write(self.style.SUCCESS(
            f'{today.isoformat()}: {verb} {events} reminder event(s) as {len(rows)} notification(s); '
            f'{already} cycle(s) already had that reminder.'
        ))
