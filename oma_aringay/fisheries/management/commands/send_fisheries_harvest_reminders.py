"""
python manage.py send_fisheries_harvest_reminders [--date YYYY-MM-DD] [--dry-run]

The fisheries half of send_harvest_reminders (kept so an existing scheduler entry keeps working): the same reminders -
30 / 7 / 3 days before, the harvest day and 7 days overdue - for active production cycles only. See core.harvest_reminders.
"""
from core.management.commands.send_harvest_reminders import Command as HarvestReminders
from fisheries.notifications import harvest_reminder_candidates


class Command(HarvestReminders):
    help = 'Send the fisheries harvest reminder notifications that are due today.'
    providers = staticmethod(harvest_reminder_candidates)
