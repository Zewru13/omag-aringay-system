from django.conf import settings
from django.db import models


class BackupRecord(models.Model):
    """One entry of the Backup list (Admin > Backup): a backup the Admin made, the safety backup taken before a restore, or a restore itself.

    A backup is a zip of the whole database and the uploaded files. It is made for DOWNLOAD: the zip waits in the file storage (`file_path`) only until
    the Admin's browser has it, then the online copy is removed and the entry stays, with the file's name and fingerprint (`checksum`) so the same file
    can be recognised when it is chosen for a restore. Entries are never deleted. Its name, location and remarks are the Admin's own notes about where
    the downloaded file is kept."""

    class Kind(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        SCHEDULED = 'scheduled', 'Automatic'          # the nightly backups of an earlier version; none are made any more
        SAFETY = 'safety', 'Before restore'
        RESTORE = 'restore', 'Restore'

    class Status(models.TextChoices):
        RUNNING = 'running', 'Running'
        DONE = 'done', 'Done'
        FAILED = 'failed', 'Failed'

    kind = models.CharField(max_length=12, choices=Kind.choices, default=Kind.MANUAL)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.RUNNING)
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')
    made_by = models.CharField(max_length=150, blank=True)    # the account's name, kept as text: a restore can bring back a time before that account existed
    name = models.CharField(max_length=120, blank=True)       # the Admin's own name for it
    location = models.CharField(max_length=255, blank=True)   # where the downloaded file is kept
    remarks = models.CharField(max_length=255, blank=True)
    file_path = models.CharField(max_length=255, blank=True)  # the online copy, until it is downloaded
    file_name = models.CharField(max_length=120, blank=True)  # the downloaded file's name
    checksum = models.CharField(max_length=64, blank=True)    # SHA-256 of the zip
    downloaded_at = models.DateTimeField(null=True, blank=True)
    size_bytes = models.BigIntegerField(default=0)
    records_count = models.PositiveIntegerField(default=0)    # database records in the backup
    files_count = models.PositiveIntegerField(default=0)      # uploaded files in the backup
    files_skipped = models.PositiveIntegerField(default=0)    # uploaded files left out (too large to include, or unreadable)
    detail = models.TextField(blank=True)                     # what went wrong, or what was left out

    class Meta:
        ordering = ['-created_at', '-id']

    def __str__(self):
        return f'Backup {self.pk} ({self.status})'

    @property
    def is_backup(self):
        return self.kind != self.Kind.RESTORE
