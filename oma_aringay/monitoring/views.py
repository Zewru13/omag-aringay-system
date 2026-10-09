from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import (
    IsAdminOrEvaluator, IsStaffOrFisherfolk, fisherfolk_scope, scope_to_fisherfolk,
)
from core.utils import is_plain_int
from fisheries.models import SpeciesOption
from fisheries.notifications import queue_cycle_started

from .models import (
    AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle,
    FarmVisit, FisheryInputLog,
)
from .serializers import (
    AquacultureFeedingLogSerializer,
    AquacultureHealthLogSerializer,
    AquacultureProductionCycleSerializer,
    FarmVisitSerializer,
    FisheryInputLogSerializer,
)


class FarmVisitListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmVisitSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FarmVisit.objects.select_related('farmer', 'conducted_by').order_by('-visit_date')
        params = self.request.query_params
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        if params.get('barangay'):
            qs = qs.filter(farmer__barangay=params['barangay'])
        if params.get('year'):
            qs = qs.filter(visit_date__year=params['year'])
        return qs

    def perform_create(self, serializer):
        serializer.save(conducted_by=self.request.user)


class FarmVisitDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FarmVisitSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmVisit.objects.select_related('farmer', 'conducted_by')


# ─── Aquaculture Production Cycles ───────────────────────────────────────────
# Admin/Evaluator: every cycle, as before. A fisherfolk citizen: only their own cycles (and, through
# them, their own units and logs) - see accounts.permissions.scope_to_fisherfolk.

def _cycle_queryset(user):
    return scope_to_fisherfolk(AquacultureProductionCycle.objects.all(), user)


def _owned_cycle_or_404(request, cycle_id):
    """The cycle named by a nested URL - 404 when it is not visible to this user (another fisherfolk's)."""
    return get_object_or_404(_cycle_queryset(request.user), pk=cycle_id)


def _with_own_fisherfolk(request):
    """A fisherfolk citizen's submitted data with `fisherfolk` forced to their own record - a submitted
    fisherfolk id is never trusted. Staff data is returned unchanged."""
    owner = fisherfolk_scope(request.user)
    if owner is None:
        return request.data
    data = request.data.copy()
    data['fisherfolk'] = owner
    return data


class AquacultureProductionCycleListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureProductionCycleSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        qs = _cycle_queryset(self.request.user).select_related('fisherfolk', 'organization').prefetch_related(
            'feeding_logs__unit_quantities__production_unit', 'health_logs__production_unit', 'input_logs', 'units', 'stocking_records',
        ).order_by('-stocking_date')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=_with_own_fisherfolk(request))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=201)

    def perform_create(self, serializer):
        cycle = serializer.save(recorded_by=self.request.user)
        # "Production Cycle Started" for the cycle's fisherfolk + staff - written once the create commits.
        queue_cycle_started(cycle, self.request.user)


class EstimateHarvestView(APIView):
    """Live preview for the Start Production Cycle form. Same shared formula and species
    defaults as the StockingRecord created on submit; nothing here is stored (no owned data)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        species_id = request.query_params.get('species', '')
        fingerlings = request.query_params.get('fingerlings', '')
        if not is_plain_int(species_id) or not is_plain_int(fingerlings):
            return Response({'detail': 'species and fingerlings must be whole numbers.'}, status=400)
        species = SpeciesOption.objects.filter(pk=species_id).first()
        if species is None:
            return Response({'detail': 'Unknown species.'}, status=400)
        estimate = species.estimate_harvest_kg(int(fingerlings))
        return Response({
            'estimated_harvest_kg': str(estimate) if estimate is not None else None,
            'survival_rate_pct': str(species.default_survival_rate_pct),
            'avg_body_weight_kg': str(species.default_avg_body_weight_kg),
        })


class AquacultureProductionCycleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AquacultureProductionCycleSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    fisherfolk_blocked_methods = ('DELETE',)   # deleting a whole cycle stays a staff action
    http_method_names = ['get', 'patch', 'delete']

    def get_queryset(self):
        return _cycle_queryset(self.request.user).select_related('fisherfolk', 'organization').prefetch_related(
            'feeding_logs__unit_quantities__production_unit', 'health_logs__production_unit', 'input_logs', 'units', 'stocking_records',
        )

    def update(self, request, *args, **kwargs):
        # A fisherfolk can edit their own cycle but never hand it to another fisherfolk.
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=_with_own_fisherfolk(request), partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)


class AquacultureFeedingLogListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureFeedingLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        cycle = _owned_cycle_or_404(self.request, self.kwargs['cycle_id'])
        return AquacultureFeedingLog.objects.filter(
            production_cycle=cycle,
        ).prefetch_related('unit_quantities__production_unit').order_by('-feeding_date')

    def perform_create(self, serializer):
        cycle = _owned_cycle_or_404(self.request, self.kwargs['cycle_id'])
        serializer.save(production_cycle=cycle)


class AquacultureFeedingLogDeleteView(generics.DestroyAPIView):
    serializer_class = AquacultureFeedingLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get_queryset(self):
        return scope_to_fisherfolk(AquacultureFeedingLog.objects.all(), self.request.user, 'production_cycle__fisherfolk_id')


class AquacultureHealthLogListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureHealthLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        cycle = _owned_cycle_or_404(self.request, self.kwargs['cycle_id'])
        return AquacultureHealthLog.objects.filter(
            production_cycle=cycle,
        ).select_related('production_unit').order_by('-log_date')

    def perform_create(self, serializer):
        serializer.save(production_cycle_id=self.kwargs['cycle_id'])

    # Per-unit fields of a `unit_logs` entry; log_date and notes stay shared across the submission.
    # vet_consulted is no longer collected: the column stays (default False) so older logs keep their value.
    UNIT_LOG_FIELDS = ('production_unit', 'observation', 'mortality_count', 'treatment_applied')

    def create(self, request, *args, **kwargs):
        """One submission may name several affected ponds/cages. Each one still gets its OWN unit-specific log
        (Force Harvest, mortality and history stay per unit, and no schema change is needed), created
        all-or-nothing.
          - `unit_logs`: [{production_unit, observation, mortality_count, treatment_applied}] -
            every unit has its own observation/values; `log_date` and `notes` are shared.
          - `production_units`: the same values for every unit; `unit_mortality` ({unit_id: count}) gives each
            unit its own count, else `mortality_count` applies to each.
        A plain `production_unit` request works exactly as before."""
        _owned_cycle_or_404(request, self.kwargs['cycle_id'])   # never another fisherfolk's cycle
        if 'unit_logs' in request.data:
            return self._create_unit_logs(request)
        ids = request.data.get('production_units')
        if ids is None:
            return super().create(request, *args, **kwargs)
        if not isinstance(ids, list) or not ids or not all(isinstance(i, (int, str)) for i in ids):
            raise ValidationError({'production_units': ['Select at least one affected pond/cage.']})
        unit_ids = list(dict.fromkeys(ids))        # each unit once
        per_unit_mortality = request.data.get('unit_mortality') or {}
        base = {k: request.data[k] for k in request.data.keys() if k not in ('production_units', 'production_unit', 'unit_mortality')}
        cycle_id = self.kwargs['cycle_id']
        errors, created = [], []
        with transaction.atomic():
            for uid in unit_ids:
                data = {**base, 'production_unit': uid}
                if str(uid) in per_unit_mortality:
                    data['mortality_count'] = per_unit_mortality[str(uid)]
                serializer = self.get_serializer(data=data)
                if not serializer.is_valid():
                    errors.append(' '.join(str(m) for msgs in serializer.errors.values() for m in (msgs if isinstance(msgs, list) else [msgs])))
                    continue
                serializer.save(production_cycle_id=cycle_id)
                created.append(serializer.data)
            if errors:
                transaction.set_rollback(True)   # nothing is created unless every selected unit is valid
        if errors:
            return Response({'production_units': errors}, status=400)
        return Response(created, status=201)

    def _create_unit_logs(self, request):
        entries = request.data.get('unit_logs')
        if not isinstance(entries, list) or not entries or not all(isinstance(e, dict) for e in entries):
            raise ValidationError({'unit_logs': ['Select at least one affected pond/cage.']})
        unit_ids = [str(e.get('production_unit')) for e in entries]
        if len(set(unit_ids)) != len(unit_ids):
            raise ValidationError({'unit_logs': ['Each pond/cage can be listed only once.']})
        shared = {k: request.data[k] for k in ('log_date', 'notes') if k in request.data}
        cycle_id = self.kwargs['cycle_id']
        # errors[i] belongs to entries[i] ({} when that unit is valid), so the form can mark the right unit.
        errors, created = [], []
        with transaction.atomic():
            for entry in entries:
                data = {**shared, **{k: entry[k] for k in self.UNIT_LOG_FIELDS if k in entry}}
                serializer = self.get_serializer(data=data)
                if not serializer.is_valid():
                    errors.append(serializer.errors)
                    continue
                errors.append({})
                serializer.save(production_cycle_id=cycle_id)
                created.append(serializer.data)
            if any(errors):
                transaction.set_rollback(True)   # nothing is created unless every unit's log is valid
        if any(errors):
            return Response({'unit_logs': errors}, status=400)
        return Response(created, status=201)


class AquacultureHealthLogDeleteView(generics.DestroyAPIView):
    serializer_class = AquacultureHealthLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get_queryset(self):
        return scope_to_fisherfolk(AquacultureHealthLog.objects.all(), self.request.user, 'production_cycle__fisherfolk_id')


# ─── Fishery Input Logs ───────────────────────────────────────────────────────

class FisheryInputLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheryInputLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        cycle = _owned_cycle_or_404(self.request, self.kwargs['cycle_id'])
        return FisheryInputLog.objects.filter(production_cycle=cycle).order_by('-date_acquired')

    def perform_create(self, serializer):
        cycle = _owned_cycle_or_404(self.request, self.kwargs['cycle_id'])
        serializer.save(production_cycle=cycle, logged_by=self.request.user)


class FisheryInputLogDeleteView(generics.DestroyAPIView):
    serializer_class = FisheryInputLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get_queryset(self):
        return scope_to_fisherfolk(FisheryInputLog.objects.all(), self.request.user, 'production_cycle__fisherfolk_id')
