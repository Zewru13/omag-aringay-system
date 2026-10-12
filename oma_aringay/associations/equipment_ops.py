"""Unit arithmetic for an organization's equipment, shared by the farmers and fisherfolk sides.

A line is one kind of equipment in one condition with a `quantity` of units. Some of those units can be out on loan.
  on_loan   = units of the line in loans that are BORROWED or RETURN_PENDING
  movable   = quantity - on_loan         (units that may change condition or be repaired)
  available = movable for a Good line, 0 for any other condition (units that may be lent)
"""
import logging
from typing import NamedTuple

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError

from farmers.models import Farmer
from fisheries.models import Fisherfolk

from .models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan,
    FarmersOrganizationEquipmentRepair, FarmersOrganizationMember,
    FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationEquipmentLoan,
    FisherfolkOrganizationEquipmentRepair, FisherfolkOrganizationMember,
)

logger = logging.getLogger(__name__)

OUT_STATUSES = ('BORROWED', 'RETURN_PENDING')
GOOD = 'Good'


class EquipmentDomain(NamedTuple):
    key: str
    org_model: type
    line_model: type
    loan_model: type
    repair_model: type
    member_model: type       # the organization-membership join table
    person_model: type
    person_field: str        # 'farmer' | 'fisherfolk' (the person FK on the membership and the loan's `member` target)
    linked_type: str         # UserLinkedRecord / User.LinkedRecordType of the organization account


_DOMAINS = {
    'farmers': EquipmentDomain(
        'farmers', FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan,
        FarmersOrganizationEquipmentRepair, FarmersOrganizationMember, Farmer, 'farmer', 'FARMERS_ORG'),
    'fisherfolk': EquipmentDomain(
        'fisherfolk', FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationEquipmentLoan,
        FisherfolkOrganizationEquipmentRepair, FisherfolkOrganizationMember, Fisherfolk, 'fisherfolk', 'FISHERFOLK_ORG'),
}


def equipment_domain(key):
    """The models for 'farmers' or 'fisherfolk'; KeyError for anything else."""
    return _DOMAINS[key]


def on_loan(line):
    """Units of the line that are out. Reads `line.loans.all()` so a prefetch is used when there is one."""
    return sum(loan.quantity for loan in line.loans.all() if loan.status in OUT_STATUSES)


def movable(line):
    return line.quantity - on_loan(line)


def available(line):
    return movable(line) if line.condition == GOOD else 0


def is_overdue(loan, today=None):
    """Out on loan with a return-by date that has passed (computed, never stored)."""
    if loan.status not in OUT_STATUSES or not loan.due_date:
        return False
    return loan.due_date < (today or timezone.localdate())


def holders(line):
    """Who has units of this line right now."""
    today = timezone.localdate()
    return [
        {
            'loan_id': loan.id, 'member_id': loan.member_id, 'member_name': loan.member.full_name,
            'quantity': loan.quantity, 'borrowed_at': loan.borrowed_at, 'due_date': loan.due_date,
            'overdue': is_overdue(loan, today),
        }
        for loan in line.loans.all() if loan.status in OUT_STATUSES
    ]


REPAIRABLE = ('Needs Repair', 'Not Operational', 'Broken')


def equipment_label(line):
    if line.equipment_name == 'Other' and line.equipment_name_other:
        return f'Other \u2014 {line.equipment_name_other}'
    return line.equipment_name


def lock_line(domain, pk):
    """Re-read an equipment line with its row locked (call inside transaction.atomic)."""
    return domain.line_model.objects.select_for_update().filter(pk=pk).first()


def _target_line(domain, source, condition):
    """The line that receives moved units: the first line of the same equipment in that condition, or a new empty one that
    copies the source's acquisition date and remarks."""
    target = (
        domain.line_model.objects.select_for_update()
        .filter(organization_id=source.organization_id, equipment_name=source.equipment_name,
                equipment_name_other=source.equipment_name_other, condition=condition)
        .exclude(pk=source.pk).order_by('id').first()
    )
    if target is None:
        target = domain.line_model.objects.create(
            organization_id=source.organization_id, equipment_name=source.equipment_name,
            equipment_name_other=source.equipment_name_other, condition=condition, quantity=0,
            acquisition_date=source.acquisition_date, remarks=source.remarks)
    return target


def move_units(domain, line, quantity, condition):
    """Move `quantity` units of a locked `line` to `condition` (inside the caller's transaction). Units out on loan stay."""
    room = movable(line)
    if quantity > room:
        raise ValidationError({'detail': f'Only {room} units can be moved (the rest are out on loan).'})
    target = _target_line(domain, line, condition)
    line.quantity -= quantity
    target.quantity += quantity
    line.save(update_fields=['quantity'])
    target.save(update_fields=['quantity'])
    return target


def change_condition(domain, line_pk, quantity, condition):
    """Change the condition of some units of a line. Returns (source line, target line)."""
    with transaction.atomic():
        line = lock_line(domain, line_pk)
        if line is None:
            raise NotFound()
        if condition == line.condition:
            raise ValidationError({'condition': 'Choose a different condition.'})
        target = move_units(domain, line, quantity, condition)
        return line, target


def repair(domain, user, line_pk, quantity, repaired_on, description, cost=None):
    """Repair `quantity` units of a Needs Repair / Not Operational / Broken line: they go back to Good and a log row is written."""
    with transaction.atomic():
        line = lock_line(domain, line_pk)
        if line is None:
            raise NotFound()
        if line.condition not in REPAIRABLE:
            raise ValidationError({'detail': 'Only equipment that needs repair, is not operational or is broken can be repaired.'})
        from_condition = line.condition
        move_units(domain, line, quantity, GOOD)
        return domain.repair_model.objects.create(
            equipment=line, quantity=quantity, repaired_on=repaired_on, description=description, cost=cost,
            from_condition=from_condition, recorded_by=user)


def repair_data(repair_row):
    return {
        'id': repair_row.id, 'quantity': repair_row.quantity, 'repaired_on': repair_row.repaired_on,
        'description': repair_row.description, 'cost': None if repair_row.cost is None else str(repair_row.cost),
        'from_condition': repair_row.from_condition,
        'recorded_by_name': (repair_row.recorded_by.full_name or repair_row.recorded_by.username) if repair_row.recorded_by else None,
        'recorded_at': repair_row.recorded_at,
    }


def loan_data(loan, today=None):
    """A loan as the screens and the history endpoint show it."""
    return {
        'id': loan.id, 'equipment_id': loan.equipment_id, 'equipment_name': equipment_label(loan.equipment),
        'member_id': loan.member_id, 'member_name': loan.member.full_name, 'quantity': loan.quantity,
        'status': loan.status, 'origin': loan.origin, 'requested_at': loan.requested_at, 'borrowed_at': loan.borrowed_at,
        'due_date': loan.due_date, 'return_requested_at': loan.return_requested_at, 'returned_at': loan.returned_at,
        'return_breakdown': loan.return_breakdown, 'member_note': loan.member_note, 'reject_reason': loan.reject_reason,
        'overdue': is_overdue(loan, today),
    }


# ─── Loans ───────────────────────────────────────────────────────────────────

def _lock_loan(domain, pk):
    return domain.loan_model.objects.select_for_update().select_related('equipment', 'member').filter(pk=pk).first()


def _lock_line_of_loan(domain, loan_pk):
    """Lock the equipment line of a loan first (the order every action uses), then the loan itself."""
    loan = domain.loan_model.objects.filter(pk=loan_pk).select_related('equipment').first()
    if loan is None:
        raise NotFound()
    line = lock_line(domain, loan.equipment_id)
    loan = _lock_loan(domain, loan_pk)
    return line, loan


def _require_available(line, quantity):
    if line.condition != GOOD:
        raise ValidationError({'detail': 'Only equipment in Good condition can be lent.'})
    room = available(line)
    if quantity > room:
        raise ValidationError({'detail': f'Only {room} units are available.'})


def lend(domain, user, line_pk, member_id, quantity, due_date=None):
    """The organization hands `quantity` Good units to one of its active members: the loan is BORROWED at once."""
    with transaction.atomic():
        line = lock_line(domain, line_pk)
        if line is None:
            raise NotFound()
        _require_available(line, quantity)
        if not domain.member_model.objects.filter(
                organization_id=line.organization_id, is_active=True, **{f'{domain.person_field}_id': member_id}).exists():
            raise ValidationError({'member': 'This person is not an active member of the organization.'})
        now = timezone.now()
        loan = domain.loan_model.objects.create(
            equipment=line, member_id=member_id, quantity=quantity, status='BORROWED', origin='ORGANIZATION',
            requested_by=user, decided_by=user, decided_at=now, borrowed_at=now, due_date=due_date)
    return domain.loan_model.objects.select_related('equipment', 'member').get(pk=loan.pk)


def approve(domain, user, loan_pk):
    """Turn a member's request into a loan, re-checking the available units under the lock."""
    with transaction.atomic():
        line, loan = _lock_line_of_loan(domain, loan_pk)
        if loan.status != 'REQUESTED':
            raise ValidationError({'detail': 'This request has already been decided.'})
        _require_available(line, loan.quantity)
        now = timezone.now()
        loan.status, loan.decided_by, loan.decided_at, loan.borrowed_at = 'BORROWED', user, now, now
        loan.save(update_fields=['status', 'decided_by', 'decided_at', 'borrowed_at'])
    return loan


def reject(domain, user, loan_pk, reason=''):
    with transaction.atomic():
        line, loan = _lock_line_of_loan(domain, loan_pk)
        if loan.status != 'REQUESTED':
            raise ValidationError({'detail': 'This request has already been decided.'})
        loan.status, loan.decided_by, loan.decided_at = 'REJECTED', user, timezone.now()
        loan.reject_reason = (reason or '').strip()[:255]
        loan.save(update_fields=['status', 'decided_by', 'decided_at', 'reject_reason'])
    return loan


def clean_breakdown(domain, quantity, breakdown):
    """What came back, by condition, as {condition: units} (zero parts dropped). None means everything came back Good."""
    if breakdown is None or breakdown == '':
        return {GOOD: quantity}
    if not isinstance(breakdown, list) or not breakdown:
        raise ValidationError({'breakdown': 'Send the units that came back, by condition.'})
    valid = domain.line_model.Condition.values
    result = {}
    for part in breakdown:
        if not isinstance(part, dict):
            raise ValidationError({'breakdown': 'Send the units that came back, by condition.'})
        condition, units = part.get('condition'), part.get('quantity')
        if condition not in valid:
            raise ValidationError({'breakdown': f'Unknown condition "{condition}".'})
        if isinstance(units, bool) or not isinstance(units, int) or units < 0:
            raise ValidationError({'breakdown': 'Each quantity must be a whole number, 0 or more.'})
        result[condition] = result.get(condition, 0) + units
    if sum(result.values()) != quantity:
        raise ValidationError({'detail': f'The breakdown must add up to {quantity} units.'})
    return {condition: units for condition, units in result.items() if units}


def return_loan(domain, user, loan_pk, breakdown=None):
    """Close a loan that is out. The returned units that are not Good move from the loan's line to their condition's line."""
    with transaction.atomic():
        line, loan = _lock_line_of_loan(domain, loan_pk)
        if loan.status not in OUT_STATUSES:
            raise ValidationError({'detail': 'This loan is not out.'})
        parts = clean_breakdown(domain, loan.quantity, breakdown)
        loan.status, loan.returned_by, loan.returned_at, loan.return_breakdown = 'RETURNED', user, timezone.now(), parts
        loan.save(update_fields=['status', 'returned_by', 'returned_at', 'return_breakdown'])
        for condition, units in parts.items():
            if condition != GOOD:
                move_units(domain, line, units, condition)
    return loan


# ─── Notifications ───────────────────────────────────────────────────────────

def _breakdown_text(parts):
    return ', '.join(f'{units} {condition}' for condition, units in parts.items())


def loan_notify(domain, loan, event, actor=None):
    """Tell the right account about a loan event; never raises (a notification problem must not undo the action)."""
    try:
        from core.notifications import fit, notify_user, resolve_owner_user

        line = loan.equipment
        label = fit(f'{equipment_label(line)} \u00d7 {loan.quantity}', 'record_label')
        org_id = line.organization_id
        if event in ('request', 'return_requested'):
            org_kwargs = {'farmers_organization_id': org_id} if domain.key == 'farmers' else {'fisherfolk_organization_id': org_id}
            recipient = resolve_owner_user(**org_kwargs)
            verb = 'requested to borrow equipment' if event == 'request' else 'says the equipment was returned'
            # The actor is the member and the label names the equipment and units, so only the return-by date adds anything.
            detail = f'return by {loan.due_date:%b %d, %Y}' if event == 'request' and loan.due_date else ''
        else:
            person_kwargs = {f'{domain.person_field}_id': loan.member_id}
            recipient = resolve_owner_user(**person_kwargs)
            if event == 'approved':
                verb = 'approved your equipment request'
                detail = f'return by {loan.due_date:%b %d, %Y}' if loan.due_date else ''
            elif event == 'rejected':
                verb = 'rejected your equipment request'
                detail = loan.reject_reason or ''
            else:
                verb = 'confirmed the return of your equipment'
                detail = _breakdown_text(loan.return_breakdown)
        notify_user(recipient=recipient, actor=actor, verb=verb, record_type='equipment_loan', record_id=loan.id,
                    record_label=label, detail=fit(detail, 'detail'))
    except Exception:
        logger.exception('equipment loan notification failed (non-fatal): loan=%s event=%s', getattr(loan, 'pk', None), event)


# ─── Member side ─────────────────────────────────────────────────────────────

def member_context(user):
    """(domain, person id) for a farmer or fisherfolk account, else None."""
    key = {'FARMER': 'farmers', 'FISHERFOLK': 'fisherfolk'}.get(user.linked_record_type)
    if key is None or not user.linked_record_id:
        return None
    return equipment_domain(key), user.linked_record_id


def member_organizations(domain, person_id):
    """The organizations the person is an ACTIVE member of (membership rows, organization loaded)."""
    return list(
        domain.member_model.objects.filter(is_active=True, **{f'{domain.person_field}_id': person_id}).select_related('organization')
    )


def member_request(domain, user, person_id, line_pk, quantity, due_date=None, note=''):
    """A member asks for Good units of an equipment line of one of their organizations. Reserves nothing."""
    with transaction.atomic():
        line = lock_line(domain, line_pk)
        if line is None or not domain.member_model.objects.filter(
                organization_id=line.organization_id, is_active=True, **{f'{domain.person_field}_id': person_id}).exists():
            raise ValidationError({'equipment': 'That equipment is not available to you.'})
        _require_available(line, quantity)
        if domain.loan_model.objects.filter(equipment=line, member_id=person_id, status='REQUESTED').exists():
            raise ValidationError({'detail': 'You already have a request for this equipment waiting for a decision.'})
        loan = domain.loan_model.objects.create(
            equipment=line, member_id=person_id, quantity=quantity, status='REQUESTED', origin='MEMBER',
            requested_by=user, due_date=due_date, member_note=(note or '').strip())
    return domain.loan_model.objects.select_related('equipment', 'member').get(pk=loan.pk)


def _own_loan(domain, person_id, loan_pk):
    line_loan = domain.loan_model.objects.filter(pk=loan_pk, member_id=person_id).select_related('equipment').first()
    if line_loan is None:
        raise NotFound()
    return line_loan


def member_cancel(domain, person_id, loan_pk):
    _own_loan(domain, person_id, loan_pk)
    with transaction.atomic():
        line, loan = _lock_line_of_loan(domain, loan_pk)
        if loan.status != 'REQUESTED':
            raise ValidationError({'detail': 'Only a request that is still waiting can be cancelled.'})
        loan.status = 'CANCELLED'
        loan.save(update_fields=['status'])
    return loan


def member_return(domain, person_id, loan_pk):
    """The member says the units are back: RETURN_PENDING until the organization confirms and sets the condition."""
    _own_loan(domain, person_id, loan_pk)
    with transaction.atomic():
        line, loan = _lock_line_of_loan(domain, loan_pk)
        if loan.status != 'BORROWED':
            raise ValidationError({'detail': 'Only a loan that is out can be marked as returned.'})
        loan.status, loan.return_requested_at = 'RETURN_PENDING', timezone.now()
        loan.save(update_fields=['status', 'return_requested_at'])
    return loan
