"""Hand-typed ID numbers (RSBSA, FishR): what a valid one looks like and how two spellings of one number are matched.

A number is digit groups separated by single dashes ("01-33-02-014-058212"), 20 digits at most; the forms put the
dashes in as the person types. The older RSBSA shapes with a "BF-" prefix or letters stay valid (core.validators),
and records keep the spelling they were saved with. What is compared is the *key*: the number without dashes or
spaces, upper-cased, so "013302014058212" and "01-33-02-014-058212" are the same person everywhere (duplicate
checks, login, the imports)."""
import re

from django.db.models import Value
from django.db.models.functions import Replace, Upper

MAX_ID_DIGITS = 20
FREE_ID_RE = re.compile(r'^\d+(?:-\d+)*$')


def id_key(value):
    return re.sub(r'[\s-]', '', value or '').upper()


def is_free_id(value):
    value = (value or '').strip()
    return bool(FREE_ID_RE.match(value)) and len(id_key(value)) <= MAX_ID_DIGITS


def _with_key(queryset, field):
    return queryset.annotate(idkey=Upper(Replace(field, Value('-'), Value(''))))


def by_id_key(queryset, field, value):
    """`queryset` narrowed to the rows whose `field` is the same number as `value`, whatever the dashes. A value with
    nothing in it matches nothing (never every row with an empty field)."""
    key = id_key(value)
    if not key:
        return queryset.none()
    return _with_key(queryset, field).filter(idkey=key)


def canonical_numbers(models, field, values):
    """{key: number as it is stored} for every number in `values` that already belongs to a row of one of `models`.
    The imports use it to read a typed number as the stored one before they match, group and compare rows."""
    keys = {id_key(v) for v in values if id_key(v)}
    found = {}
    if not keys:
        return found
    for model in models:
        for stored, key in _with_key(model.objects.all(), field).filter(idkey__in=keys).values_list(field, 'idkey'):
            found.setdefault(key, stored)
    return found
