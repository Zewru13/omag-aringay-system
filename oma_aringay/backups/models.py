from django.conf import settings
from django.db import models


class BackupRecord(models.Model):
    """One backup of the system (Admin > Backup): a zip of the whole database and the uploaded files, kept in the file storage under backups/.
    The row is the list the Backup page shows; the zip is `file_path` in the default storage."""

    class Kind(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        SCHEDULED = 'scheduled', 'Scheduled'

    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        DONE = 'done', 'Done'
        FAILED = 'failed', 'Failed'

    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.MANUAL)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    file_path = models.CharField(max_length=255, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    records_count = models.PositiveIntegerField(default=0)    # database records in the backup
    files_count = models.PositiveIntegerField(default=0)      # uploaded files in the backup
    files_skipped = models.PositiveIntegerField(default=0)    # uploaded files left out (too large to include, or unreadable)
    detail = models.TextField(blank=True)                     # what went wrong, or what was left out

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'Backup {self.pk} ({self.status})'
