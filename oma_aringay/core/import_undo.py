"""Undo for a committed import (see core.import_batches).

The safety rule is the one the RSBSA import undo has always used. A record the import ADDED is removed only if
  * nothing has edited it since (its fingerprint still matches the one taken when the import finished),
  * nothing else depends on it (Django's own delete collector, so this cannot drift from the real relations), and
  * a model-specific check, if one is registered, agrees (e.g. a login the import created was never used).
Anything else is KEPT and the reason is shown. A change the import made to an EXISTING record is put back only if the
value is still the one the import wrote. Everything is recomputed live, so a stale plan can never cause an unsafe write,
and running an undo again is harmless (a finished item is skipped)."""
from dataclasses import dataclass

from django.apps import apps
from django.db import transaction
from django.db.models import ProtectedError
from django.db.models.deletion import Collector
from django.utils import timezone

from core.import_batches import fingerprint
from core.models import ImportBatch, ImportBatchItem

REASON_EDITED = 'Edited since the import.'
REASON_DEPENDENTS = 'Other records depend on it.'
REASON_GONE = 'Already removed.'
REASON_CHANGED = 'Changed since the import.'
REASON_DONE = 'Already undone.'

# model_label -> {'check': fn(obj) -> reason | None, 'before_delete': fn(obj, user) | None}
CLEANUPS = {}


def register_cleanup(model_label, check, before_delete=None):
    """`check(obj)` returns a reason to KEEP the record (or None); `before_delete(obj, user)` runs inside the undo's
    transaction just before the record is deleted (for example to remove a login the import created)."""
    CLEANUPS[model_label] = {'check': check, 'before_delete': before_delete}


@dataclass
class PlanItem:
    item_id: int
    label: str
    can_undo: bool
    reason: str


def dependents(instance):
    """Names of the models (other than the instance's own) that deleting it would cascade to, including the ones
    Django deletes through its fast-delete path, which never appear in collector.data."""
    collector = Collector(using='default')
    try:
        collector.collect([instance])
    except ProtectedError as exc:
        # Something protects this record (e.g. equipment that has loans): that is a dependent by definition.
        return sorted({type(o).__name__ for o in exc.protected_objects} or {'ProtectedRecords'})
    names = {m.__name__ for m in collector.data if m is not type(instance)}
    for qs in collector.fast_deletes:
        for q in (qs if isinstance(qs, (list, tuple)) else [qs]):
            if q.exists():
                names.add(q.model.__name__)
    return sorted(names)


def _object(item):
    return apps.get_model(item.model_label).objects.filter(pk=item.object_id).first()


def _evaluate(item):
    """(kind, reason, obj): kind is 'remove', 'restore', 'keep' or 'gone'. Never writes."""
    obj = _object(item)
    if obj is None:
        return 'gone', REASON_GONE, None
    if item.action == ImportBatchItem.Action.RESTORE:
        field = obj._meta.get_field(item.field_name)
        current = str(getattr(obj, field.attname))
        if current == item.new_value:
            return 'restore', '', obj
        return 'keep', REASON_CHANGED, obj
    if fingerprint(obj) != item.fingerprint:
        return 'keep', REASON_EDITED, obj
    if dependents(obj):
        return 'keep', REASON_DEPENDENTS, obj
    cleanup = CLEANUPS.get(item.model_label)
    if cleanup:
        reason = cleanup['check'](obj)
        if reason:
            return 'keep', reason, obj
    return 'remove', '', obj


def build_plan(batch):
    """What undoing every unfinished item would do right now. Never writes."""
    plan = []
    for item in batch.items.filter(undone_at__isnull=True):
        kind, reason, obj = _evaluate(item)
        label = str(obj) if obj is not None else '(already removed)'
        plan.append(PlanItem(item.id, label, kind in ('remove', 'restore', 'gone'), reason))
    return plan


def execute_items(batch, item_ids, user):
    """Undo the given items of `batch` (ids from other batches are ignored). Returns one dict per item:
    {'item_id', 'result': 'removed' | 'restored' | 'kept' | 'skipped', 'reason'}."""
    results = []
    items = batch.items.filter(id__in=item_ids).order_by('id')
    for item in items:
        if item.undone_at is not None:
            results.append({'item_id': item.id, 'result': 'skipped', 'reason': REASON_DONE})
            continue
        with transaction.atomic():
            kind, reason, obj = _evaluate(item)
            if kind == 'gone':
                item.undone_at = timezone.now()
                item.kept_reason = ''
                item.save(update_fields=['undone_at', 'kept_reason'])
                results.append({'item_id': item.id, 'result': 'skipped', 'reason': REASON_GONE})
            elif kind == 'keep':
                item.kept_reason = reason
                item.save(update_fields=['kept_reason'])
                results.append({'item_id': item.id, 'result': 'kept', 'reason': reason})
            elif kind == 'restore':
                field = obj._meta.get_field(item.field_name)
                type(obj).objects.filter(pk=obj.pk).update(**{field.attname: field.to_python(item.old_value)})
                item.undone_at = timezone.now()
                item.kept_reason = ''
                item.save(update_fields=['undone_at', 'kept_reason'])
                results.append({'item_id': item.id, 'result': 'restored', 'reason': ''})
            else:
                cleanup = CLEANUPS.get(item.model_label)
                if cleanup and cleanup['before_delete']:
                    cleanup['before_delete'](obj, user)
                obj.delete()
                item.undone_at = timezone.now()
                item.kept_reason = ''
                item.save(update_fields=['undone_at', 'kept_reason'])
                results.append({'item_id': item.id, 'result': 'removed', 'reason': ''})
    _close_batch_if_finished(batch, user)
    return results


def _close_batch_if_finished(batch, user):
    """The batch is marked undone once every item is resolved (removed, restored or kept with a reason) and at least one
    item was actually removed or restored."""
    pending = batch.items.filter(undone_at__isnull=True, kept_reason='').exists()
    acted = batch.items.filter(undone_at__isnull=False).exists()
    if not pending and acted and batch.undone_at is None:
        ImportBatch.objects.filter(pk=batch.pk).update(undone_at=timezone.now(), undone_by=user)
        batch.refresh_from_db()
