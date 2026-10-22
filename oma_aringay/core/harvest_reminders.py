"""
Harvest reminders for farmers (crop records) and fisherfolk (production cycles).

An active crop record / production cycle with an expected harvest date sends its owner ONE notification at each of:
30 days before, 7 days before, 3 days before, the harvest day, and 7 days after (still not harvested). Only the owner's own
account is told; office staff are not.

How it stays correct without a scheduler:
  - run(today) is idempotent: a record never gets the same milestone twice (checked against the notifications already
    saved), and on PostgreSQL an advisory lock stops two simultaneous runs from both inserting;
  - a milestone is sent on its day, or up to GRACE_DAYS late when nobody used the system on that exact day (the wording then
    uses the real days left), and never for records long past their milestone - so switching this on does not flood owners
    of old, still-open records;
  - run_daily_once() runs it at most once per day per server process; the notification list calls it, so the first poll
    of the day creates that day's reminders. The management command send_harvest_reminders runs it on demand.

The two kinds of record are supplied by providers (production.harvest_reminders, fisheries.notifications) that return
Candidate objects, so this module knows nothing about crops or ponds.
"""
import logging
from collections import namedtuple
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.utils import timezone

from .models import Notification
from .notifications import fit

logger = logging.getLogger(__name__)

ADVISORY_LOCK_KEY = 74_318_202_602   # arbitrary constant, unique to this module

# (key, days left at which it is due). Days left = expected harvest date - today; negative once it has passed.
MILESTONES = (('30d', 30), ('7d', 7), ('3d', 3), ('today', 0), ('overdue', -7))
GRACE_DAYS = 3
# The widest range of days left any milestone can still be sent in; providers only look at records inside it.
EARLIEST_DAYS_LEFT = MILESTONES[0][1]
LATEST_DAYS_LEFT = MILESTONES[-1][1] - GRACE_DAYS

# One record that may need a reminder. `owner_kind` is 'farmer' or 'fisherfolk'; `label` / `place` feed the wording.
Candidate = namedtuple('Candidate', 'type_prefix record_id owner_kind owner_id expected_date label place')


def record_type(type_prefix, key):
    return f'{type_prefix}_{key}'


def milestone_for(days_left):
    """The milestone key to send for a record with `days_left` until harvest, or None. It is the latest milestone already
    reached that is at most GRACE_DAYS late (so 5 days left is the 7-day milestone, 2 days left is the 3-day one)."""
    due = None
    for key, at in MILESTONES:
        if 0 <= at - days_left <= GRACE_DAYS:
            due = key
    return due


def texts(key, days_left, label, expected_date, place):
    """(verb, record_label, detail) in the owner's own wording."""
    if key == 'overdue':
        n = -days_left
        verb = f'Harvest is {n} day{"s" if n != 1 else ""} overdue for your'
    elif days_left > 0:
        verb = f'Harvest expected in {days_left} day{"s" if days_left != 1 else ""} for your'
    elif days_left == 0:
        verb = 'Harvest is expected today for your'
    else:
        n = -days_left
        verb = f'Harvest was expected {n} day{"s" if n != 1 else ""} ago for your'
    detail = ' · '.join(p for p in (f'expected {expected_date.strftime("%b %d, %Y")}', place) if p)
    return verb, label, detail


def _owners(candidates):
    """{(owner_kind, owner_id): user} - each record owner's own active citizen account."""
    from accounts.models import UserLinkedRecord
    User = get_user_model()
    kinds = {'farmer': User.LinkedRecordType.FARMER, 'fisherfolk': User.LinkedRecordType.FISHERFOLK}
    owners = {}
    for kind, link_type in kinds.items():
        ids = {c.owner_id for c in candidates if c.owner_kind == kind and c.owner_id}
        if not ids:
            continue
        links = UserLinkedRecord.objects.filter(
            record_type=link_type, record_id__in=ids, is_active=True, user__is_active=True,
        ).select_related('user').order_by('user_id')
        for link in links:
            owners.setdefault((kind, link.record_id), link.user)
    return owners


def build(today, candidates):
    """(unsaved notifications, number of reminder events) due `today` for these candidates."""
    due = []
    for c in candidates:
        days_left = (c.expected_date - today).days
        key = milestone_for(days_left)
        if key:
            due.append((c, key, days_left))
    if not due:
        return [], 0
    wanted = {record_type(c.type_prefix, key) for c, key, _ in due}
    sent = set(Notification.objects.filter(
        record_type__in=wanted, record_id__in={c.record_id for c, _, _ in due},
    ).values_list('record_type', 'record_id'))
    pending = [(c, key, d) for c, key, d in due if (record_type(c.type_prefix, key), c.record_id) not in sent]
    owners = _owners([c for c, _, _ in pending])
    rows, events = [], 0
    for c, key, days_left in pending:
        owner = owners.get((c.owner_kind, c.owner_id))
        if owner is None:
            continue   # no account to tell; it is looked at again on the next run
        verb, label, detail = texts(key, days_left, c.label, c.expected_date, c.place)
        rows.append(Notification(recipient=owner, actor=None, verb=fit(verb, 'verb'), record_type=record_type(c.type_prefix, key),
                                 record_id=c.record_id, record_label=fit(label, 'record_label'), detail=fit(detail, 'detail')))
        events += 1
    return rows, events


def candidates_for(today):
    """Every record that could need a reminder today, from both kinds of record."""
    from fisheries.notifications import harvest_reminder_candidates as fisheries
    from production.harvest_reminders import harvest_reminder_candidates as crops
    return crops(today) + fisheries(today)


def run(today=None, dry_run=False, providers=None):
    """Create the reminders due `today`. Returns (events, notifications) - what was (or with dry_run, would be) sent."""
    today = today or timezone.localdate()
    with transaction.atomic():
        if connection.vendor == 'postgresql':
            with connection.cursor() as cursor:
                cursor.execute('SELECT pg_try_advisory_xact_lock(%s)', [ADVISORY_LOCK_KEY])
                if not cursor.fetchone()[0]:
                    return 0, 0   # another run is in progress and will create them
        rows, events = build(today, providers(today) if providers else candidates_for(today))
        if dry_run:
            transaction.set_rollback(True)
        elif rows:
            Notification.objects.bulk_create(rows)
    return events, len(rows)


_last_run = {'date': None}


def run_daily_once():
    """Run today's reminders if this server process has not yet today. Never raises: a problem here must not break the
    request that triggered it (the next request tries again)."""
    today = timezone.localdate()
    if _last_run['date'] == today:
        return
    try:
        run(today)
    except Exception:
        logger.exception('Daily harvest reminders failed (non-fatal)')
        return
    _last_run['date'] = today
