"""
Forced Harvest (crops): a crop harvested before it was ready, for a stated reason such as an upcoming typhoon.

A harvest more than TOLERANCE_DAYS before the expected date already needed a reason (HarvestRecordSerializer). A forced harvest
is that early harvest with the reason chosen from FORCE_HARVEST_REASONS: it is saved with `force_harvest_reason`, and the readable
sentence "Forced harvest due to early harvest: <reason>" goes into `early_late_reason`, which every harvest screen and report
already shows. These are pure helpers (no views), used by the serializer and by the several-crops request.
"""
from rest_framework import serializers

from .models import FORCE_HARVEST_REASON_LABELS

TOLERANCE_DAYS = 7          # the same limit HarvestRecordSerializer applies to any early or late harvest
MAX_REASON_LENGTH = 255     # the size of early_late_reason
FORCED_PREFIX = 'Forced harvest due to early harvest'


def compose_forced_reason(code, detail=''):
    """"Forced harvest due to early harvest: Upcoming Typhoon (signal no. 3 on Friday)"; for Other, the description is the reason."""
    detail = (detail or '').strip()
    label = FORCE_HARVEST_REASON_LABELS.get(code, code)
    if code == 'other':
        text = f'{FORCED_PREFIX}: Other: {detail}'
    else:
        text = f'{FORCED_PREFIX}: {label}' + (f' ({detail})' if detail else '')
    return text[:MAX_REASON_LENGTH]


def forced_problem(code, detail, record, harvest_date):
    """Why this harvest cannot be a forced harvest ('' when it can): an unknown reason, Other with no description, or a crop that
    is not early enough (within TOLERANCE_DAYS of its expected date it is an ordinary harvest)."""
    if code not in FORCE_HARVEST_REASON_LABELS:
        return {'force_harvest_reason': 'Choose why the crop is being harvested early.'}
    if code == 'other' and not (detail or '').strip():
        return {'force_harvest_detail': 'Describe the reason.'}
    if not record or not harvest_date or not getattr(record, 'expected_harvest_date', None):
        return {'force_harvest_reason': 'A forced harvest needs a crop record with an expected harvest date, and a harvest date.'}
    if (harvest_date - record.expected_harvest_date).days >= -TOLERANCE_DAYS:
        return {'force_harvest_reason': f'Only a harvest more than {TOLERANCE_DAYS} days before the expected date is a forced harvest.'}
    return {}


def apply_forced_reason(data):
    """Validate serializer data that carries a force_harvest_reason and put the readable reason into early_late_reason."""
    code = data.get('force_harvest_reason') or ''
    detail = data.pop('force_harvest_detail', '') or ''
    if not code:
        return data
    problem = forced_problem(code, detail, data.get('monitoring_record'), data.get('harvest_start_date'))
    if problem:
        raise serializers.ValidationError(problem)
    data['early_late_reason'] = compose_forced_reason(code, detail)
    return data
