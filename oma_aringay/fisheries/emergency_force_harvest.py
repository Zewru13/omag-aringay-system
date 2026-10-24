"""
Emergency Force Harvest - the Aquaculture Monitoring row menu (⋮) > Force Harvest workflow.

A SEPARATE workflow from the Health Log Force Harvest (an affected pond/cage awaiting harvest per its own Health Log, saved
with FisheriesHarvestRecord.is_force_harvest=True and shown as HP/HC badges). That one is untouched: nothing here sets
is_force_harvest, and nothing in the Health Log path reads force_harvest_reason.

This one records an emergency harvest of several production cycles and ponds/cages of ONE fisherfolk in a single atomic
request, for one of six fixed reasons (a typhoon, El Niño, drought, flooding, a fish pest or virus). It reuses the existing
harvest models: one FisheriesHarvestRecord per cycle (production_units = the harvested ponds/cages, quantity_kg = their sum,
force_harvest_reason = the reason) plus one FisheriesHarvestUnit per pond/cage for its own actual kg. The 50% waiting rule is
lifted for it (an emergency); every other harvest rule is kept: the cycle's stocking date must be confirmed, a unit is
harvested once, the date is not in the future and not before stocking, and a cycle closes only when every unit is harvested.
"""
from decimal import Decimal

from django.db import transaction
from django.db.models import prefetch_related_objects
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import serializers, status as drf_status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsStaffOrFisherfolk, fisherfolk_scope
from core.locking import assert_not_locked_by_other
from monitoring.models import AquacultureProductionUnit

from .models import (
    ACTIVE_STATUSES, EMERGENCY_FORCE_HARVEST_REASON_LABELS, EMERGENCY_FORCE_HARVEST_REASONS, Fisherfolk,
    FisheriesHarvestRecord, FisheriesHarvestUnit, StockingRecord, calculate_estimated_harvest_kg,
    production_cycle_numbers_bulk,
)
from .notifications import queue_emergency_force_harvest


def unit_label(unit):
    return f'{unit.get_unit_type_display()} {unit.unit_number}'


def _estimate(unit, stock):
    """The unit's own estimated kg (the shared formula, its own fingerlings, the record's survival / weight), or None."""
    value = calculate_estimated_harvest_kg(unit.fingerling_count, stock.survival_rate_pct, stock.avg_body_weight_kg)
    return str(value) if value is not None else None


def eligible_cycles(fisherfolk_id):
    """Every production cycle of the fisherfolk that still has a pond/cage to force harvest, with those units.

    A cycle is offered only while its record is in stock or ongoing (Stocked / Near Harvest, i.e. not Harvested or Total
    Loss), is linked to a production cycle and has a confirmed (not estimated) stocking date. A unit is offered only when it
    has not been harvested (normally, by a Force Harvest of the Health Log or by this workflow) and is not awaiting the Health
    Log Force Harvest (those must go through that workflow). A cycle with no such unit is left out."""
    stocks = list(
        StockingRecord.objects.filter(
            fisherfolk_id=fisherfolk_id, production_cycle__isnull=False, status__in=ACTIVE_STATUSES,
            date_stocked_is_estimated=False,
        ).select_related('species', 'production_cycle').order_by('date_stocked', 'id')
    )
    numbers = production_cycle_numbers_bulk(stocks)
    cycles = []
    for stock in stocks:
        status_by_id = {u['id']: u for u in stock.harvest_units()}
        units = AquacultureProductionUnit.objects.filter(production_cycle_id=stock.production_cycle_id).order_by('unit_number')
        rows = [
            {'id': u.id, 'label': unit_label(u), 'unit_type': u.unit_type, 'unit_number': u.unit_number,
             'estimated_harvest_kg': _estimate(u, stock)}
            for u in units
            if u.id in status_by_id and not status_by_id[u.id]['harvested'] and not status_by_id[u.id]['force_harvest']
        ]
        if not rows:
            continue
        cycles.append({
            'stocking_record': stock.id,
            'production_cycle': stock.production_cycle_id,
            'species': stock.species.species_name if stock.species_id else (stock.production_cycle.species_farmed or ''),
            'cycle_number': numbers.get(stock.id),
            'cycle_name': stock.production_cycle.cycle_name,
            'culture_phase': stock.culture_phase or '',
            'date_stocked': str(stock.date_stocked) if stock.date_stocked else None,
            'units': rows,
        })
    return cycles


def force_harvest_detail(harvest):
    """The saved Force Harvest as the details window and the notification show it - read from the persisted record."""
    stock = harvest.stocking_record
    cycle = stock.production_cycle
    actual = {row.production_unit_id: row.quantity_kg for row in harvest.unit_harvests.all()}
    units = sorted(harvest.production_units.all(), key=lambda u: (u.unit_type, u.unit_number))
    return {
        'id': harvest.id,
        'stocking_record': stock.id,
        'production_cycle': stock.production_cycle_id,
        'fisherfolk': stock.fisherfolk_id,
        'fisherfolk_name': stock.fisherfolk.full_name if stock.fisherfolk_id else '',
        'species': stock.species.species_name if stock.species_id else '',
        'cycle_number': stock.compute_production_cycle_no(),
        'cycle_name': cycle.cycle_name if cycle else '',
        'culture_phase': stock.culture_phase or '',
        'harvest_date': str(harvest.harvest_date),
        'reason': harvest.force_harvest_reason,
        'reason_label': EMERGENCY_FORCE_HARVEST_REASON_LABELS.get(harvest.force_harvest_reason, ''),
        'units': [
            {
                'id': u.id, 'label': unit_label(u),
                'estimated_harvest_kg': _estimate(u, stock),
                'actual_harvest_kg': str(actual[u.id]) if u.id in actual else None,
            }
            for u in units
        ],
        'total_actual_kg': str(harvest.quantity_kg),
        'recorded_by_name': (getattr(harvest.recorded_by, 'full_name', None) or str(harvest.recorded_by)) if harvest.recorded_by_id else None,
        'date_recorded': harvest.date_recorded.isoformat() if harvest.date_recorded else None,
    }


# ─── Input ────────────────────────────────────────────────────────────────────

class ForceHarvestUnitInput(serializers.Serializer):
    production_unit = serializers.PrimaryKeyRelatedField(queryset=AquacultureProductionUnit.objects.all())
    quantity_kg = serializers.DecimalField(max_digits=12, decimal_places=2, min_value=Decimal('0.01'))


class ForceHarvestCycleInput(serializers.Serializer):
    stocking_record = serializers.PrimaryKeyRelatedField(queryset=StockingRecord.objects.all())
    units = ForceHarvestUnitInput(many=True, allow_empty=False)


class ForceHarvestSerializer(serializers.Serializer):
    reason = serializers.ChoiceField(choices=EMERGENCY_FORCE_HARVEST_REASONS)
    harvest_date = serializers.DateField()
    cycles = ForceHarvestCycleInput(many=True, allow_empty=False)

    def validate_harvest_date(self, value):
        # The application's own local date (Asia/Manila), never the server's UTC date.
        if value > timezone.localdate():
            raise serializers.ValidationError('Harvest date cannot be in the future.')
        return value


def _fail(field, message):
    raise ValidationError({field: [message]})


@transaction.atomic
def record_force_harvests(user, data):
    """Record the whole request or nothing. Returns the created FisheriesHarvestRecords (one per cycle).

    Every rule is re-checked here, inside the transaction, on the cycles locked with select_for_update (in id order, so two
    requests cannot deadlock): a second, repeated or concurrent submit of the same units finds them already harvested and is
    refused, so a unit is never harvested twice. Any error rolls back every write."""
    cycles = data['cycles']
    ids = [c['stocking_record'].id for c in cycles]
    if len(set(ids)) != len(ids):
        _fail('cycles', 'Each production cycle can be listed only once.')
    # The lock is taken on the stocking records alone: PostgreSQL refuses SELECT ... FOR UPDATE over a join to a nullable
    # relation (a stocking's fisherfolk and production cycle may be empty), which failed every save with a server error. The
    # related rows are loaded right after, in separate queries, so the rest of the function reads them as before.
    locked = list(StockingRecord.objects.select_for_update().filter(pk__in=ids).order_by('id'))
    prefetch_related_objects(locked, 'species', 'production_cycle', 'fisherfolk')
    stocks = {s.id: s for s in locked}
    if len(stocks) != len(ids):
        raise NotFound('Production cycle not found.')

    # Ownership: a fisherfolk account only its own cycles (staff any); all selected cycles belong to ONE fisherfolk.
    owner = fisherfolk_scope(user)
    owners = {s.fisherfolk_id for s in stocks.values()}
    if owner is not None and owners != {owner}:
        raise NotFound('Production cycle not found.')
    if len(owners) != 1:
        _fail('cycles', 'All selected production cycles must belong to the same fisherfolk.')

    harvest_date = data['harvest_date']
    if harvest_date > timezone.localdate():
        _fail('harvest_date', 'Harvest date cannot be in the future.')

    reason = data['reason']
    reason_label = EMERGENCY_FORCE_HARVEST_REASON_LABELS[reason]
    created = []
    for entry in cycles:
        stock = stocks[entry['stocking_record'].id]
        title = f'{stock.species.species_name if stock.species_id else "Cycle"} (cycle {stock.production_cycle_id})'
        assert_not_locked_by_other(user, 'stocking', stock.id)
        if not stock.production_cycle_id or stock.status not in ACTIVE_STATUSES:
            _fail('cycles', f'{title} is not in stock or ongoing, so it cannot be force harvested.')
        if stock.date_stocked_is_estimated:
            _fail('cycles', f'{title}: the stocking date is an estimate. Harvest cannot be recorded until a staff member confirms the real stocking date.')
        if stock.date_stocked and harvest_date < stock.date_stocked:
            _fail('harvest_date', f'Harvest date cannot be before the date stocked ({stock.date_stocked}).')

        status_by_id = {u['id']: u for u in stock.harvest_units()}
        picked = entry['units']
        unit_ids = [row['production_unit'].id for row in picked]
        if len(set(unit_ids)) != len(unit_ids):
            _fail('cycles', f'{title}: each pond/cage can be listed only once.')
        for row in picked:
            unit = row['production_unit']
            info = status_by_id.get(unit.id)
            if info is None or unit.production_cycle_id != stock.production_cycle_id:
                _fail('cycles', f'{unit_label(unit)} does not belong to this production cycle.')
            if info['harvested']:
                _fail('cycles', f'{info["label"]} has already been harvested.')
            if info['force_harvest']:
                _fail('cycles', f'{info["label"]} is awaiting the Health Log Force Harvest and must be harvested there.')

        total = sum((row['quantity_kg'] for row in picked), Decimal('0'))
        # The cycle closes only once every one of its ponds/cages is harvested; units left out stay in stock.
        is_final = all(u['harvested'] or u['id'] in unit_ids for u in status_by_id.values())
        harvest = FisheriesHarvestRecord(
            stocking_record=stock, harvest_date=harvest_date, quantity_kg=total, is_final=is_final,
            force_harvest_reason=reason, early_late_reason=reason_label, recorded_by=user,
        )
        harvest.save()   # a final harvest also closes the stocking record (model rule)
        harvest.production_units.set([row['production_unit'] for row in picked])
        FisheriesHarvestUnit.objects.bulk_create([
            FisheriesHarvestUnit(harvest=harvest, production_unit=row['production_unit'], quantity_kg=row['quantity_kg'])
            for row in picked
        ])
        created.append(harvest)

    # Only after the whole request has committed (on_commit inside), once per created harvest.
    for harvest in created:
        queue_emergency_force_harvest(harvest, user)
    return created


# ─── Views ────────────────────────────────────────────────────────────────────

class ForceHarvestEligibleView(APIView):
    """GET /fisheries/force-harvest/eligible/?stocking_record=<id> (or ?fisherfolk=<id>, staff only): the fisherfolk's
    production cycles that still have ponds/cages to force harvest, with each unit's estimate. A fisherfolk account only
    ever gets its own. Also the six reasons and today's date in the application's own timezone (Asia/Manila)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        owner = fisherfolk_scope(request.user)
        stocking_id = request.query_params.get('stocking_record')
        if owner is not None:
            fisherfolk_id = owner
            if stocking_id and not StockingRecord.objects.filter(pk=stocking_id, fisherfolk_id=owner).exists():
                raise NotFound('Production cycle not found.')
        elif stocking_id:
            fisherfolk_id = get_object_or_404(StockingRecord, pk=stocking_id).fisherfolk_id
        else:
            fisherfolk_id = request.query_params.get('fisherfolk')
        fisherfolk = Fisherfolk.objects.filter(pk=fisherfolk_id).first() if fisherfolk_id else None
        if fisherfolk is None:
            raise NotFound('Fisherfolk not found.')
        return Response({
            'fisherfolk': {'id': fisherfolk.id, 'name': fisherfolk.full_name},
            'reasons': [{'value': value, 'label': label} for value, label in EMERGENCY_FORCE_HARVEST_REASONS],
            'today': str(timezone.localdate()),
            'cycles': eligible_cycles(fisherfolk.id),
        })


class ForceHarvestCreateView(APIView):
    """POST /fisheries/force-harvest/ - see record_force_harvests. 201 with the saved records, or 400 with the reason (and
    nothing saved)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        """GET /fisheries/force-harvest/?production_cycle=<id>: the emergency Force Harvests saved for one production
        cycle (what the cycle details window uses to label the affected ponds/cages). A fisherfolk account only its own."""
        owner = fisherfolk_scope(request.user)
        qs = FisheriesHarvestRecord.objects.exclude(force_harvest_reason='').select_related(
            'stocking_record__species', 'stocking_record__production_cycle', 'stocking_record__fisherfolk', 'recorded_by',
        ).prefetch_related('production_units', 'unit_harvests').order_by('harvest_date', 'id')
        cycle_id = request.query_params.get('production_cycle')
        if not (cycle_id or '').isdigit():
            raise ValidationError({'production_cycle': ['Send the production cycle id.']})
        qs = qs.filter(stocking_record__production_cycle_id=int(cycle_id))
        if owner is not None:
            qs = qs.filter(stocking_record__fisherfolk_id=owner)
        return Response({'harvests': [force_harvest_detail(h) for h in qs]})

    def post(self, request):
        serializer = ForceHarvestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        harvests = record_force_harvests(request.user, serializer.validated_data)
        saved = FisheriesHarvestRecord.objects.filter(pk__in=[h.pk for h in harvests]).select_related(
            'stocking_record__species', 'stocking_record__production_cycle', 'stocking_record__fisherfolk', 'recorded_by',
        ).prefetch_related('production_units', 'unit_harvests').order_by('id')
        return Response({'harvests': [force_harvest_detail(h) for h in saved]}, status=drf_status.HTTP_201_CREATED)


class ForceHarvestDetailView(APIView):
    """GET /fisheries/force-harvest/<harvest id>/ - one saved emergency Force Harvest, from the database. 404 for any
    other harvest record (a normal or Health Log harvest) and for another fisherfolk's record."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, pk):
        owner = fisherfolk_scope(request.user)
        qs = FisheriesHarvestRecord.objects.exclude(force_harvest_reason='').select_related(
            'stocking_record__species', 'stocking_record__production_cycle', 'stocking_record__fisherfolk', 'recorded_by',
        ).prefetch_related('production_units', 'unit_harvests')
        if owner is not None:
            qs = qs.filter(stocking_record__fisherfolk_id=owner)
        return Response(force_harvest_detail(get_object_or_404(qs, pk=pk)))
