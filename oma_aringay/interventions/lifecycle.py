"""The life of a distribution: Scheduled until its day and time, then Received (no job scheduler: the status is brought up to
date whenever assistance is read), and what a recipient with an account is told along the way. Farmer and cooperative accounts
get every notification by e-mail too (core.notification_email)."""
import logging

from django.db.models import Q
from django.utils import timezone

from core.notifications import notify_user, resolve_owner_user

from .models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

logger = logging.getLogger(__name__)


def mark_distributions_received():
    """Turn every Scheduled record whose day and time have come into Received. One UPDATE per record table, so it is safe to
    call on every read of assistance. Older waiting records are left to the migration that removed confirming."""
    now = timezone.localtime()
    passed = Q(date_given__lt=now.date()) | (
        Q(date_given=now.date()) & (Q(distribution_time__isnull=True) | Q(distribution_time__lte=now.time())))
    for model in (BeneficiaryRecord, FisherfolkBeneficiaryRecord):
        model.objects.filter(passed, status=DistributionStatus.PENDING).update(status=DistributionStatus.CONFIRMED)


class CurrentStatusMixin:
    """For a view that reads or edits assistance: statuses are brought up to date before it does (after the sign-in and
    permission checks)."""

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        mark_distributions_received()


def schedule_text(record):
    """"Nov 28, 2026 at 9:00 AM, Barangay Hall" - as much of it as the record has."""
    day = record._meta.get_field('date_given').to_python(record.date_given)
    text = f'{day:%b} {day.day}, {day.year}'
    at = record._meta.get_field('distribution_time').to_python(record.distribution_time)
    if at:
        text += f' at {at.strftime("%I:%M %p").lstrip("0")}'
    return f'{text}, {record.distribution_place}' if record.distribution_place else text


def _tell(record, actor, verb, detail):
    """Tell the person a record is for, if they have an account. Only their own account (never a cooperative's), never the
    person who did it, and never an error: this runs after the change is saved."""
    try:
        if isinstance(record, FisherfolkBeneficiaryRecord):
            recipient = resolve_owner_user(fisherfolk_id=record.fisherfolk_id)
            record_type = 'ff_beneficiary'   # a notification's record_type holds 20 characters
        else:
            recipient = resolve_owner_user(farmer_id=record.farmer_id)
            record_type = 'beneficiary'
        if recipient is None or (actor is not None and recipient.pk == actor.pk):
            return
        notify_user(
            recipient=recipient, actor=actor, verb=verb, record_type=record_type, record_id=record.id,
            record_label=f'{record.assistance_type or "Assistance"} — {record.date_given}', detail=detail[:255])
    except Exception:
        logger.exception('Telling the recipient failed (non-fatal): record=%s', getattr(record, 'pk', None))


def _with_quantity(record, text):
    quantity = str(record.quantity or '').strip()
    # Edit saves a cash amount as a plain number; in a message it reads as pesos.
    if record.assistance_type == 'Cash Assistance' and quantity.replace('.', '', 1).isdigit():
        quantity = f'₱{quantity}'
    return f'{quantity} — {text}' if quantity else text


def notify_assistance_recorded(record, actor):
    """A new record: where and when to claim it (or, when that time has already passed, that it was recorded as received).
    Not used by the spreadsheet imports: they load past records in bulk, and old news would flood accounts."""
    if record.status == DistributionStatus.PENDING:
        _tell(record, actor, 'scheduled assistance for you:', _with_quantity(record, f'claim it on {schedule_text(record)}'))
    elif record.status == DistributionStatus.CONFIRMED:
        _tell(record, actor, 'recorded assistance for you:', _with_quantity(record, f'given on {schedule_text(record)}'))


def notify_schedule_changed(record, actor):
    _tell(record, actor, 'changed the schedule of your assistance:', _with_quantity(record, f'claim it on {schedule_text(record)}'))


def notify_removed_from_schedule(record, actor):
    """Taken off before the day: they must not go there expecting it."""
    _tell(record, actor, 'removed you from a scheduled distribution:', _with_quantity(record, f'was set for {schedule_text(record)}'))
