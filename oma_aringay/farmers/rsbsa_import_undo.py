"""
Undo for an RSBSA import batch (RsbsaUpdateImportCommitView).

Why: a bulk commit — "Select all" on hundreds of updates, or a first-time
import registering thousands of people — used to be irreversible even though
RsbsaImportChangeLog already records every field's old and new value. This
module uses that log, and only that log, to reverse a batch SAFELY:

* UPDATE entries — a field is restored to its old value only if it still holds
  the exact value the import wrote. If anyone (staff edit, a citizen's approved
  profile change, a later import) changed it since, it is left alone and
  reported, never overwritten.

* CREATE entries — a person the import registered is deleted only if ALL of:
  every field still equals what the import wrote (nobody edited them); no other
  record depends on them (crop records, parcels, assistance, organization
  membership, ... — checked with Django's own deletion collector, so this can't
  drift from the real relations); and their citizen login, if the import
  created one, was never activated or used. Anything else is KEPT and the
  reason is shown, because deleting someone who already has activity attached
  would destroy real data. A dual registration's login belongs to the person's
  OTHER record and is never touched.

Every reversed record writes UNDO rows to the same log (same batch_id), which
also makes an undo idempotent: a record already undone is skipped, so the
frontend can safely run it in slices and a retry after a timeout is harmless.

Crop-record imports create CropMonitoringRecord rows that carry no batch
marker, so they cannot be undone from here (only the Farmer records a crop
import registered can be, and those are kept as soon as a crop record hangs
off them).
"""
from datetime import date

from django.db import transaction
from django.db.models import Count, Max, Min, Q
from django.db.models.deletion import Collector
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User, UserLinkedRecord
from accounts.permissions import IsAdminOrEvaluator
from farmers.models import Farmer, RsbsaImportChangeLog
from farmers.rsbsa_import_views import _display
from fisheries.models import Fisherfolk

MODELS = {'FARMER': Farmer, 'FISHERFOLK': Fisherfolk}
LINKED_TYPE = {'FARMER': User.LinkedRecordType.FARMER, 'FISHERFOLK': User.LinkedRecordType.FISHERFOLK}
Action = RsbsaImportChangeLog.Action
MAX_EXECUTE_SLICE = 100
MAX_LISTED_ITEMS = 500


def _from_logged(field, text):
    """Undo _display(): the log stores every value as display text."""
    if text == '(blank)':
        return None if field == 'birthdate' else ''
    if field == 'birthdate':
        return date.fromisoformat(text)
    if field == 'is_farm_laborer':
        return text == 'True'
    return text


def _same(logged, current_display):
    """Log values are display text; a blank is '(blank)' from one writer and
    '' from another — equal for our purposes."""
    norm = lambda v: '' if v in ('(blank)', None) else v  # noqa: E731
    return norm(logged) == norm(current_display)


def _dependents(instance):
    """Models (other than the instance's own) that deleting it would cascade
    to — including the ones Django deletes via its "fast delete" path, which
    never appear in collector.data."""
    collector = Collector(using='default')
    collector.collect([instance])
    names = {m.__name__ for m in collector.data if m is not type(instance)}
    for qs in collector.fast_deletes:
        for q in (qs if isinstance(qs, (list, tuple)) else [qs]):
            if q.exists():
                names.add(q.model.__name__)
    return sorted(names)


def _shell_for(record_type, record_id):
    link = UserLinkedRecord.objects.filter(record_type=LINKED_TYPE[record_type], record_id=record_id).select_related('user').first()
    return link.user if link else None


def plan_record(batch_id, record_type, record_id):
    """What undoing this one record would do RIGHT NOW (recomputed live, so a
    stale plan can never cause an unsafe write)."""
    entries = list(RsbsaImportChangeLog.objects.filter(
        batch_id=batch_id, record_type=record_type, record_id=record_id,
    ))
    if not entries:
        return {'outcome': 'skip', 'reason': 'This record is not part of that import batch.'}
    if any(e.action == Action.UNDO for e in entries):
        return {'outcome': 'already_undone', 'reason': 'Already undone.'}

    first = entries[0]
    base = {
        'record_type': record_type, 'record_id': record_id,
        'record_name': first.record_name, 'rsbsa_number': first.rsbsa_number,
    }
    model = MODELS[record_type]
    record = model.objects.filter(pk=record_id).first()
    if record is None:
        return {**base, 'kind': 'gone', 'outcome': 'skip', 'reason': 'The record no longer exists.'}

    created = [e for e in entries if e.action == Action.CREATE]
    if created:
        edited = [e.field_label for e in created if not _same(e.new_value, _display(getattr(record, e.field_name, None)))]
        if edited:
            return {**base, 'kind': 'create', 'outcome': 'skip',
                    'reason': f'Edited since the import ({", ".join(edited)}) — kept.'}
        deps = _dependents(record)
        if deps:
            return {**base, 'kind': 'create', 'outcome': 'skip',
                    'reason': f'Has data attached ({", ".join(deps)}) — kept.'}
        shell = _shell_for(record_type, record_id)
        delete_shell = False
        if shell is not None:
            others = UserLinkedRecord.objects.filter(user=shell).exclude(
                record_type=LINKED_TYPE[record_type], record_id=record_id,
            ).exists()
            if others:
                pass  # the login belongs to the person's other record too: leave it alone
            elif shell.is_active or shell.last_login is not None:
                return {**base, 'kind': 'create', 'outcome': 'skip',
                        'reason': 'Their citizen account was already activated or used — kept.'}
            else:
                shell_deps = [d for d in _dependents(shell) if d != 'UserLinkedRecord']
                if shell_deps:
                    return {**base, 'kind': 'create', 'outcome': 'skip',
                            'reason': f'Their citizen account has data attached ({", ".join(shell_deps)}) — kept.'}
                delete_shell = True
        return {**base, 'kind': 'create', 'outcome': 'delete', 'delete_shell': delete_shell}

    restorable, skipped = [], []
    for e in entries:
        if e.action != Action.UPDATE:
            continue
        current = _display(getattr(record, e.field_name, None))
        item = {'field': e.field_name, 'label': e.field_label, 'current': current, 'restore_to': e.old_value}
        (restorable if _same(e.new_value, current) else skipped).append(item)
    if not restorable:
        return {**base, 'kind': 'update', 'outcome': 'skip', 'fields': [], 'skipped_fields': skipped,
                'reason': 'Every changed field has been edited since the import — kept.'}
    return {**base, 'kind': 'update', 'outcome': 'restore', 'fields': restorable, 'skipped_fields': skipped}


def execute_record(batch_id, record_type, record_id, user):
    """Carry out plan_record()'s decision for one record (re-planned inside
    the row lock)."""
    model = MODELS[record_type]
    with transaction.atomic():
        model.objects.select_for_update().filter(pk=record_id).first()  # lock (no-op if gone)
        plan = plan_record(batch_id, record_type, record_id)
        outcome = plan['outcome']
        if outcome not in ('restore', 'delete'):
            return {**plan, 'done': False}

        log = []
        common = dict(
            batch_id=batch_id, performed_by=user, record_type=record_type, record_id=record_id,
            rsbsa_number=plan['rsbsa_number'], record_name=plan['record_name'], action=Action.UNDO,
        )
        record = model.objects.get(pk=record_id)
        if outcome == 'restore':
            for f in plan['fields']:
                setattr(record, f['field'], _from_logged(f['field'], f['restore_to']))
                log.append(RsbsaImportChangeLog(
                    **common, field_name=f['field'], field_label=f['label'],
                    old_value=f['current'], new_value=f['restore_to'],
                ))
            record.save()
        else:
            shell = _shell_for(record_type, record_id) if plan.get('delete_shell') else None
            log.append(RsbsaImportChangeLog(
                **common, field_name='(record)', field_label='Record',
                old_value='Registered by this import', new_value='Deleted by undo',
            ))
            record.delete()
            if shell is not None:
                shell.delete()
        RsbsaImportChangeLog.objects.bulk_create(log)
        return {**plan, 'done': True}


def _can_undo(user, batch_id):
    if user.role == 'ADMIN':
        return True
    return RsbsaImportChangeLog.objects.filter(batch_id=batch_id, performed_by=user).exists()


class RsbsaImportBatchListView(APIView):
    """Recent import batches, newest first, with how much of each is undone."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        # One aggregate query for the counts (this table holds one row per
        # changed FIELD, so a big batch is tens of thousands of rows — never
        # pull them into Python, and never query per batch on a remote DB).
        # Distinct record_id per action; a Farmer and a Fisherfolk sharing an
        # id number inside one batch would count once — cosmetic only.
        heads = list(
            RsbsaImportChangeLog.objects.values('batch_id')
            .annotate(
                started=Min('timestamp'), last=Max('timestamp'),
                created=Count('record_id', filter=Q(action=Action.CREATE), distinct=True),
                updated=Count('record_id', filter=Q(action=Action.UPDATE), distinct=True),
                undone=Count('record_id', filter=Q(action=Action.UNDO), distinct=True),
            )
            .order_by('-last')[:30]
        )
        ids = [h['batch_id'] for h in heads]
        performers = {}
        for bid, by in (RsbsaImportChangeLog.objects.filter(batch_id__in=ids)
                        .values_list('batch_id', 'performed_by__first_name').distinct()):
            performers.setdefault(bid, by)
        own = set(RsbsaImportChangeLog.objects.filter(batch_id__in=ids, performed_by=request.user)
                  .values_list('batch_id', flat=True).distinct())
        is_admin = request.user.role == 'ADMIN'
        return Response({'batches': [{
            'batch_id': str(h['batch_id']),
            'started_at': h['started'],
            'performed_by': performers.get(h['batch_id']),
            'records_created': h['created'],
            'records_updated': h['updated'],
            'records_undone': h['undone'],
            'can_undo': is_admin or h['batch_id'] in own,
        } for h in heads]})


class RsbsaImportUndoView(APIView):
    """POST {"dry_run": true}  -> the plan for the whole batch (nothing written).
       POST {"records": [["FARMER", 12], ...]} -> undo those records (at most
       MAX_EXECUTE_SLICE per call; the frontend runs the plan's `record_keys`
       in slices)."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, batch_id):
        if not RsbsaImportChangeLog.objects.filter(batch_id=batch_id).exists():
            return Response({'detail': 'No such import batch.'}, status=404)
        if not _can_undo(request.user, batch_id):
            return Response({'detail': 'Only an admin or the person who ran this import can undo it.'}, status=403)

        records = request.data.get('records')
        if records is not None:
            if not isinstance(records, list) or not records or len(records) > MAX_EXECUTE_SLICE:
                return Response({'detail': f'Send between 1 and {MAX_EXECUTE_SLICE} records per call.'}, status=400)
            results = []
            for key in records:
                if not (isinstance(key, (list, tuple)) and len(key) == 2 and key[0] in MODELS and isinstance(key[1], int)):
                    return Response({'detail': 'Each record must be [type, id].'}, status=400)
                results.append(execute_record(batch_id, key[0], key[1], request.user))
            return Response({'results': results})

        # plan for the whole batch
        keys = sorted(set(RsbsaImportChangeLog.objects.filter(batch_id=batch_id)
                          .exclude(action=Action.UNDO).values_list('record_type', 'record_id')))
        plans = [plan_record(batch_id, t, i) for t, i in keys]
        counts = {}
        for p in plans:
            counts[p['outcome']] = counts.get(p['outcome'], 0) + 1
        actionable = [p for p in plans if p['outcome'] in ('restore', 'delete')]
        return Response({
            'batch_id': str(batch_id),
            'summary': {
                'restore': counts.get('restore', 0), 'delete': counts.get('delete', 0),
                'kept': counts.get('skip', 0), 'already_undone': counts.get('already_undone', 0),
            },
            'record_keys': [[p['record_type'], p['record_id']] for p in actionable],
            'items': [p for p in plans if p['outcome'] != 'already_undone'][:MAX_LISTED_ITEMS],
            'items_truncated': len(plans) - counts.get('already_undone', 0) > MAX_LISTED_ITEMS,
        })
