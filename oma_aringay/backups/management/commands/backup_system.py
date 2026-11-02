import logging
import sys

from django.core.management.base import BaseCommand, CommandError

from backups import service
from backups.models import BackupRecord


class Command(BaseCommand):
    help = 'Make a backup of the whole system (database + uploaded files) now: `manage.py backup_system`. For a scheduler (a Render cron job); Admin > Backup lists it.'

    def handle(self, *args, **options):
        # Show the backup's steps on screen, so a scheduler's log says where a slow or stuck run is.
        steps = logging.getLogger('backups')
        steps.setLevel(logging.INFO)
        if not steps.handlers:
            handler = logging.StreamHandler(sys.stdout)
            handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
            steps.addHandler(handler)
        service.mark_stale()
        record = BackupRecord.objects.create(kind=BackupRecord.Kind.SCHEDULED)
        service.run_backup(record.id)
        record.refresh_from_db()
        if record.status != BackupRecord.Status.DONE:
            raise CommandError(f'The backup failed: {record.detail}')
        self.stdout.write(self.style.SUCCESS(
            f'Backup {record.file_path}: {record.records_count} records, {record.files_count} files, {record.size_bytes} bytes.'))
