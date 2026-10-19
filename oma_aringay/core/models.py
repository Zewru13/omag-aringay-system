import uuid
from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from core.pcic import pcic_form_path


class PcicInsurance(models.Model):
    """Fields for a record that can be covered by PCIC crop insurance: the box, and the photo of the insurance form
    (see core.pcic). Unticking the box removes the photo."""
    has_pcic_insurance = models.BooleanField(default=False)
    pcic_form_photo = models.ImageField(upload_to=pcic_form_path, null=True, blank=True)

    class Meta:
        abstract = True

    def save(self, *args, **kwargs):
        if not self.has_pcic_insurance and self.pcic_form_photo:
            self.pcic_form_photo.delete(save=False)
            self.pcic_form_photo = None
        super().save(*args, **kwargs)


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
    # Widened from 20 to 50 (hardening batch): every current value is a
    # descriptive snake_case tag and the old ceiling left almost no margin —
    # 'fisherfolk_disaster' (19 chars) and 'ff_beneficiary_obo' (18 chars)
    # were already within 1-2 chars of it, which is exactly why this field
    # has twice silently truncated/failed a real notification. Free-text
    # (no choices=), and its only consumer — NotificationBell.jsx's
    # RECORD_TYPE_ROUTES[n.record_type] — is a plain string-keyed dict
    # lookup, completely length-insensitive. Not to be confused with
    # RecordLock.record_type above, a separate, choices-constrained field on
    # an unrelated model, deliberately left untouched.
    record_type = models.CharField(max_length=50, blank=True)
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


# ─── Profile change requests ──────────────────────────────────────────────
#
# A citizen may edit some of their own registry data instantly (contact
# number, profile picture) but NOT the fields that identify them in the
# government registry — name, barangay, organization name/address. Those go
# through this queue for staff review instead.
#
# The (linked_record_type, linked_record_id) pair intentionally mirrors
# User.linked_record_type/linked_record_id rather than using ContentType +
# GenericForeignKey — same reasoning as RecordLock above, and it means a
# request row can be matched to its submitter's account with a plain
# equality check instead of a content-type lookup.
#
# ONE ROW PER FIELD. A person changing their full name files three rows
# (first_name, middle_name, last_name), so an evaluator approves "last name
# Cruz -> Cruz-Santos" rather than parsing a combined string, and so a
# single wrong part can be rejected without discarding the rest.
class ProfileChangeRequest(models.Model):
    class RecordType(models.TextChoices):
        FARMER = 'FARMER', 'Farmer'
        FISHERFOLK = 'FISHERFOLK', 'Fisherfolk'
        FARMERS_ORG = 'FARMERS_ORG', 'Farmers Organization'
        FISHERFOLK_ORG = 'FISHERFOLK_ORG', 'Fisherfolk Organization'

    class Status(models.TextChoices):
        PENDING = 'PENDING', 'Pending'
        APPROVED = 'APPROVED', 'Approved'
        REJECTED = 'REJECTED', 'Rejected'

    # Which fields each record type is allowed to request changes to. The
    # citizen-facing serializer validates against this, so widening the set
    # is a deliberate edit here rather than something a client can assert.
    REQUESTABLE_FIELDS = {
        RecordType.FARMER: ['first_name', 'middle_name', 'last_name', 'barangay'],
        RecordType.FISHERFOLK: ['first_name', 'middle_name', 'last_name', 'barangay'],
        RecordType.FARMERS_ORG: ['name', 'barangay', 'street_address', 'email_address', 'contact_person'],
        RecordType.FISHERFOLK_ORG: ['name', 'barangay', 'street_address', 'email_address', 'contact_person'],
    }

    # Organization changes are reviewed twice: one Admin and one Focal Person
    # (User.Roles.EVALUATOR) must both approve before the value is written.
    ORGANIZATION_TYPES = (RecordType.FARMERS_ORG, RecordType.FISHERFOLK_ORG)

    linked_record_type = models.CharField(max_length=20, choices=RecordType.choices)
    linked_record_id = models.PositiveIntegerField()

    field_name = models.CharField(max_length=50)
    old_value = models.CharField(max_length=255, blank=True)
    requested_value = models.CharField(max_length=255)

    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)

    requested_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE,
        related_name='profile_change_requests',
    )
    requested_at = models.DateTimeField(auto_now_add=True)

    reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='reviewed_profile_change_requests',
    )
    reviewed_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True)

    # Two-approval review (organizations only). Rows created before this
    # existed keep requires_both=False and complete on one approval.
    requires_both = models.BooleanField(default=False)
    admin_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    admin_approved_at = models.DateTimeField(null=True, blank=True)
    focal_approved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL,
        null=True, blank=True, related_name='+',
    )
    focal_approved_at = models.DateTimeField(null=True, blank=True)

    def awaiting(self):
        """Roles whose approval is still missing: [] unless this is a pending two-approval request."""
        if not self.requires_both or self.status != self.Status.PENDING:
            return []
        roles = []
        if self.admin_approved_at is None:
            roles.append('ADMIN')
        if self.focal_approved_at is None:
            roles.append('EVALUATOR')
        return roles

    class Meta:
        ordering = ['-requested_at']
        indexes = [
            models.Index(fields=['status', 'requested_at']),
            models.Index(fields=['linked_record_type', 'linked_record_id']),
        ]
        constraints = [
            # At most ONE pending request per record+field.
            #
            # NOTE: this is a no-op on the database this project actually
            # runs (MariaDB/MySQL) — Django reports models.W036 "MySQL does
            # not support unique constraints with conditions" and simply
            # does not create it. It is kept because it IS enforced on
            # PostgreSQL/SQLite and documents the intent, but it must not be
            # relied on here.
            #
            # The real enforcement for this deployment is in
            # ProfileChangeRequestCreateSerializer, which does the duplicate
            # check inside a transaction with select_for_update() on the
            # existing pending rows — see its docstring.
            models.UniqueConstraint(
                fields=['linked_record_type', 'linked_record_id', 'field_name'],
                condition=models.Q(status='PENDING'),
                name='uniq_pending_change_per_record_field',
            ),
        ]

    def __str__(self):
        return (f'{self.linked_record_type}#{self.linked_record_id} '
                f'{self.field_name}: {self.old_value!r} -> {self.requested_value!r} '
                f'({self.status})')


class ImportBatch(models.Model):
    """One committed import: what it added is remembered (ImportBatchItem) so staff can undo it. Written in the same
    transaction as the import, so an import that rolls back leaves no batch. See core.import_batches."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    import_type = models.CharField(max_length=30, db_index=True)
    label = models.CharField(max_length=255, blank=True)
    performed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='import_batches')
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    row_count = models.PositiveIntegerField(default=0)
    undone_at = models.DateTimeField(null=True, blank=True)
    undone_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name='+')

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.import_type} import {self.created_at:%Y-%m-%d %H:%M}'


class ImportBatchItem(models.Model):
    class Action(models.TextChoices):
        CREATE = 'CREATE', 'Created by the import'
        RESTORE = 'RESTORE', 'Changed by the import (can be put back)'

    batch = models.ForeignKey(ImportBatch, on_delete=models.CASCADE, related_name='items')
    model_label = models.CharField(max_length=100)
    object_id = models.PositiveIntegerField()
    action = models.CharField(max_length=10, choices=Action.choices)
    field_name = models.CharField(max_length=50, blank=True)
    old_value = models.TextField(blank=True)
    new_value = models.TextField(blank=True)
    fingerprint = models.CharField(max_length=64, blank=True)
    undone_at = models.DateTimeField(null=True, blank=True)
    kept_reason = models.CharField(max_length=255, blank=True)

    class Meta:
        indexes = [models.Index(fields=['batch', 'action'])]
        ordering = ['id']
