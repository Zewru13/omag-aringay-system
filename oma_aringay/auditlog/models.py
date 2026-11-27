from django.conf import settings
from django.db import models


class AuditLogEntry(models.Model):
    class Action(models.TextChoices):
        CREATE = 'CREATE', 'Create'
        UPDATE = 'UPDATE', 'Update'
        DELETE = 'DELETE', 'Delete'
        APPROVE = 'APPROVE', 'Approve'
        REJECT = 'REJECT', 'Reject'
        IMPORT = 'IMPORT', 'Import'
        DOWNLOAD = 'DOWNLOAD', 'Download'
        SIGN_IN = 'SIGN_IN', 'Sign in'
        SIGN_OUT = 'SIGN_OUT', 'Sign out'
        SIGN_IN_FAILED = 'SIGN_IN_FAILED', 'Failed sign-in'
        BACKUP = 'BACKUP', 'Backup'
        RESTORE = 'RESTORE', 'Restore'

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='audit_log_entries',
    )
    action = models.CharField(max_length=20, choices=Action.choices)
    model_name = models.CharField(max_length=100)
    object_repr = models.CharField(max_length=255)      # the description shown in the list
    # {'changes': [{record, model, change, name, fields: [{field, old, new}]}], 'more': n}; empty on older entries
    details = models.JSONField(null=True, blank=True)
    # who it was, kept as text: a restore can remove the account
    user_name = models.CharField(max_length=255, blank=True, default='')
    user_email = models.CharField(max_length=254, blank=True, default='')
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Audit Log Entry'
        verbose_name_plural = 'Audit Log Entries'

    def save(self, *args, **kwargs):
        if self._state.adding and not self.user_name and self.user_id:
            self.user_name = (self.user.full_name or self.user.get_username())[:255]
            self.user_email = (self.user.email or '')[:254]
        super().save(*args, **kwargs)

    def __str__(self):
        return f'[{self.timestamp:%Y-%m-%d %H:%M}] {self.action} {self.model_name}: {self.object_repr}'
