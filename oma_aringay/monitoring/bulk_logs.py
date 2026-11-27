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

A fisherfolk account for its OWN cycles, or a fisherfolk cooperative for the cycles of its members who have no activated account
(associations.member_logging); a cycle of anyone else is answered as "not found", as if it did not exist, and the office does not log on many
cycles at once. Only an Active cycle takes a log. At most 100 cycles (and 500 ponds/cages) at a time.

    GET /api/monitoring/aquaculture-cycles/member-cycles/ lists the cycles a cooperative may pick: only what is needed to tell them and
    their ponds/cages apart.
"""
from django.db import transaction
from rest_framework import status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import is_fisherfolk_citizen
from associations.member_logging import is_cooperative_for, loggable_member_ids

from .models import AquacultureProductionCycle, AquacultureProductionUnit
from .serializers import AquacultureFeedingLogSerializer, AquacultureHealthLogSerializer

MAX_CYCLES = 100
MAX_UNITS = 500


class MayLogOnManyCycles(BasePermission):
    """A citizen account linked to a fisherfolk, or to a fisherfolk cooperative (for members who cannot log for themselves)."""

    def has_permission(self, request, view):
        return is_fisherfolk_citizen(request.user) or is_cooperative_for(request.user, 'FISHERFOLK')


class IsFisherfolkCooperative(BasePermission):
    def has_permission(self, request, view):
        return is_cooperative_for(request.user, 'FISHERFOLK')


def _reachable_cycles(user):
    """The cycles this account may log on. A fisherfolk: their own. A cooperative: its members' who have no activated account.
    Anyone else: none (the fisherfolk filter would not narrow anything for a cooperative, so it is only used for a fisherfolk)."""
    from .views import _cycle_queryset
    if is_cooperative_for(user, 'FISHERFOLK'):
        return AquacultureProductionCycle.objects.filter(
            fisherfolk_id__in=loggable_member_ids(user, 'FISHERFOLK')).select_related('fisherfolk')
    if is_fisherfolk_citizen(user):
        return _cycle_queryset(user)
    return AquacultureProductionCycle.objects.none()


def _int_ids(values, field, label):
    try:
        return [int(v) for v in values]
    except (TypeError, ValueError):
        raise ValidationError({field: f'Each {label} needs its id.'})


def _owned_active(request, ids, field):
    """{id: cycle} for the cycles named, all of them ones the caller may log on (any other id is simply missing from this lookup)."""
    cycles = {c.id: c for c in _reachable_cycles(request.user).filter(pk__in=ids)}
    if len(cycles) != len(set(ids)):
        raise ValidationError({field: 'One of the cycles could not be found.'})
    return cycles


def _name_of(user, cycle):
    """The cycle as a message names it. A cooperative logs for several people, so it also says whose cycle it is."""
    return f'{cycle.fisherfolk.full_name}, {cycle.cycle_name}' if is_cooperative_for(user, 'FISHERFOLK') else cycle.cycle_name


def _not_active(cycle, name, what):
    return {'cycle': [f'{name} is not active any more (it is {cycle.status}), so {what} cannot be logged on it.']} \
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
    permission_classes = [IsAuthenticated, MayLogOnManyCycles]

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
            name = _name_of(request.user, cycle)
            problem = _not_active(cycle, name, 'a feeding')
            if problem:
                errors.append({'cycle': cycle.id, 'label': name, 'errors': problem})
                continue
            serializer = AquacultureFeedingLogSerializer(
                data={**shared, 'unit_quantities': item.get('unit_quantities') or []}, context={'request': request, 'cycle_id': cycle.id})
            if serializer.is_valid():
                validated.append((cycle, serializer))
            else:
                errors.append({'cycle': cycle.id, 'label': name, 'errors': serializer.errors})
        if errors:
            return _refusal('cycle', errors)
        with transaction.atomic():
            logs = [serializer.save(production_cycle=cycle) for cycle, serializer in validated]
        return Response({'logged': len(logs), 'ids': [log.id for log in logs]}, status=drf_status.HTTP_201_CREATED)


class AquacultureBulkHealthView(APIView):
    permission_classes = [IsAuthenticated, MayLogOnManyCycles]
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
            name = _name_of(request.user, cycle)
            where = name + (f', {unit.get_unit_type_display()} {unit.unit_number}' if unit else '')
            problem = _not_active(cycle, name, 'a health log')
            if problem:   # about the whole cycle, so the message does not name the pond
                errors.append({'cycle': cycle.id, 'production_unit': unit_id, 'label': name, 'errors': problem})
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


class MemberCycleListView(APIView):
    """The active cycles (with their ponds/cages) a fisherfolk cooperative may log on for its members without an activated account."""
    permission_classes = [IsAuthenticated, IsFisherfolkCooperative]

    def get(self, request):
        members = loggable_member_ids(request.user, 'FISHERFOLK')
        cycles = AquacultureProductionCycle.objects.filter(fisherfolk_id__in=members, status='Active').select_related(
            'fisherfolk').prefetch_related('units').order_by('fisherfolk__last_name', 'fisherfolk__first_name', '-stocking_date', '-id')
        records = []
        for cycle in cycles:
            units = sorted(cycle.units.all(), key=lambda u: (u.unit_type, u.unit_number))
            if not units:
                continue
            records.append({
                'id': cycle.id,
                'member_id': cycle.fisherfolk_id,
                'member_name': cycle.fisherfolk.full_name,
                'cycle_name': cycle.cycle_name,
                'species_farmed': cycle.species_farmed,
                'culture_system': cycle.culture_system,
                'status': cycle.status,
                'stocking_date': cycle.stocking_date,
                'units': [{'id': u.id, 'unit_type': u.unit_type, 'unit_number': u.unit_number} for u in units],
            })
        return Response({'member_count': len(members), 'records': records})
