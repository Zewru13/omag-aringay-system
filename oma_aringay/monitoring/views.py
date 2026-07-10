from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework import generics
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator

from .models import (
    AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle,
    FarmVisit, FisheriesAssistanceRecord, FisherfolkDisasterReport,
    FisheryInputLog, FishingTripLog, TripSpeciesEntry, VesselInspection,
)
from .serializers import (
    AquacultureFeedingLogSerializer,
    AquacultureHealthLogSerializer,
    AquacultureProductionCycleSerializer,
    FarmVisitSerializer,
    FisheriesAssistanceSerializer,
    FisherfolkDisasterReportSerializer,
    FisheryInputLogSerializer,
    FishingTripLogSerializer,
    TripSpeciesEntrySerializer,
    VesselInspectionSerializer,
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


class FishingTripLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FishingTripLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FishingTripLog.objects.select_related(
            'fisherfolk', 'recorded_by',
        ).prefetch_related('species_entries').order_by('-trip_date')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('year'):
            qs = qs.filter(trip_date__year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FishingTripLogDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FishingTripLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FishingTripLog.objects.select_related('fisherfolk').prefetch_related('species_entries')


# ─── Module 4: Species Entries ───────────────────────────────────────────────

class TripSpeciesEntryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, trip_id):
        entries = TripSpeciesEntry.objects.filter(fishing_trip_id=trip_id).order_by('-volume_kg')
        serializer = TripSpeciesEntrySerializer(entries, many=True)
        return Response(serializer.data)

    def post(self, request, trip_id):
        trip = FishingTripLog.objects.get(pk=trip_id)
        serializer = TripSpeciesEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(fishing_trip=trip)
        return Response(serializer.data, status=201)


class TripSpeciesEntryDeleteView(generics.DestroyAPIView):
    serializer_class = TripSpeciesEntrySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = TripSpeciesEntry.objects.all()


class FishingTripSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        season = request.query_params.get('season')
        year = request.query_params.get('year')
        barangay = request.query_params.get('barangay')

        qs = FishingTripLog.objects.all()
        if year:
            qs = qs.filter(trip_date__year=year)
        if season:
            if season == 'Wet':
                qs = qs.filter(trip_date__month__in=[6, 7, 8, 9, 10, 11])
            else:
                qs = qs.filter(
                    Q(trip_date__month__in=[1, 2, 3, 4, 5]) | Q(trip_date__month=12)
                )
        if barangay:
            qs = qs.filter(fisherfolk__barangay=barangay)

        # By barangay
        by_barangay_qs = (
            qs.values('fisherfolk__barangay')
            .annotate(
                trip_count=Count('id'),
                total_catch_kg=Sum('total_catch_kg'),
                active_fisherfolk=Count('fisherfolk', distinct=True),
            )
            .order_by('fisherfolk__barangay')
        )
        by_barangay = [
            {
                'barangay': r['fisherfolk__barangay'],
                'trip_count': r['trip_count'],
                'total_catch_kg': float(r['total_catch_kg'] or 0),
                'active_fisherfolk': r['active_fisherfolk'],
            }
            for r in by_barangay_qs
        ]

        # Totals
        totals_agg = qs.aggregate(
            total_volume_kg=Sum('total_catch_kg'),
            trip_count=Count('id'),
            active_fisherfolk=Count('fisherfolk', distinct=True),
        )

        # Top 10 species across all matching trips
        trip_ids = qs.values_list('id', flat=True)
        species_qs = (
            TripSpeciesEntry.objects.filter(fishing_trip_id__in=trip_ids)
            .values('species_name')
            .annotate(
                total_volume_kg=Sum('volume_kg'),
                trip_count=Count('fishing_trip', distinct=True),
            )
            .order_by('-total_volume_kg')[:10]
        )
        total_vol = totals_agg['total_volume_kg'] or Decimal('0')
        top_species = []
        for row in species_qs:
            pct = (
                float(row['total_volume_kg'] / total_vol * 100)
                if total_vol
                else 0
            )
            top_species.append({
                'species_name': row['species_name'],
                'total_volume_kg': float(row['total_volume_kg'] or 0),
                'trip_count': row['trip_count'],
                'pct_of_total_catch': round(pct, 2),
            })

        species_diversity = (
            TripSpeciesEntry.objects.filter(fishing_trip_id__in=trip_ids)
            .values('species_name').distinct().count()
        )

        return Response({
            'by_barangay': by_barangay,
            'totals': {
                'total_volume_kg': float(totals_agg['total_volume_kg'] or 0),
                'trip_count': totals_agg['trip_count'],
                'active_fisherfolk': totals_agg['active_fisherfolk'],
            },
            'top_species': top_species,
            'species_diversity': species_diversity,
        })


# ─── Module 5: Fisheries Historical Analytics ────────────────────────────────

class FisheriesHistoricalTimelineView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        barangay = request.query_params.get('barangay')
        fisherfolk_type = request.query_params.get('fisherfolk_type')

        qs = FishingTripLog.objects.all()
        if barangay:
            qs = qs.filter(fisherfolk__barangay=barangay)
        if fisherfolk_type:
            qs = qs.filter(fisherfolk__fisherfolk_type=fisherfolk_type)

        # Pull all trips with year + month
        trips = list(qs.values('id', 'trip_date', 'total_catch_kg', 'fisherfolk'))

        grouped = defaultdict(lambda: {
            'total_volume_kg': Decimal('0'),
            'trip_count': 0,
            'fisherfolk_set': set(),
        })

        for t in trips:
            m = t['trip_date'].month
            y = t['trip_date'].year
            season = 'Wet' if 6 <= m <= 11 else 'Dry'
            key = (season, y)
            g = grouped[key]
            g['total_volume_kg'] += (t['total_catch_kg'] or Decimal('0'))
            g['trip_count'] += 1
            g['fisherfolk_set'].add(t['fisherfolk'])

        timeline = []
        for (season, year), g in sorted(grouped.items(), key=lambda x: (x[0][1], x[0][0])):
            timeline.append({
                'season': season,
                'year': year,
                'total_volume_kg': float(g['total_volume_kg']),
                'trip_count': g['trip_count'],
                'active_fisherfolk': len(g['fisherfolk_set']),
            })

        return Response({
            'scope': barangay if barangay else 'Municipality-wide',
            'fisherfolk_type': fisherfolk_type or 'All',
            'timeline': timeline,
        })


class FisheriesBarangaySummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        season = request.query_params.get('season')
        year = request.query_params.get('year')
        if not season or not year:
            return Response({'detail': 'season and year are required.'}, status=400)

        if season == 'Wet':
            month_filter = Q(trip_date__month__in=[6, 7, 8, 9, 10, 11])
        else:
            month_filter = Q(trip_date__month__in=[1, 2, 3, 4, 5]) | Q(trip_date__month=12)

        qs = FishingTripLog.objects.filter(month_filter, trip_date__year=year)

        by_barangay = (
            qs.values('fisherfolk__barangay')
            .annotate(
                trip_count=Count('id'),
                total_catch_kg=Sum('total_catch_kg'),
                active_fisherfolk=Count('fisherfolk', distinct=True),
            )
            .order_by('fisherfolk__barangay')
        )

        result = [
            {
                'barangay': r['fisherfolk__barangay'],
                'trip_count': r['trip_count'],
                'total_catch_kg': float(r['total_catch_kg'] or 0),
                'active_fisherfolk': r['active_fisherfolk'],
            }
            for r in by_barangay
        ]

        # Top species for this season+year
        trip_ids = qs.values_list('id', flat=True)
        top_species = list(
            TripSpeciesEntry.objects.filter(fishing_trip_id__in=trip_ids)
            .values('species_name')
            .annotate(total_volume_kg=Sum('volume_kg'))
            .order_by('-total_volume_kg')[:10]
        )
        for s in top_species:
            s['total_volume_kg'] = float(s['total_volume_kg'] or 0)

        return Response({
            'season': season,
            'year': int(year),
            'by_barangay': result,
            'top_species': top_species,
        })


class VesselInspectionListCreateView(generics.ListCreateAPIView):
    serializer_class = VesselInspectionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = VesselInspection.objects.select_related('fisherfolk', 'inspected_by').order_by('-inspection_date')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(inspected_by=self.request.user)


class VesselInspectionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = VesselInspectionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = VesselInspection.objects.select_related('fisherfolk')


class VesselLicenseAlertView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        threshold = date.today() + timedelta(days=30)
        qs = VesselInspection.objects.filter(
            license_expiry_date__lte=threshold,
        ).select_related('fisherfolk').order_by('license_expiry_date')
        serializer = VesselInspectionSerializer(qs, many=True)
        return Response(serializer.data)


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


# ─── Fisheries Assistance Records ────────────────────────────────────────────

class FisheriesAssistanceListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesAssistanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FisheriesAssistanceRecord.objects.select_related('fisherfolk', 'recorded_by').order_by('-date_received')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FisheriesAssistanceDeleteView(generics.DestroyAPIView):
    serializer_class = FisheriesAssistanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheriesAssistanceRecord.objects.all()
