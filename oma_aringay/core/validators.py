import re
from datetime import date

from django.core.exceptions import ValidationError

RSBSA_RE = re.compile(r'^01-33-02-\d{3}-\d{6}$')
PHILSYS_RE = re.compile(r'^\d{4}-\d{4}-\d{4}-\d{4}$')
LGU_REG_RE = re.compile(r'^\d{4}-03302-\d{4}$')
FISHR_RE = re.compile(r'^01-33-02-\d{4}-\d{4}$')


def validate_rsbsa(value):
    if not value:
        return
    if not RSBSA_RE.match(value):
        raise ValidationError(
            'Invalid RSBSA number. Expected format: 01-33-02-BBB-NNNNNN '
            '(e.g. 01-33-02-014-058212).'
        )


def validate_philsys(value):
    if not value:
        return
    if not PHILSYS_RE.match(value):
        raise ValidationError(
            'Invalid PhilSys number. Expected format: NNNN-NNNN-NNNN-NNNN '
            '(e.g. 8419-5032-7741-3096).'
        )


def validate_lgu_reg(value):
    if not value:
        return
    if not LGU_REG_RE.match(value):
        raise ValidationError(
            'Invalid LGU registration number. Expected format: YYYY-03302-NNNN '
            '(e.g. 2026-03302-0001).'
        )


def validate_fishr(value):
    if not value:
        return
    if not FISHR_RE.match(value):
        raise ValidationError(
            'Invalid FishR number. Expected format: 01-33-02-YYYY-NNNN '
            '(e.g. 01-33-02-2026-0415).'
        )


def validate_not_future_date(value, label='Date'):
    """
    Shared DRF validate_<field> helper for event/record dates that already
    happened (date planted, date stocked, harvest date, etc). Not for
    forward-looking dates (expected_harvest_date, next_visit_date, license
    expiry) — those must stay uncapped and should not call this.
    Raises django.core.exceptions.ValidationError, which DRF's
    Serializer.to_internal_value() catches the same as serializers.ValidationError.
    """
    if value and value > date.today():
        raise ValidationError(f'{label} cannot be in the future.')
