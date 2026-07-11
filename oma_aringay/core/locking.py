"""
Server-side record-locking enforcement shared by the crop monitoring and
fisheries stocking domains. This is the real guarantee — the lock/acquire/
release endpoints exist for the UI, but a direct API call that skips
`acquire` entirely is still blocked here, at the point of the actual write.
"""
from django.db import IntegrityError, transaction
from rest_framework.exceptions import APIException

from .models import RecordLock


class RecordLockedException(APIException):
    status_code = 409
    default_detail = 'This record is currently locked by another user.'
    default_code = 'record_locked'

    def __init__(self, lock):
        super().__init__(detail={
            'locked': True,
            'locked_by': {'id': lock.locked_by_id, 'name': lock.locked_by.full_name or lock.locked_by.email},
            'locked_at': lock.locked_at.isoformat(),
            'expires_in_seconds': lock.expires_in_seconds(),
        })


def assert_not_locked_by_other(user, record_type, record_id):
    """Raise RecordLockedException (409) if record_type/record_id is
    actively locked by someone other than `user`. No active lock, an
    expired (stale) lock, or a lock already owned by `user` all pass."""
    try:
        lock = RecordLock.objects.select_related('locked_by').get(
            record_type=record_type, record_id=record_id,
        )
    except RecordLock.DoesNotExist:
        return
    if lock.is_active() and lock.locked_by_id != user.id:
        raise RecordLockedException(lock)


def acquire_lock(user, record_type, record_id):
    """
    Take (or refresh) the lock for `user`. Returns the RecordLock on success,
    or None if it's actively held by someone else.

    Race safety: always attempt the INSERT first. The UniqueConstraint on
    (record_type, record_id) is what serializes two concurrent "nobody has
    locked this yet" requests — the DB accepts exactly one INSERT and raises
    IntegrityError for the other, which is caught below and re-resolved as a
    normal contested-lock check via select_for_update() on the now-existing
    row.

    Deliberately NOT doing select_for_update().get() as the first attempt:
    under MySQL/InnoDB, `SELECT ... FOR UPDATE` against a row that doesn't
    exist yet still takes a gap lock (to guard against phantom inserts in
    that key range). Two transactions doing that concurrently for the same
    not-yet-existing key can each hold a gap lock the other is waiting on —
    a genuine deadlock (confirmed live: MySQL error 1213). Only locking rows
    that are already known to exist avoids that gap-lock path entirely.
    """
    try:
        with transaction.atomic():
            return RecordLock.objects.create(
                record_type=record_type, record_id=record_id, locked_by=user,
            )
    except IntegrityError:
        pass

    with transaction.atomic():
        lock = RecordLock.objects.select_for_update().get(
            record_type=record_type, record_id=record_id,
        )
        if not lock.is_active() or lock.locked_by_id == user.id:
            lock.locked_by = user
            lock.save(update_fields=['locked_by', 'locked_at'])
            return lock
        return None
