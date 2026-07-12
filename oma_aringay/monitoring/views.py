from rest_framework import generics
from rest_framework.permissions import IsAuthenticated

from accounts.permissions import IsAdminOrEvaluator

from .models import (
    AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle,
    FarmVisit, FisherfolkDisasterReport, FisheryInputLog,
)
from .serializers import (
    AquacultureFeedingLogSerializer,
    AquacultureHealthLogSerializer,
    AquacultureProductionCycleSerializer,
    FarmVisitSerializer,
    FisherfolkDisasterReportSerializer,
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
        qs = AquacultureProductionCycle.objects.select_related('fisherfolk').prefetch_related(
            'feeding_logs', 'health_logs', 'input_logs',
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


class AquacultureProductionCycleDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AquacultureProductionCycleSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AquacultureProductionCycle.objects.select_related('fisherfolk').prefetch_related(
        'feeding_logs', 'health_logs', 'input_logs',
    )
    http_method_names = ['get', 'patch', 'delete']


class AquacultureFeedingLogListCreateView(generics.ListCreateAPIView):
    serializer_class = AquacultureFeedingLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return AquacultureFeedingLog.objects.filter(
            production_cycle_id=self.kwargs['cycle_id'],
        ).order_by('-feeding_date')

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
        ).order_by('-log_date')

    def perform_create(self, serializer):
        serializer.save(production_cycle_id=self.kwargs['cycle_id'])


class AquacultureHealthLogDeleteView(generics.DestroyAPIView):
    serializer_class = AquacultureHealthLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AquacultureHealthLog.objects.all()


# ─── Fisherfolk Disaster Reports ─────────────────────────────────────────────

class FisherfolkDisasterReportListCreateView(generics.ListCreateAPIView):
    serializer_class = FisherfolkDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FisherfolkDisasterReport.objects.select_related('fisherfolk').order_by('-report_date')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(affected_barangay=params['barangay'])
        if params.get('disaster_type'):
            qs = qs.filter(disaster_type=params['disaster_type'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FisherfolkDisasterReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FisherfolkDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkDisasterReport.objects.select_related('fisherfolk')
    http_method_names = ['get', 'patch', 'delete']


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
