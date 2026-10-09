"""An organization's assistance as distributions: the records created by one distribution submit are shown as one unit that
expands to its members. Shared by the farmer and the fisherfolk record models."""
import datetime as dt
import hashlib

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from auditlog.models import AuditLogEntry
from core.utils import build_name_search_q

from .models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

STATUS_KEYS = (
    DistributionStatus.PENDING, DistributionStatus.AWAITING_CONFIRMATION, DistributionStatus.CONFIRMED,
    DistributionStatus.NOT_RECEIVED, DistributionStatus.RESOLVED,
)


def group_id(record):
    """The batch id when the record has one, else a stable id derived from what makes records of one old distribution alike."""
    if record.distribution_batch:
        return str(record.distribution_batch)
    key = '|'.join([
        str(record.recorded_by_id), record.assistance_type or '', str(record.date_given), record.quantity or '',
        ','.join(sorted(record.source_agencies or [])),
    ])
    return 'legacy-' + hashlib.sha1(key.encode('utf-8')).hexdigest()[:12]


def summary_status(counts):
    if counts[DistributionStatus.NOT_RECEIVED]:
        return 'Needs follow-up'
    if counts[DistributionStatus.AWAITING_CONFIRMATION] or counts[DistributionStatus.PENDING]:
        return 'Awaiting confirmation'
    return 'Confirmed'


def build_distributions(records, person_field):
    """Group `records` (already filtered; removed ones never arrive through the default manager) into distributions,
    newest first by date given then by when they were recorded."""
    groups = {}
    for record in records:
        gid = group_id(record)
        group = groups.get(gid)
        if group is None:
            group = groups[gid] = {
                'id': gid,
                'assistance_type': record.assistance_type,
                'source_agencies': list(record.source_agencies or []),
                'quantity': record.quantity,
                'date_given': record.date_given,
                'recorded_at': None,
                'members': [],
            }
        if record.recorded_at and (group['recorded_at'] is None or record.recorded_at < group['recorded_at']):
            group['recorded_at'] = record.recorded_at
        person = getattr(record, person_field)
        group['members'].append({
            'record_id': record.id,
            'person_id': person.id,
            'name': person.full_name,
            'status': record.status,
            'confirmed_at': record.confirmed_at,
        })

    result = []
    for group in groups.values():
        counts = {status: 0 for status in STATUS_KEYS}
        for member in group['members']:
            counts[member['status']] = counts.get(member['status'], 0) + 1
        group['members'].sort(key=lambda m: (m['name'].lower(), m['record_id']))
        group['member_count'] = len(group['members'])
        group['status_counts'] = {str(k): v for k, v in counts.items()}
        group['summary_status'] = summary_status(counts)
        group['recorded_at'] = group['recorded_at'].isoformat() if group['recorded_at'] else None
        group['date_given'] = str(group['date_given'])
        result.append(group)

    result.sort(key=lambda g: (g['date_given'], g['recorded_at'] or ''), reverse=True)
    return result


def filter_records(queryset, person_field, params):
    """Apply the history filters (status, assistance_type, date_from, date_to, member, source_agency) to a record
    queryset and return a list of records."""
    status = (params.get('status') or '').strip()
    if status:
        status = DistributionStatus.NOT_RECEIVED.value if status.lower() == 'needs-follow-up' else status.upper()
        queryset = queryset.filter(status=status)
    if params.get('assistance_type'):
        queryset = queryset.filter(assistance_type=params['assistance_type'])
    for param, lookup in (('date_from', 'date_given__gte'), ('date_to', 'date_given__lte')):
        value = (params.get(param) or '').strip()
        if value:
            try:
                queryset = queryset.filter(**{lookup: dt.date.fromisoformat(value[:10])})
            except ValueError:
                pass
    member = (params.get('member') or '').strip()
    if member:
        queryset = queryset.filter(build_name_search_q(member, [
            f'{person_field}__first_name', f'{person_field}__middle_name', f'{person_field}__last_name',
        ]))
    records = list(queryset)
    agency = (params.get('source_agency') or '').strip()
    if agency:
        records = [r for r in records if agency in (r.source_agencies or [])]
    return records


# ─── Removal ──────────────────────────────────────────────────────────────────

DOMAIN_MODELS = {'crop': (BeneficiaryRecord, 'farmer'), 'fisheries': (FisherfolkBeneficiaryRecord, 'fisherfolk')}
REMOVABLE = (DistributionStatus.PENDING, DistributionStatus.AWAITING_CONFIRMATION)


def _lock_records(model, ids):
    """Re-read the records with their rows locked (all_objects: removed ones are included so a repeat is a no-op)."""
    return list(model.all_objects.select_for_update().filter(pk__in=ids).order_by('pk'))


def _resolve_ids(model, user, is_staff, record_ids, distribution):
    if record_ids is not None:
        ids = sorted({int(i) for i in record_ids})
        if not ids:
            raise ValidationError({'record_ids': ['Choose at least one entry to remove.']})
        found = model.all_objects.filter(pk__in=ids)
        if not is_staff:
            found = found.filter(recorded_by=user)
        if found.count() != len(ids):
            raise ValidationError({'detail': 'Some records were not found.'})
        return ids
    if not distribution:
        raise ValidationError({'detail': 'Send record_ids or a distribution id.'})
    scope = model.objects.all() if is_staff else model.objects.filter(recorded_by=user)
    if str(distribution).startswith('legacy-'):
        if is_staff:
            raise ValidationError({'detail': 'Use record_ids for older distributions.'})
        ids = [r.id for r in scope if group_id(r) == distribution]
    else:
        try:
            ids = list(scope.filter(distribution_batch=distribution).values_list('id', flat=True))
        except Exception:
            ids = []
    if not ids:
        raise ValidationError({'detail': 'Distribution not found.'})
    return ids


def remove_records(domain, user, record_ids=None, distribution=None):
    """Take entries out of the list: PENDING and AWAITING_CONFIRMATION ones become REMOVED (kept in the database for audit,
    hidden everywhere, no longer confirmable). Anything past that is kept and reported. One transaction; the rows are
    re-read under a lock so an entry confirmed a moment ago is never removed."""
    if domain not in DOMAIN_MODELS:
        raise ValidationError({'domain': ['Use "crop" or "fisheries".']})
    model, person_field = DOMAIN_MODELS[domain]
    is_staff = user.role in ('ADMIN', 'EVALUATOR')
    ids = _resolve_ids(model, user, is_staff, record_ids, distribution)

    removed, kept = [], []
    now = timezone.now()
    with transaction.atomic():
        for record in _lock_records(model, ids):
            if record.status == DistributionStatus.REMOVED:
                continue
            if record.status not in REMOVABLE:
                kept.append({'id': record.id, 'status': record.status,
                             'reason': f'Already {record.get_status_display().lower()}, so it stays on the list.'})
                continue
            record.status = DistributionStatus.REMOVED
            record.removed_at = now
            record.removed_by = user
            record.save(update_fields=['status', 'removed_at', 'removed_by'])
            AuditLogEntry.objects.create(
                user=user, action=AuditLogEntry.Action.UPDATE, model_name=model.__name__,
                object_repr=f'Removed from the list: {record.assistance_type} for {getattr(record, person_field).full_name} '
                            f'(record {record.id})')
            removed.append(record.id)
    return {'removed': removed, 'kept': kept}
