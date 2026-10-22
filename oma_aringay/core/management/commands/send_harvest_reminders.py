"""
python manage.py send_harvest_reminders [--date YYYY-MM-DD] [--dry-run]

Creates today's harvest reminders for farmers (crop records) and fisherfolk (production cycles): 30 / 7 / 3 days before the
expected harvest, the harvest day, and 7 days overdue. The system also does this by itself the first time anyone opens
their notifications each day (core.harvest_reminders.run_daily_once); this command is for running it on demand or from
a scheduler. Safe to run any number of times: a record never gets the same reminder twice.
"""
from datetime import date

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from core import harvest_reminders


class Command(BaseCommand):
    help = "Send today's harvest reminder notifications (crops and fisheries)."
    providers = None   # None: both kinds of record

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
        events, notifications = harvest_reminders.run(today, dry_run=options['dry_run'], providers=self.providers)
        verb = 'Would send' if options['dry_run'] else 'Sent'
        self.stdout.write(self.style.SUCCESS(f'{today.isoformat()}: {verb} {events} reminder event(s) as {notifications} notification(s).'))
