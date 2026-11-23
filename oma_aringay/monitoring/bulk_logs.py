"""A feeding or a health log made on the ponds and cages of SEVERAL production cycles at once.

A fisherfolk with many cycles should not log the same feeding (or the same observation) cycle by cycle. Both endpoints save what the
single-cycle forms save, with the same serializers and the same checks, in ONE transaction: if anything cannot be saved, nothing is, and the
answer names the cycle (and pond/cage).

    POST /api/monitoring/aquaculture-cycles/bulk-feeding/
        { feeding_date, feed_type, notes, cycles: [{ cycle, unit_quantities: [{ production_unit, quantity_kg }] }] }
        One AquacultureFeedingLog per cycle, with its pond/cage quantities (the total is their sum).

    POST /api/monitoring/aquaculture-cycles/bulk-health/
        { log_date, notes, unit_logs: [{ cycle, production_unit, observation, mortality_count, treatment_applied }] }
        One AquacultureHealthLog per pond/cage (force harvest, mortality and history stay per pond/cage, as on the single form).

Staff, or a fisherfolk account for its OWN cycles only (a cycle of anyone else is answered as "not found", as if it did not exist). Only an
Active cycle takes a log. At most 100 cycles (and 500 ponds/cages) at a time.
"""
from django.db import transaction
from rest_framework import status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffOrFisherfolk

from .models import AquacultureProductionCycle, AquacultureProductionUnit
from .serializers import AquacultureFeedingLogSerializer, AquacultureHealthLogSerializer

MAX_CYCLES = 100
MAX_UNITS = 500


def _int_ids(values, field, label):
    try:
        return [int(v) for v in values]
    except (TypeError, ValueError):
        raise ValidationError({field: f'Each {label} needs its id.'})


def _owned_active(request, ids, field):
    """{id: cycle} for the cycles named, all of them the caller's own (any other id is simply missing from this lookup)."""
    from .views import _cycle_queryset
    cycles = {c.id: c for c in _cycle_queryset(request.user).filter(pk__in=ids)}
    if len(cycles) != len(set(ids)):
        raise ValidationError({field: 'One of the cycles could not be found.'})
    return cycles


def _not_active(cycle, what):
    return {'cycle': [f'{cycle.cycle_name} is not active any more (it is {cycle.status}), so {what} cannot be logged on it.']} \
        if cycle.status != 'Active' else None


def _message(errors):
    problem = next(iter(errors.values())) if isinstance(errors, dict) and errors else errors
    while isinstance(problem, (list, tuple)) and problem:
        problem = problem[0]
    if isinstance(problem, dict) and problem:
        return _message(problem)
    return str(problem)


def _refusal(label, errors_list):
    """The 400 answer: the first problem as a sentence that starts with the cycle (and pond) it is about, and every refusal in `errors`."""
    first = errors_list[0]
    message = _message(first['errors'])
    prefix = first['label']
    return Response({'detail': message if message.startswith(prefix) else f'{prefix}: {message}',
                     'errors': [{k: v for k, v in e.items() if k != 'label'} for e in errors_list]}, status=drf_status.HTTP_400_BAD_REQUEST)


class AquacultureBulkFeedingView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def post(self, request):
        body = request.data
        items = body.get('cycles')
        if not isinstance(items, list) or not items:
            raise ValidationError({'cycles': 'Choose at least one cycle.'})
        if len(items) > MAX_CYCLES:
            raise ValidationError({'cycles': f'At most {MAX_CYCLES} cycles can be logged at once.'})
        if not all(isinstance(i, dict) for i in items):
            raise ValidationError({'cycles': 'Each cycle needs its id and its pond/cage quantities.'})
        ids = _int_ids([i.get('cycle') for i in items], 'cycles', 'cycle')
        if len(set(ids)) != len(ids):
            raise ValidationError({'cycles': 'The same cycle is listed twice.'})
        cycles = _owned_active(request, ids, 'cycles')

        shared = {k: body[k] for k in ('feeding_date', 'feed_type', 'notes') if k in body}
        validated, errors = [], []
        for item, cycle_id in zip(items, ids):
            cycle = cycles[cycle_id]
            problem = _not_active(cycle, 'a feeding')
            if problem:
                errors.append({'cycle': cycle.id, 'label': cycle.cycle_name, 'errors': problem})
                continue
            serializer = AquacultureFeedingLogSerializer(
                data={**shared, 'unit_quantities': item.get('unit_quantities') or []}, context={'request': request, 'cycle_id': cycle.id})
            if serializer.is_valid():
                validated.append((cycle, serializer))
            else:
                errors.append({'cycle': cycle.id, 'label': cycle.cycle_name, 'errors': serializer.errors})
        if errors:
            return _refusal('cycle', errors)
        with transaction.atomic():
            logs = [serializer.save(production_cycle=cycle) for cycle, serializer in validated]
        return Response({'logged': len(logs), 'ids': [log.id for log in logs]}, status=drf_status.HTTP_201_CREATED)


class AquacultureBulkHealthView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    UNIT_FIELDS = ('production_unit', 'observation', 'mortality_count', 'treatment_applied')

    def post(self, request):
        body = request.data
        entries = body.get('unit_logs')
        if not isinstance(entries, list) or not entries:
            raise ValidationError({'unit_logs': 'Choose at least one pond/cage.'})
        if len(entries) > MAX_UNITS:
            raise ValidationError({'unit_logs': f'At most {MAX_UNITS} ponds/cages can be logged at once.'})
        if not all(isinstance(e, dict) for e in entries):
            raise ValidationError({'unit_logs': 'Each pond/cage needs its cycle and its observation.'})
        cycle_ids = _int_ids([e.get('cycle') for e in entries], 'unit_logs', 'cycle')
        unit_ids = _int_ids([e.get('production_unit') for e in entries], 'unit_logs', 'pond/cage')
        if len(set(unit_ids)) != len(unit_ids):
            raise ValidationError({'unit_logs': 'Each pond/cage can be listed only once.'})
        cycles = _owned_active(request, cycle_ids, 'unit_logs')
        units = {u.id: u for u in AquacultureProductionUnit.objects.filter(pk__in=unit_ids)}

        shared = {k: body[k] for k in ('log_date', 'notes') if k in body}
        validated, errors = [], []
        for entry, cycle_id, unit_id in zip(entries, cycle_ids, unit_ids):
            cycle = cycles[cycle_id]
            unit = units.get(unit_id)
            where = cycle.cycle_name + (f', {unit.get_unit_type_display()} {unit.unit_number}' if unit else '')
            problem = _not_active(cycle, 'a health log')
            if problem:
                errors.append({'cycle': cycle.id, 'production_unit': unit_id, 'label': where, 'errors': problem})
                continue
            serializer = AquacultureHealthLogSerializer(
                data={**shared, **{k: entry[k] for k in self.UNIT_FIELDS if k in entry}}, context={'request': request, 'cycle_id': cycle.id})
            if serializer.is_valid():
                validated.append((cycle, serializer))
            else:
                errors.append({'cycle': cycle.id, 'production_unit': unit_id, 'label': where, 'errors': serializer.errors})
        if errors:
            return _refusal('pond', errors)
        with transaction.atomic():
            logs = [serializer.save(production_cycle=cycle) for cycle, serializer in validated]
        return Response({'logged': len(logs), 'ids': [log.id for log in logs]}, status=drf_status.HTTP_201_CREATED)
