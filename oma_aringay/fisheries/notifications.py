"""
Fisheries notifications - built on the project's ONE notification system (core.models.Notification, the
core.notifications helpers, the NotificationBell). Each event creates one notification for the owning
fisherfolk's account (their own wording, only their own records) and one per active staff account.

`record_type` names the event (the bell picks its title and link from it) and `record_id` is the production
cycle, so a click opens that cycle. Events are queued with transaction.on_commit: they are written only once
the cycle / harvest is really saved, never for a failed or rolled-back request, and a notification problem
can never fail the save itself (the helpers are non-fatal).
"""
from django.db import transaction

from core.notifications import _safe_bulk, build_owner_and_staff_notifications, notify_owner_and_staff, resolve_owner_user

CYCLE_STARTED = 'fisheries_cycle_started'
FORCE_HARVEST = 'fisheries_force_harvest'
# The emergency Force Harvest (Aquaculture Monitoring ⋮ menu): Admin accounts only; record_id is the harvest record.
EMERGENCY_FORCE_HARVEST = 'fisheries_emergency_force_harvest'
HARVEST_REMINDER_7D = 'fisheries_harvest_reminder_7d'
HARVEST_REMINDER_3D = 'fisheries_harvest_reminder_3d'
HARVEST_REMINDERS = {7: HARVEST_REMINDER_7D, 3: HARVEST_REMINDER_3D}
MAX_UNITS_LISTED = 4


def fmt_date(value):
    return value.strftime('%b %d, %Y') if value else None


def join(*parts):
    return ' · '.join(str(p) for p in parts if p)


def species_name(stock, cycle=None):
    if stock is not None and stock.species_id:
        return stock.species.species_name
    return getattr(cycle, 'species_farmed', None) or 'Stock'


def cycle_label(stock, cycle, cycle_no=None):
    """"Bangus · Grow-out Phase · Cycle #2" - species, the cycle's name and its repeat number."""
    return join(species_name(stock, cycle), cycle.cycle_name if cycle else None, f'Cycle #{cycle_no}' if cycle_no else None)


def units_summary(labels):
    """"Pond 1, Pond 2, Pond 3" - compact: at most MAX_UNITS_LISTED names, then "+N more"."""
    if len(labels) <= MAX_UNITS_LISTED:
        return ', '.join(labels)
    return f"{', '.join(labels[:MAX_UNITS_LISTED])} +{len(labels) - MAX_UNITS_LISTED} more"


def _owner(cycle):
    return resolve_owner_user(fisherfolk_id=cycle.fisherfolk_id)


# ─── Production Cycle Started ─────────────────────────────────────────────────

def cycle_started_texts(cycle, stock, cycle_no):
    label = cycle_label(stock, cycle, cycle_no)
    detail = join(cycle.culture_system,
                  f'stocked {fmt_date(stock.date_stocked if stock else cycle.stocking_date)}',
                  f'est. harvest {fmt_date(stock.expected_harvest_date)}' if stock and stock.expected_harvest_date else None)
    owner_name = cycle.fisherfolk.full_name if cycle.fisherfolk_id else ''
    verb = 'started a new production cycle:'
    return (verb, label, detail), (verb, join(label, f'for {owner_name}' if owner_name else None), detail)


def queue_cycle_started(cycle, actor):
    """After a production cycle is created: notify its fisherfolk + staff once the create commits."""
    def send():
        stock = cycle.stocking_records.select_related('species').order_by('id').first()
        cycle_no = stock.compute_production_cycle_no() if stock else None
        owner_text, staff_text = cycle_started_texts(cycle, stock, cycle_no)
        notify_owner_and_staff(_owner(cycle), actor, CYCLE_STARTED, cycle.pk, owner_text, staff_text)
    transaction.on_commit(send)


# ─── Force Harvest ────────────────────────────────────────────────────────────

def force_harvest_texts(harvest, stock, cycle, unit_labels):
    label = cycle_label(stock, cycle)
    detail = join(units_summary(unit_labels), f'{harvest.quantity_kg} kg', fmt_date(harvest.harvest_date),
                  harvest.early_late_reason or None)
    owner_name = stock.fisherfolk.full_name if stock.fisherfolk_id else ''
    verb = 'recorded a Force Harvest:'
    return (verb, label, detail), (verb, join(label, f'for {owner_name}' if owner_name else None), detail)


def queue_force_harvest(harvest, actor):
    """After a Force Harvest is recorded: ONE notification for the event (all affected units summarized) to
    the owning fisherfolk + staff, once the harvest commits."""
    def send():
        stock = harvest.stocking_record
        cycle = stock.production_cycle if stock.production_cycle_id else None
        if cycle is None:
            return
        units = sorted(harvest.production_units.all(), key=lambda u: u.unit_number)
        unit_labels = [f'{u.get_unit_type_display()} {u.unit_number}' for u in units]
        owner_text, staff_text = force_harvest_texts(harvest, stock, cycle, unit_labels)
        notify_owner_and_staff(_owner(cycle), actor, FORCE_HARVEST, cycle.pk, owner_text, staff_text)
    transaction.on_commit(send)


def queue_emergency_force_harvest(harvest, actor):
    """After an emergency Force Harvest commits: ONE notification per recorded harvest (one production cycle) to every
    active ADMIN account - not the fisherfolk owner and not Focal Person accounts. It names the fisherfolk, species and
    cycle, the ponds/cages, the harvest date, the total actual kg and the reason; clicking it opens that Force Harvest.
    Written only once the transaction commits (never for a rolled-back request), never raises into the save, and never
    twice for the same harvest. The Health Log Force Harvest (queue_force_harvest above) is not affected."""
    def send():
        from django.contrib.auth import get_user_model
        from core.models import Notification
        from .models import EMERGENCY_FORCE_HARVEST_REASON_LABELS, FisheriesHarvestRecord

        try:
            if Notification.objects.filter(record_type=EMERGENCY_FORCE_HARVEST, record_id=harvest.pk).exists():
                return
            saved = FisheriesHarvestRecord.objects.select_related(
                'stocking_record__species', 'stocking_record__production_cycle', 'stocking_record__fisherfolk',
            ).prefetch_related('production_units').get(pk=harvest.pk)
            stock = saved.stocking_record
            cycle = stock.production_cycle
            units = sorted(saved.production_units.all(), key=lambda u: (u.unit_type, u.unit_number))
            unit_labels = [f'{u.get_unit_type_display()} {u.unit_number}' for u in units]
            label = cycle_label(stock, cycle, stock.compute_production_cycle_no())
            owner_name = stock.fisherfolk.full_name if stock.fisherfolk_id else ''
            text = (
                'recorded an emergency Force Harvest:',
                join(label, f'for {owner_name}' if owner_name else None),
                join(units_summary(unit_labels), fmt_date(saved.harvest_date), f'{saved.quantity_kg} kg',
                     EMERGENCY_FORCE_HARVEST_REASON_LABELS.get(saved.force_harvest_reason)),
            )
            admins = get_user_model().objects.filter(is_active=True, role='ADMIN')
            rows = build_owner_and_staff_notifications(None, admins, actor, EMERGENCY_FORCE_HARVEST, saved.pk, text, text)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('emergency force harvest notification failed (non-fatal): harvest=%s', harvest.pk)
            return
        _safe_bulk(rows, f'emergency_force_harvest harvest={harvest.pk}')
    transaction.on_commit(send)


# ─── Harvest reminders (sent by the send_fisheries_harvest_reminders command) ──

def reminder_texts(days, stock, cycle, location):
    label = cycle_label(stock, cycle)
    detail = join(f'expected {fmt_date(stock.expected_harvest_date)}', cycle.culture_system, location)
    owner_name = stock.fisherfolk.full_name if stock.fisherfolk_id else ''
    return ((f'Harvest expected in {days} days for your', label, detail),
            (f'Harvest expected in {days} days for', join(owner_name, label), detail))


def due_harvest_reminders(today):
    """{cycle_id: (days, stocking_record)} for every ACTIVE production cycle whose expected harvest date - the
    same StockingRecord.expected_harvest_date Forecasting shows - is exactly 7 or 3 days after `today`.
    Skips cycles already harvested (final harvest / Total Loss, or the cycle itself no longer Active); a cycle
    with only some ponds/cages harvested is still Stocked/Near Harvest and Active, so it is still reminded."""
    from datetime import timedelta
    from .models import StockingRecord
    days_by_date = {today + timedelta(days=d): d for d in HARVEST_REMINDERS}
    stocks = StockingRecord.objects.filter(
        production_cycle__isnull=False, production_cycle__status='Active',
        status__in=[StockingRecord.Status.STOCKED, StockingRecord.Status.NEAR_HARVEST],
        expected_harvest_date__in=list(days_by_date),
    ).select_related('fisherfolk', 'species', 'production_cycle').order_by('production_cycle_id', 'id')
    due = {}
    for stock in stocks:
        due.setdefault(stock.production_cycle_id, (days_by_date[stock.expected_harvest_date], stock))
    return due


def build_harvest_reminders(today):
    """The unsaved reminder notifications due `today`, and how many reminder events were already sent.
    Idempotent: a cycle that already has its 7-day (or 3-day) reminder - for any recipient, ever - gets no
    second one, so re-running the same day (or after the date moved) never duplicates it."""
    from django.contrib.auth import get_user_model
    from accounts.models import UserLinkedRecord
    from core.models import Notification
    from core.notifications import STAFF_NOTIFICATION_ROLES, build_owner_and_staff_notifications

    due = due_harvest_reminders(today)
    if not due:
        return [], 0, 0
    sent = set(Notification.objects.filter(
        record_type__in=HARVEST_REMINDERS.values(), record_id__in=list(due),
    ).values_list('record_type', 'record_id').distinct())
    pending = {cid: v for cid, v in due.items() if (HARVEST_REMINDERS[v[0]], cid) not in sent}
    if not pending:
        return [], 0, len(due)
    User = get_user_model()
    staff = list(User.objects.filter(is_active=True, role__in=STAFF_NOTIFICATION_ROLES))
    # The fisherfolk's own active citizen account (what resolve_owner_user() picks), for all cycles at once.
    ff_ids = {stock.fisherfolk_id for _, stock in pending.values() if stock.fisherfolk_id}
    links = UserLinkedRecord.objects.filter(
        record_type=User.LinkedRecordType.FISHERFOLK, record_id__in=ff_ids, is_active=True, user__is_active=True,
    ).select_related('user').order_by('user_id')
    owner_by_ff = {}
    for link in links:
        owner_by_ff.setdefault(link.record_id, link.user)
    rows = []
    for cycle_id, (days, stock) in pending.items():
        owner_text, staff_text = reminder_texts(days, stock, stock.production_cycle, stock.pond_location_barangay or None)
        rows += build_owner_and_staff_notifications(owner_by_ff.get(stock.fisherfolk_id), staff, None,
                                                    HARVEST_REMINDERS[days], cycle_id, owner_text, staff_text)
    return rows, len(pending), len(due) - len(pending)
