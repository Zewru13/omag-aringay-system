from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

# ─── Record Locking ───────────────────────────────────────────────────────────
#
# RecordLock uses an explicit (record_type, record_id) pair rather than
# Django's ContentType framework + GenericForeignKey. Justification:
#   - The API contract this app exposes (POST /api/locks/acquire/ etc.)
#     already speaks in terms of a `record_type` string ("crop"/"stocking"),
#     so a plain CharField maps 1:1 onto it — no translation layer to a
#     ContentType id is needed.
#   - Only two record types exist today (crop monitoring, fisheries
#     stocking), and adding a third later is just one more choice value —
#     no migration coupling to whichever app owns that model.
#   - A plain (record_type, record_id) unique-together index is exactly the
#     DB-level guard the race-condition requirement needs (two simultaneous
#     acquire attempts for the same record race to INSERT the same unique
#     key; the DB itself guarantees only one wins). GenericForeignKey adds
#     an extra join and an extra moving part (ContentType lookups) for no
#     benefit here.

LOCK_TIMEOUT = timedelta(minutes=10)


class RecordLock(models.Model):
    RECORD_TYPE_CHOICES = [
        ('crop', 'Crop Monitoring Record'),
        ('stocking', 'Fisheries Stocking Record'),
    ]

    record_type = models.CharField(max_length=20, choices=RECORD_TYPE_CHOICES)
    record_id = models.PositiveIntegerField()
    locked_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='record_locks',
    )
    locked_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['record_type', 'record_id'], name='unique_lock_per_record'),
        ]
        indexes = [
            models.Index(fields=['record_type', 'record_id']),
        ]

    def is_active(self):
        return timezone.now() - self.locked_at < LOCK_TIMEOUT

    def expires_in_seconds(self):
        remaining = LOCK_TIMEOUT - (timezone.now() - self.locked_at)
        return max(0, int(remaining.total_seconds()))

    def __str__(self):
        return f'{self.record_type}:{self.record_id} locked by {self.locked_by}'


# ─── In-app Notifications ─────────────────────────────────────────────────────

class Notification(models.Model):
    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='+',
    )
    verb = models.CharField(max_length=100)
    record_type = models.CharField(max_length=20, blank=True)
    record_id = models.PositiveIntegerField(null=True, blank=True)
    record_label = models.CharField(
        max_length=255, blank=True,
        help_text='Denormalized so the notification still reads correctly if the record changes later.',
    )
    detail = models.CharField(max_length=255, blank=True)
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['recipient', 'is_read']),
        ]

    def __str__(self):
        return f'{self.actor} {self.verb} {self.record_label}'
