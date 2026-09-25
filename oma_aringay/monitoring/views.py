from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from fisheries.models import SpeciesOption

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

class AquacultureProductionCycleListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureProductionCycleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = AquacultureProductionCycle.objects.select_related('fisherfolk', 'organization').prefetch_related(
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

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class EstimateHarvestView(APIView):
    """Live preview for the Start Production Cycle form. Same shared formula and species
    defaults as the StockingRecord created on submit; nothing here is stored."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        species_id = request.query_params.get('species', '')
        fingerlings = request.query_params.get('fingerlings', '')
        if not species_id.isdigit() or not fingerlings.isdigit():
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
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AquacultureProductionCycle.objects.select_related('fisherfolk', 'organization').prefetch_related(
        'feeding_logs__unit_quantities__production_unit', 'health_logs__production_unit', 'input_logs', 'units', 'stocking_records',
    )
    http_method_names = ['get', 'patch', 'delete']


class AquacultureFeedingLogListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureFeedingLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return AquacultureFeedingLog.objects.filter(
            production_cycle_id=self.kwargs['cycle_id'],
        ).prefetch_related('unit_quantities__production_unit').order_by('-feeding_date')

    def perform_create(self, serializer):
        serializer.save(production_cycle_id=self.kwargs['cycle_id'])


class AquacultureFeedingLogDeleteView(generics.DestroyAPIView):
    serializer_class = AquacultureFeedingLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AquacultureFeedingLog.objects.all()


class AquacultureHealthLogListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureHealthLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return AquacultureHealthLog.objects.filter(
            production_cycle_id=self.kwargs['cycle_id'],
        ).select_related('production_unit').order_by('-log_date')

    def perform_create(self, serializer):
        serializer.save(production_cycle_id=self.kwargs['cycle_id'])


class AquacultureHealthLogDeleteView(generics.DestroyAPIView):
    serializer_class = AquacultureHealthLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AquacultureHealthLog.objects.all()


# ─── Fishery Input Logs ───────────────────────────────────────────────────────

class FisheryInputLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheryInputLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheryInputLog.objects.filter(
            production_cycle_id=self.kwargs['cycle_id'],
        ).order_by('-date_acquired')

    def perform_create(self, serializer):
        serializer.save(
            production_cycle_id=self.kwargs['cycle_id'],
            logged_by=self.request.user,
        )


class FisheryInputLogDeleteView(generics.DestroyAPIView):
    serializer_class = FisheryInputLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheryInputLog.objects.all()
