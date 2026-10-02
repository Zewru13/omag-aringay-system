from collections import defaultdict
from decimal import Decimal
from io import BytesIO

from django.db import transaction
from django.db.models import Avg, Case, CharField, Count, Exists, IntegerField, OuterRef, Q, Sum, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status as drf_status
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrEvaluator, IsStaffOrOwnRecordCitizen
from core.constants import BARANGAY_CHOICES
from core.locking import assert_not_locked_by_other
from core.notifications import notify_staff, notify_user, resolve_owner_user
from core.utils import accumulate_yield_group, filter_people_search, harvest_gate_status, new_yield_group
from farmers.models import FarmParcel, Farmer
from fisheries.models import Fisherfolk

from .dashboard_activity import (
    active_disaster_rows, barangay_rows, crop_activity_status,
    crop_yield_variance, fisheries_activity_status, not_received_count, sector_summary,
)
from .models import (
    ActivityType,
    BarangayCropSummary,
    CropActivityLog, CropActivityStage, CropCategory, CropDisasterReport,
    CropInputType,
    CropMonitoringRecord, CropRemark,
    CropSubcategory, CropType, CropVariety, DamageReport, DisasterResponseRule,
    FarmInputLog, HarvestRecord, LaborOperationLog, PestDiseaseReport, PlantingRecord,
    SeedSource,
)
from .serializers import (
    ActivityTypeSerializer,
    BarangayCropSummarySerializer,
    CropActivityLogSerializer,
    CropActivityStageSerializer,
    CropCategorySerializer,
    CropDisasterReportSerializer,
    CropInputTypeSerializer,
    CropMonitoringDetailSerializer,
    CropMonitoringRecordSerializer,
    CropRemarkSerializer,
    MonitoringRemarkSerializer,
    CropSubcategorySerializer,
    CropTypeSerializer,
    CropVarietySerializer,
    DamageReportSerializer,
    FarmInputLogSerializer,
    HarvestRecordCreateSerializer,
    HarvestRecordSerializer,
    LaborOperationLogSerializer,
    PestDiseaseReportSerializer,
    PlantingRecordCreateSerializer,
    PlantingRecordSerializer,
    SeedSourceSerializer,
)


class HarvestRecordListView(generics.ListAPIView):
    serializer_class = HarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        queryset = HarvestRecord.objects.select_related(
            'farm_parcel',
            'farm_parcel__farmer',
            'recorded_by',
        ).order_by('-date_recorded', '-id')

        year = self.request.query_params.get('year')
        season = self.request.query_params.get('season')
        barangay = self.request.query_params.get('barangay')
        commodity = self.request.query_params.get('commodity')

        if year:
            queryset = queryset.filter(year=year)

        if season:
            queryset = queryset.filter(season__iexact=season)

        if barangay:
            queryset = queryset.filter(farm_parcel__barangay__iexact=barangay)

        if commodity:
            queryset = queryset.filter(
                Q(crop_name__icontains=commodity)
                | Q(farm_parcel__commodity_name__icontains=commodity)
                | Q(farm_parcel__commodity_type__icontains=commodity)
            )

        return queryset


class HarvestRecordCreateView(generics.CreateAPIView):
    queryset = HarvestRecord.objects.all()
    serializer_class = HarvestRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]

    def get_target_owner_id(self, request):
        monitoring_id = request.data.get('monitoring_record')
        if not monitoring_id:
            return None
        try:
            return CropMonitoringRecord.objects.get(pk=monitoring_id).farmer_id
        except CropMonitoringRecord.DoesNotExist:
            return None

    def create(self, request, *args, **kwargs):
        monitoring_id = request.data.get('monitoring_record')
        if monitoring_id:
            try:
                record = CropMonitoringRecord.objects.get(pk=monitoring_id)
                if record.status == CropMonitoringRecord.Status.TOTAL_LOSS:
                    return Response(
                        {'detail': 'Cannot record harvest for a Total Loss record — the crop was completely destroyed.'},
                        status=drf_status.HTTP_400_BAD_REQUEST,
                    )
                # date_planted is only an approximation for records imported
                # from a registry timestamp (see the field's own comment) —
                # the 50%-duration math below would be measuring against a
                # made-up start date, so this blocks outright rather than
                # gating by a duration that means nothing yet. Same pattern as
                # FishingTripLog.clean()'s block on an unclassified fisherfolk_type:
                # the record needs a real confirmed value before this action
                # is meaningful at all.
                if record.date_planted_is_estimated:
                    return Response(
                        {'detail': (
                            'This record\'s planting date is an estimate (imported from a registry '
                            'record, not a confirmed field date). Harvest cannot be recorded until '
                            'a staff member confirms or corrects the real planting date.'
                        )},
                        status=drf_status.HTTP_400_BAD_REQUEST,
                    )
                is_gated, message = harvest_gate_status(record.date_planted, record.expected_harvest_date)
                if is_gated:
                    return Response({'detail': message}, status=drf_status.HTTP_400_BAD_REQUEST)
            except CropMonitoringRecord.DoesNotExist:
                pass
            assert_not_locked_by_other(request.user, 'crop', monitoring_id)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        harvest = serializer.save(recorded_by=self.request.user)
        monitoring_id = self.request.data.get('monitoring_record')
        if monitoring_id:
            try:
                monitoring = CropMonitoringRecord.objects.get(pk=monitoring_id)
            except CropMonitoringRecord.DoesNotExist:
                return
            if self.request.user.role != 'CITIZEN':
                notify_user(
                    recipient=resolve_owner_user(
                        farmer_id=monitoring.farmer_id,
                        farmers_organization_id=monitoring.farmers_organization_id,
                    ),
                    actor=self.request.user,
                    verb='recorded a harvest for',
                    record_type='crop',
                    record_id=monitoring_id,
                    record_label=_crop_record_label(monitoring),
                    detail=f'{harvest.volume_kg} {harvest.unit_of_measure or "kg"}',
                )


class HarvestRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = HarvestRecord.objects.select_related(
        'farm_parcel',
        'farm_parcel__farmer',
        'monitoring_record',
        'recorded_by',
    )
    serializer_class = HarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    http_method_names = ['get', 'patch', 'delete']
    lookup_field = 'id'

    def get_object_owner_id(self, obj):
        return obj.monitoring_record.farmer_id if obj.monitoring_record_id else None

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id

    def destroy(self, request, *args, **kwargs):
        # CITIZEN never reaches here at all — IsStaffOrOwnRecordCitizen only
        # grants unsafe methods (DELETE included) to a CITIZEN when they
        # also created the entry, but delete was never part of this
        # batch's citizen scope, so this ADMIN-only check (pre-existing,
        # unchanged) still correctly blocks a CITIZEN regardless.
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete harvest records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        harvest = self.get_object()
        monitoring = harvest.monitoring_record
        response = super().destroy(request, *args, **kwargs)
        if monitoring is not None:
            monitoring.status = monitoring.determine_status()
            monitoring.actual_yield_kg = None
            monitoring.actual_harvest_date = None
            monitoring.yield_variance_kg = None
            monitoring.yield_variance_pct = None
            monitoring.save()
        return response


class ProductionDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        current_year = timezone.now().year
        harvests_this_year = HarvestRecord.objects.filter(year=current_year)

        total_volume = harvests_this_year.aggregate(
            total=Sum('volume_kg'),
        )['total'] or 0

        top_commodity_record = harvests_this_year.values('crop_name').annotate(
            total_volume=Sum('volume_kg'),
        ).order_by('-total_volume').first()

        return Response({
            'total_farmers': Farmer.objects.count(),
            'active_farms': FarmParcel.objects.filter(farm_status='Active').count(),
            'inactive_farms': FarmParcel.objects.filter(farm_status='Inactive').count(),
            'total_volume_kg_this_year': total_volume,
            'top_commodity': top_commodity_record['crop_name'] if top_commodity_record else None,
            'total_fisherfolk': Fisherfolk.objects.count(),
        })


class DashboardActivityStatusView(APIView):
    """OVERDUE / DUE TODAY / UPCOMING for both domains, plus the per-barangay
    breakdown the staff dashboard's "Activity Status" table needs.

    Both figures come from the same classifier the record detail screens use
    (see production/dashboard_activity.py), so the dashboard can never disagree
    with the screen it links to.

    NOTE the reference dashboard also draws an "Assigned Evaluator" column on
    this table. There is no staff-to-barangay assignment anywhere in this
    system, so no such field is returned — inventing a name here would put a
    fabricated accountability record in front of an administrator.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        crop_totals, crop_by_brgy = crop_activity_status()
        fish_totals, fish_by_brgy = fisheries_activity_status()
        return Response({
            'crop': {**crop_totals, 'by_barangay': barangay_rows(crop_by_brgy)},
            'fisheries': {**fish_totals, 'by_barangay': barangay_rows(fish_by_brgy)},
            'active_disasters': active_disaster_rows(),
            'sectors': sector_summary(),
            'yield_variance': crop_yield_variance(),
            'not_received_count': not_received_count(),
        })


class AgriDashboardView(APIView):
    """Dashboard stats for the Agri module: organizations, crop records, harvest calendar, distribution.
    Pass ?domain=fisheries to get fisheries stocking stats instead."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        domain = request.query_params.get('domain', 'crops').strip().lower()
        if domain == 'fisheries':
            return self._get_fisheries(request)
        return self._get_crops(request)

    def _get_fisheries(self, request):
        from associations.models import FisherfolkOrganization
        from fisheries.models import StockingRecord
        from datetime import date, timedelta

        today      = date.today()
        week_later = today + timedelta(days=7)
        year_param = request.query_params.get('year',   '').strip()

        total_assoc = FisherfolkOrganization.objects.count()

        base_active = StockingRecord.objects.filter(
            status__in=[StockingRecord.Status.STOCKED, StockingRecord.Status.NEAR_HARVEST]
        )
        if year_param:
            base_active = base_active.filter(year=year_param)

        total_stocking    = base_active.count()
        nearing_harvest   = base_active.filter(
            expected_harvest_date__lte=week_later,
            expected_harvest_date__gte=today,
        ).count()

        top_barangay_row = (
            base_active
            .exclude(pond_location_barangay='')
            .values('pond_location_barangay')
            .annotate(total_area=Sum('area_hectares'))
            .order_by('-total_area')
            .first()
        )
        top_barangay = top_barangay_row['pond_location_barangay'] if top_barangay_row else '—'

        # Harvest calendar from stocking expected_harvest_date
        upcoming_qs = (
            base_active
            .filter(
                expected_harvest_date__gte=today,
                expected_harvest_date__lte=today + timedelta(days=90),
            )
            .values_list('expected_harvest_date', flat=True)
            .distinct()
        )
        overdue_qs = (
            base_active
            .filter(expected_harvest_date__lt=today)
            .values_list('expected_harvest_date', flat=True)
            .distinct()
        )
        harvest_dates = (
            [{'date': str(d), 'type': 'upcoming'} for d in upcoming_qs]
            + [{'date': str(d), 'type': 'overdue'}  for d in overdue_qs]
        )

        # Distribution by species + barangay
        all_stocking = StockingRecord.objects.select_related('species').exclude(
            status=StockingRecord.Status.TOTAL_LOSS
        )
        if year_param:
            all_stocking = all_stocking.filter(year=year_param)

        dist_qs = (
            all_stocking
            .values('pond_location_barangay', 'species__species_name')
            .annotate(count=Count('id'))
            .order_by('species__species_name')
        )
        distribution_detail = [
            {
                'barangay': row['pond_location_barangay'] or 'Unknown',
                'crop':     row['species__species_name']  or 'Unknown',
                'count':    row['count'],
            }
            for row in dist_qs
        ]

        available_years = sorted(
            StockingRecord.objects.values_list('year', flat=True).distinct(),
            reverse=True,
        )

        return Response({
            'total_organizations': total_assoc,
            'total_crop_records': total_stocking,
            'nearing_harvest':    nearing_harvest,
            'top_barangay':       top_barangay,
            'harvest_dates':      harvest_dates,
            'harvest_calendar':   harvest_dates,
            'crop_distribution':  [],
            'crop_distribution_detail': distribution_detail,
            'available_years':    available_years,
        })

    def _get_crops(self, request):
        from associations.models import FarmersOrganization
        from datetime import date, timedelta

        today = date.today()
        week_later = today + timedelta(days=7)

        season_param = request.query_params.get('season', '').strip()
        year_param   = request.query_params.get('year',   '').strip()

        def apply_filters(qs):
            if season_param:
                qs = qs.filter(season__iexact=season_param)
            if year_param:
                qs = qs.filter(year=year_param)
            return qs

        total_organizations = FarmersOrganization.objects.count()

        base_active = apply_filters(
            CropMonitoringRecord.objects.exclude(
                status__in=[CropMonitoringRecord.Status.HARVESTED, CropMonitoringRecord.Status.TOTAL_LOSS]
            )
        )
        total_crop_records = base_active.count()

        nearing_harvest = base_active.filter(
            expected_harvest_date__gte=today,
            expected_harvest_date__lte=week_later,
        ).count()

        # Top barangay by total area planted
        top_barangay_row = (
            base_active
            .values('farm_location_barangay')
            .annotate(total_area=Sum('area_planted_ha'))
            .exclude(farm_location_barangay='')
            .order_by('-total_area')
            .first()
        )
        if not top_barangay_row:
            top_barangay_row = (
                base_active
                .values('farm_parcel__barangay')
                .annotate(total_area=Sum('area_planted_ha'))
                .exclude(farm_parcel__barangay='')
                .order_by('-total_area')
                .first()
            )
            top_barangay = top_barangay_row['farm_parcel__barangay'] if top_barangay_row else '—'
        else:
            top_barangay = top_barangay_row['farm_location_barangay']

        # Harvest dates: upcoming (next 90 days) + overdue (past, still active)
        upcoming_qs = (
            base_active
            .filter(
                expected_harvest_date__gte=today,
                expected_harvest_date__lte=today + timedelta(days=90),
            )
            .values_list('expected_harvest_date', flat=True)
            .distinct()
        )
        overdue_qs = (
            base_active
            .filter(expected_harvest_date__lt=today)
            .values_list('expected_harvest_date', flat=True)
            .distinct()
        )
        harvest_dates = (
            [{'date': str(d), 'type': 'upcoming'} for d in upcoming_qs]
            + [{'date': str(d), 'type': 'overdue'}  for d in overdue_qs]
        )
        harvest_calendar = harvest_dates

        # Crop distribution (all statuses, filtered by season/year)
        dist_base = apply_filters(
            CropMonitoringRecord.objects.exclude(status=CropMonitoringRecord.Status.TOTAL_LOSS)
        )
        dist_qs = (
            dist_base
            .values('farm_location_barangay', 'farm_parcel__barangay')
            .annotate(count=Count('id'), area_ha=Sum('area_planted_ha'))
            .order_by('farm_location_barangay')
        )
        crop_distribution = [
            {
                'barangay': (row['farm_location_barangay'] or row['farm_parcel__barangay'] or 'Unknown'),
                'count': row['count'],
                'area_ha': float(row['area_ha'] or 0),
            }
            for row in dist_qs
        ]

        # Crop distribution detail: barangay + crop grouped
        detail_qs = (
            dist_base
            .values('farm_location_barangay', 'farm_parcel__barangay', 'farmers_organization__barangay', 'crop_type__name')
            .annotate(count=Count('id'))
            .order_by('crop_type__name')
        )
        crop_distribution_detail = [
            {
                'barangay': (row['farm_location_barangay']
                             or row['farm_parcel__barangay']
                             or row['farmers_organization__barangay']
                             or 'Unknown'),
                'crop': row['crop_type__name'] or 'Unknown',
                'count': row['count'],
            }
            for row in detail_qs
        ]

        # Available years for the filter dropdowns
        available_years = sorted(
            CropMonitoringRecord.objects.values_list('year', flat=True).distinct(),
            reverse=True,
        )

        return Response({
            'total_organizations': total_organizations,
            'total_crop_records': total_crop_records,
            'nearing_harvest': nearing_harvest,
            'top_barangay': top_barangay,
            'harvest_dates': harvest_dates,
            'harvest_calendar': harvest_calendar,
            'crop_distribution': crop_distribution,
            'crop_distribution_detail': crop_distribution_detail,
            'available_years': available_years,
        })


class BarangaySummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        queryset = HarvestRecord.objects.all()
        year = request.query_params.get('year')
        season = request.query_params.get('season')

        if year:
            queryset = queryset.filter(year=year)

        if season:
            queryset = queryset.filter(season__iexact=season)

        data = queryset.values(
            'farm_parcel__barangay',
        ).annotate(
            total_volume_kg=Sum('volume_kg'),
            total_area_hectares=Sum('area_harvested_hectares'),
            number_of_farmers=Count('farm_parcel__farmer', distinct=True),
        ).order_by('-total_volume_kg')

        return Response([
            {
                'barangay_name': item['farm_parcel__barangay'],
                'total_volume_kg': item['total_volume_kg'] or 0,
                'total_area_hectares': item['total_area_hectares'] or 0,
                'number_of_farmers': item['number_of_farmers'],
            }
            for item in data
        ])


class CommodityRankingView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        queryset = HarvestRecord.objects.all()
        year = request.query_params.get('year')

        if year:
            queryset = queryset.filter(year=year)

        data = queryset.values(
            'crop_name',
        ).annotate(
            total_volume_kg=Sum('volume_kg'),
            total_area_hectares=Sum('area_harvested_hectares'),
            number_of_farms=Count('farm_parcel', distinct=True),
        ).order_by('-total_volume_kg')

        return Response([
            {
                'crop_name': item['crop_name'],
                'total_volume_kg': item['total_volume_kg'] or 0,
                'total_area_hectares': item['total_area_hectares'] or 0,
                'number_of_farms': item['number_of_farms'],
            }
            for item in data
        ])


class SeasonalComparisonView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        queryset = HarvestRecord.objects.all()
        year = request.query_params.get('year')

        if year:
            queryset = queryset.filter(year=year)

        dry_season = queryset.filter(season='Dry').aggregate(
            total_volume_kg=Sum('volume_kg'),
            farm_count=Count('farm_parcel', distinct=True),
        )
        wet_season = queryset.filter(season='Wet').aggregate(
            total_volume_kg=Sum('volume_kg'),
            farm_count=Count('farm_parcel', distinct=True),
        )

        return Response({
            'dry_season': {
                'total_volume_kg': dry_season['total_volume_kg'] or 0,
                'farm_count': dry_season['farm_count'],
            },
            'wet_season': {
                'total_volume_kg': wet_season['total_volume_kg'] or 0,
                'farm_count': wet_season['farm_count'],
            },
        })


class PlantingRecordListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return PlantingRecordCreateSerializer
        return PlantingRecordSerializer

    def get_queryset(self):
        queryset = PlantingRecord.objects.select_related(
            'farm_parcel', 'farm_parcel__farmer',
        ).order_by('-date_recorded')
        year = self.request.query_params.get('year')
        season = self.request.query_params.get('season')
        barangay = self.request.query_params.get('barangay')
        if year:
            queryset = queryset.filter(year=year)
        if season:
            queryset = queryset.filter(season__iexact=season)
        if barangay:
            queryset = queryset.filter(farm_parcel__barangay__iexact=barangay)
        return queryset

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class PlantingRecordDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = PlantingRecord.objects.select_related('farm_parcel', 'farm_parcel__farmer')
    serializer_class = PlantingRecordSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    http_method_names = ['get', 'patch', 'delete']
    lookup_field = 'pk'


class DamageReportListCreateView(generics.ListCreateAPIView):
    serializer_class = DamageReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        queryset = DamageReport.objects.order_by('-calamity_date')
        barangay = self.request.query_params.get('barangay')
        season = self.request.query_params.get('season')
        year = self.request.query_params.get('year')
        if barangay:
            queryset = queryset.filter(barangay__iexact=barangay)
        if season:
            queryset = queryset.filter(season__iexact=season)
        if year:
            queryset = queryset.filter(year=year)
        return queryset

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class DamageReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    queryset = DamageReport.objects.all()
    serializer_class = DamageReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    http_method_names = ['get', 'patch', 'delete']
    lookup_field = 'pk'


# ─── Crop Assistance (Batch 5) ─────────────────────────────────────────────
# Mirrors FisheriesAssistanceListCreateView/DetailView exactly.

class YearlyProductionTrendView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        current_year = timezone.now().year
        start_year = current_year - 4

        records = (
            HarvestRecord.objects
            .filter(year__gte=start_year, year__lte=current_year)
            .values('year')
            .annotate(total_volume_kg=Sum('volume_kg'))
            .order_by('year')
        )

        data_by_year = {item['year']: item['total_volume_kg'] for item in records}

        return Response([
            {
                'year': year,
                'total_volume_kg': data_by_year.get(year, 0),
            }
            for year in range(start_year, current_year + 1)
        ])


class DashboardExtendedSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        # Fisherfolk counts
        fisherfolk_active = Fisherfolk.objects.filter(is_active=True).count()
        fisherfolk_breakdown = {
            'aquaculture': Fisherfolk.objects.filter(fisherfolk_type='Aquaculture').count(),
            'capture': Fisherfolk.objects.filter(fisherfolk_type='Capture').count(),
        }

        return Response({
            'fisherfolk_active': fisherfolk_active,
            'fisherfolk_breakdown': fisherfolk_breakdown,
        })


# ─── Module 1: CropType ──────────────────────────────────────────────────────

class CropTypeListView(generics.ListCreateAPIView):
    serializer_class = CropTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        # Newest-first, matching every other list in this app (Farmers,
        # Fisherfolk, Organizations, Stocking/Harvest/Crop records, Audit
        # Log, CropVariety, SeedSource) — this was the one real exception.
        qs = CropType.objects.all().order_by('-id')
        # ?is_active=true opts a caller into active-only — same convention
        # CropVarietyListCreateView already uses (is_active=True kicks in
        # only once a crop_type param is given). Default stays unfiltered
        # so Crop Settings keeps showing inactive crops (staff need to see
        # them there to reactivate), while every other screen that offers
        # CropType as a choice for new/ongoing work opts in explicitly.
        if self.request.query_params.get('is_active') == 'true':
            qs = qs.filter(is_active=True)
        return qs


class CropTypeDetailView(generics.RetrieveUpdateAPIView):
    """
    Toggle-not-delete batch: Delete is retired, not just hidden from the
    UI — CropMonitoringRecord.crop_type is on_delete=PROTECT, so a crop
    type with any real monitoring history was already undeletable (the old
    DELETE just 500'd unhandled); a genuinely unused one now gets
    deactivated instead of removed, same as CropVariety/SeedSource already
    do. PATCH {is_active} hides it from new-record dropdowns without
    touching any existing CropMonitoringRecord, which keeps displaying its
    crop type name regardless of this flag.
    """
    serializer_class = CropTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropType.objects.all()


# ─── Module 2: CropMonitoringRecord ──────────────────────────────────────────

class CropMonitoringListCreateView(generics.ListCreateAPIView):
    serializer_class = CropMonitoringRecordSerializer

    def get_permissions(self):
        # Batch 11: CITIZEN may list (own records only, scoped below) but
        # never create — staff remains the sole gatekeeper for starting a
        # new monitoring cycle.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def paginate_queryset(self, queryset):
        # A ?farmer= request is FarmerDetailPage.jsx asking for one
        # farmer's complete crop history (mirrors FarmParcelListView's own
        # pagination_class = None for the same per-farmer detail-page use
        # case) — real pagination stays on for the general, actively-paged
        # Crop Records list, which is the only other caller of this view.
        if self.request.query_params.get('farmer'):
            return None
        return super().paginate_queryset(queryset)

    def get_queryset(self):
        # -id tie-breaks -date_recorded: real bulk imports/seeds routinely
        # create several rows in the same request, sharing one
        # auto_now_add second-precision timestamp — confirmed against live
        # data (multiple real date_recorded values shared by 2-3 rows).
        # Without -id, ties fall back to undefined DB order instead of
        # staying newest-inserted-first.
        qs = CropMonitoringRecord.objects.select_related(
            'farm_parcel', 'farm_parcel__farmer', 'farmer', 'crop_type', 'recorded_by', 'farmers_organization',
        ).prefetch_related('activity_logs', 'labor_logs', 'harvest_records').order_by('-date_recorded', '-id')
        qs = qs.annotate(
            has_disaster=Exists(
                CropDisasterReport.objects.filter(
                    monitoring_record=OuterRef('pk'), status='Active',
                )
            )
        )
        if self.request.user.role == 'CITIZEN':
            farmer_id = self.request.user.get_linked_farmer_id()
            qs = qs.filter(farmer_id=farmer_id if farmer_id else -1)
        params = self.request.query_params
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('season'):
            qs = qs.filter(season__iexact=params['season'])
        if params.get('barangay'):
            # Forecasting-filters batch: was farm_parcel__barangay, which
            # only matches records with an OPTIONAL parcel link and silently
            # missed everything else — farm_location_barangay is the
            # record's own required field (see CropMonitoringRecordSerializer)
            # and what _yield_analysis_queryset already filters on.
            qs = qs.filter(farm_location_barangay__iexact=params['barangay'])
        if params.get('crop_type'):
            qs = qs.filter(crop_type_id=params['crop_type'])
        raw_status = params.get('status', '')
        if raw_status:
            statuses = [s.strip() for s in raw_status.split(',') if s.strip()]
            qs = qs.filter(status__in=statuses)
        else:
            qs = qs.exclude(status=CropMonitoringRecord.Status.TOTAL_LOSS)
        if params.get('farm_parcel'):
            qs = qs.filter(farm_parcel_id=params['farm_parcel'])
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        # Typed in the list's search bar: the farmer (name in any order, or an
        # RSBSA number as typed or without its dashes), the crop, the
        # organization or the barangay — searched across ALL records, not just
        # the page currently on screen.
        qs = filter_people_search(
            qs, params.get('search'),
            name_fields=['farmer__first_name', 'farmer__middle_name', 'farmer__last_name'],
            id_fields=['farmer__rsbsa_number'],
            other_fields=['crop_type__name', 'farmers_organization__name', 'farm_location_barangay'],
        )
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class CropMonitoringBulkCreateView(APIView):
    """Mirrors PondBulkCreateView's bulk-create pattern (fisheries/views.py)
    exactly, per the tabular multi-row Add Crop form: validates EVERY row
    with CropMonitoringRecordSerializer before creating ANY (so a single bad
    row returns per-item errors with nothing persisted), then saves them one
    at a time — not bulk_create — inside a single transaction, since
    CropMonitoringRecord.save() computes expected_harvest_date/
    estimated_yield_kg/status per instance and needs to actually run for
    each row."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        items = request.data
        if not isinstance(items, list) or not items:
            return Response(
                {'detail': 'Expected a non-empty list of crop records.'},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        item_serializers = [CropMonitoringRecordSerializer(data=item) for item in items]
        validities = [s.is_valid() for s in item_serializers]
        if not all(validities):
            return Response({'errors': [s.errors for s in item_serializers]}, status=drf_status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            created = [s.save(recorded_by=request.user) for s in item_serializers]

        return Response(CropMonitoringRecordSerializer(created, many=True).data, status=drf_status.HTTP_201_CREATED)


class CropMonitoringDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropMonitoringRecord.objects.select_related(
        'farm_parcel', 'farm_parcel__farmer', 'crop_type',
    ).prefetch_related('activity_logs', 'input_logs', 'pest_disease_reports', 'labor_logs')

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return CropMonitoringDetailSerializer
        return CropMonitoringRecordSerializer

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete crop records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Crop Duplicate Check ─────────────────────────────────────────────────────

class CropDuplicateCheckView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        farmer_id   = request.query_params.get('farmer')
        crop_type_id = request.query_params.get('crop_type')
        if not farmer_id or not crop_type_id:
            return Response({'duplicates': []})
        qs = CropMonitoringRecord.objects.filter(
            farmer_id=farmer_id,
            crop_type_id=crop_type_id,
            status=CropMonitoringRecord.Status.PLANTED,
        ).select_related('crop_type').order_by('-date_planted')[:5]
        results = [
            {
                'id':           r.id,
                'crop_type':    r.crop_type.name if r.crop_type else '',
                'date_planted': str(r.date_planted) if r.date_planted else None,
                'area_planted_ha': str(r.area_planted_ha),
                'status':       r.status,
            }
            for r in qs
        ]
        return Response({'duplicates': results})


# ─── Module 2b: Crop Activity Suggestions ────────────────────────────────────

class CropActivitySuggestionsView(APIView):
    # Batch E — widened from staff-only to IsStaffOrOwnRecordCitizen so a
    # farmer's own citizen account can read due/overdue suggestions for
    # their own record on the redesigned home screen; ADMIN/EVALUATOR
    # access is unchanged (this class is a strict superset), response
    # shape and validation are untouched. Same get_target_owner_id pattern
    # already used by CropActivityLogListCreateView.
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]

    def get_target_owner_id(self, request):
        monitoring_id = self.kwargs.get('monitoring_id')
        try:
            return CropMonitoringRecord.objects.get(pk=monitoring_id).farmer_id
        except CropMonitoringRecord.DoesNotExist:
            return None

    def get(self, request, monitoring_id):
        from datetime import date, timedelta
        record = get_object_or_404(
            CropMonitoringRecord.objects.select_related('crop_type'),
            pk=monitoring_id,
        )

        stages = CropActivityStage.objects.filter(
            crop_type=record.crop_type
        ).order_by('day_after_planting')

        activity_logs = list(
            CropActivityLog.objects.filter(monitoring_record=record).values(
                'id', 'activity_type', 'date_of_activity', 'target_day',
                'disaster_report_id', 'disaster_rule_id',
            )
        )

        today = date.today()
        days_elapsed = (today - record.date_planted).days if record.date_planted else 0
        total_days = record.crop_type.days_to_harvest if record.crop_type else 0
        planted = record.date_planted
        is_total_loss = record.status == CropMonitoringRecord.Status.TOTAL_LOSS

        suggestions = []
        # An estimated date_planted (see the field's own comment) has no real
        # relationship to when activities are actually due — every
        # occurrence_day would be measured against a made-up start date, which
        # is pure noise, not a suggestion. Suppressed entirely rather than
        # shown-but-wrong.
        if not is_total_loss and not record.date_planted_is_estimated:
            for stage in stages:
                days_list = stage.application_days if stage.application_days else [stage.day_after_planting]
                for occurrence_day in days_list:
                    due_date = planted + timedelta(days=occurrence_day) if planted else None
                    days_diff = occurrence_day - days_elapsed

                    is_done = False
                    done_date = None
                    if due_date:
                        window = stage.window_days
                        for log in activity_logs:
                            if log['activity_type'] != stage.stage_name:
                                continue
                            target_match = log.get('target_day') is not None and log['target_day'] == occurrence_day
                            date_match = abs((log['date_of_activity'] - due_date).days) <= window
                            if target_match or date_match:
                                is_done = True
                                done_date = log['date_of_activity'].isoformat()
                                break

                    if is_done:
                        status = 'done'
                    elif days_diff < -stage.window_days:
                        status = 'overdue'
                    elif abs(days_diff) <= stage.window_days:
                        status = 'due_now'
                    else:
                        status = 'upcoming'

                    suggestions.append({
                        'id': stage.id,
                        'occurrence_key': f'{stage.id}_{occurrence_day}',
                        'activity_name': stage.stage_name,
                        'day_after_planting': occurrence_day,
                        'recommendation': stage.recommendation,
                        'priority': stage.priority,
                        'window_days': stage.window_days,
                        'status': status,
                        'is_completed': is_done,
                        'done_date': done_date,
                        'days_diff': days_diff,
                    })

            suggestions.sort(key=lambda s: s['day_after_planting'])

        active_disasters = list(
            CropDisasterReport.objects.filter(
                monitoring_record=record, status='Active',
            ).order_by('-date_of_occurrence')
        )
        disaster_response = []
        for disaster in active_disasters:
            rules_qs = DisasterResponseRule.objects.filter(
                disaster_type=disaster.disaster_type,
            ).filter(
                Q(crop_type=record.crop_type) | Q(crop_type__isnull=True)
            ).order_by('-priority')

            rules_list = []
            for rule in rules_qs:
                is_done = any(
                    log.get('disaster_report_id') == disaster.id and
                    log.get('disaster_rule_id') == rule.id
                    for log in activity_logs
                )
                rules_list.append({
                    'rule_id': rule.id,
                    'disaster_type': rule.disaster_type,
                    'title': rule.title,
                    'action': rule.action,
                    'activity_name': rule.activity_name,
                    'recommendation': rule.recommendation,
                    'priority': rule.priority,
                    'is_done': is_done,
                })

            all_rules_done = len(rules_list) > 0 and all(r['is_done'] for r in rules_list)

            disaster_response.append({
                'disaster_id': disaster.id,
                'disaster_type': disaster.disaster_type,
                'date_of_occurrence': disaster.date_of_occurrence.isoformat(),
                'status': disaster.status,
                'is_total_loss': disaster.is_total_loss,
                'all_rules_done': all_rules_done,
                'rules': rules_list,
            })

        return Response({
            'days_elapsed': days_elapsed,
            'total_days': total_days,
            'is_total_loss': is_total_loss,
            'date_planted_is_estimated': record.date_planted_is_estimated,
            'suggestions': suggestions,
            'disaster_response': disaster_response,
        })


# ─── Module 2c: Yield / Harvest Performance Analysis (descriptive only) ──────
#
# Baseline is each crop's OWN planting-time estimate (estimated_yield_kg =
# area x yield-per-hectare, computed at planting). There is no historical
# dataset to compare against. Missed activities are surfaced as *possible*
# contributing factors — this module never claims causation.

YIELD_ANALYSIS_DISCLAIMER = (
    'This analysis is descriptive. Yield is affected by many factors including '
    'weather, pests, and soil; missed activities are shown as possible '
    'contributing factors, not proven causes.'
)


def _yield_analysis_queryset(request):
    qs = CropMonitoringRecord.objects.filter(
        status__in=[CropMonitoringRecord.Status.HARVESTED, CropMonitoringRecord.Status.TOTAL_LOSS],
    ).select_related('farmer', 'crop_type').prefetch_related(
        'activity_logs', 'harvest_records',
    )
    if request.user.role == 'CITIZEN':
        # Batch 11: a citizen only ever sees their own record-level yield
        # data, never anyone else's — no aggregate/barangay-comparison view
        # is exposed to this role at all (see YieldAnalysisSummaryView,
        # left IsAdminOrEvaluator-only). -1 is an unreachable pk, so an
        # unlinked account (or, Batch 12: an ORGANIZATION-linked one — crop
        # records are out of scope for that role entirely) safely gets zero
        # rows rather than everything. get_linked_farmer_id() (not
        # get_linked_record()) is what makes that type-safe: it returns
        # None for a non-FARMER linked_record_type instead of resolving to
        # some other table's row and letting its .id leak through.
        farmer_id = request.user.get_linked_farmer_id()
        qs = qs.filter(farmer_id=farmer_id if farmer_id else -1)
    barangay  = request.query_params.get('barangay', '')
    crop_type = request.query_params.get('crop_type', '')
    season    = request.query_params.get('season', '')
    year      = request.query_params.get('year', '')
    farmer    = request.query_params.get('farmer', '')
    if barangay:
        qs = qs.filter(farm_location_barangay__iexact=barangay)
    if crop_type:
        qs = qs.filter(crop_type_id=crop_type)
    if season:
        qs = qs.filter(season=season)
    if year:
        qs = qs.filter(year=year)
    if farmer:
        qs = qs.filter(farmer_id=farmer)
    return qs.order_by('-date_planted')


def _activity_completion(rec):
    """
    Expand this crop's CropActivityStage occurrences (application_days, same
    expansion the suggestions engine uses) and match each one against the
    crop's logged activities using the same rule CropActivitySuggestionsView
    uses: same activity name, and either the log's target_day matches the
    occurrence or its date falls within the stage's window_days of the
    scheduled due date.
    """
    from datetime import timedelta

    stages = CropActivityStage.objects.filter(crop_type_id=rec.crop_type_id)
    logs = list(rec.activity_logs.all())
    planted = rec.date_planted

    total = 0
    completed = 0
    missed_high = []
    breakdown = []

    for stage in stages:
        days_list = stage.application_days if stage.application_days else [stage.day_after_planting]
        for occurrence_day in days_list:
            total += 1
            due_date = planted + timedelta(days=occurrence_day) if planted else None
            is_done = False
            if due_date:
                window = stage.window_days
                for log in logs:
                    if log.activity_type != stage.stage_name:
                        continue
                    target_match = log.target_day is not None and log.target_day == occurrence_day
                    date_match = log.date_of_activity is not None and abs((log.date_of_activity - due_date).days) <= window
                    if target_match or date_match:
                        is_done = True
                        break
            if is_done:
                completed += 1
            elif stage.priority == CropActivityStage.Priority.HIGH:
                missed_high.append({'activity': stage.stage_name, 'scheduled_day': occurrence_day})
            breakdown.append({
                'activity': stage.stage_name,
                'scheduled_day': occurrence_day,
                'priority': stage.priority,
                'completed': is_done,
            })

    return total, completed, missed_high, breakdown


def _analyze_crop(rec):
    harvests = list(rec.harvest_records.all())
    actual_total_kg = sum((h.volume_kg for h in harvests if h.volume_kg is not None), Decimal('0'))
    estimated_kg = rec.estimated_yield_kg

    if estimated_kg is None:
        variance_kg = None
        variance_pct = None
    else:
        variance_kg = actual_total_kg - estimated_kg
        variance_pct = None if estimated_kg == 0 else float((variance_kg / estimated_kg) * Decimal('100'))

    total, completed, missed_high, breakdown = _activity_completion(rec)

    harvest_dates = sorted({
        (h.harvest_start_date or h.date_recorded.date()).isoformat()
        for h in harvests
    })

    if rec.farm_location_barangay:
        barangay = rec.farm_location_barangay
    elif rec.farmer:
        barangay = rec.farmer.barangay
    else:
        barangay = '—'

    return {
        'id': rec.id,
        'farmer': rec.farmer.full_name if rec.farmer else '—',
        'barangay': barangay or '—',
        'crop_type': rec.crop_type.name if rec.crop_type else '—',
        'variety': rec.variety_used or '—',
        # The citizen ANI card (frames 32-33) identifies each past crop by
        # area + barangay + harvest date. Area was the one part of that line
        # the payload did not carry.
        'area_planted_ha': float(rec.area_planted_ha) if rec.area_planted_ha is not None else None,
        'is_total_loss': rec.status == CropMonitoringRecord.Status.TOTAL_LOSS,
        'date_planted': rec.date_planted.isoformat() if rec.date_planted else None,
        'harvest_dates': harvest_dates,
        'estimated_kg': float(estimated_kg) if estimated_kg is not None else None,
        'actual_total_kg': float(actual_total_kg),
        'variance_kg': float(variance_kg) if variance_kg is not None else None,
        'variance_pct': round(variance_pct, 2) if variance_pct is not None else None,
        'activities_completed_count': completed,
        'activities_total_count': total,
        'missed_high_priority': missed_high,
        'activity_breakdown': breakdown,
    }


class YieldAnalysisView(APIView):
    # Batch 11: CITIZEN is allowed here too — _yield_analysis_queryset()
    # scopes the actual rows returned, ADMIN/EVALUATOR stay unrestricted.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        records = _yield_analysis_queryset(request)
        data = [_analyze_crop(rec) for rec in records]
        return Response({
            'count': len(data),
            'records': data,
            'disclaimer': YIELD_ANALYSIS_DISCLAIMER,
        })


class YieldAnalysisSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'crop_type'):
            group_by = 'barangay'

        records = list(_yield_analysis_queryset(request))
        analyzed = [_analyze_crop(rec) for rec in records]

        groups = {}
        for rec, a in zip(records, analyzed):
            key = (rec.crop_type.name if rec.crop_type else '—') if group_by == 'crop_type' else a['barangay']
            g = groups.setdefault(key, new_yield_group())
            accumulate_yield_group(g, a)

        group_results = []
        for key in sorted(groups.keys()):
            g = groups[key]
            group_results.append({
                'group': key,
                'harvested_crop_count': g['count'],
                'total_loss_count': g['total_loss_count'],
                'avg_estimated_kg': round(float(g['estimated_sum'] / g['estimated_n']), 2) if g['estimated_n'] else None,
                'avg_actual_kg': round(float(g['actual_sum'] / g['count']), 2) if g['count'] else None,
                'avg_variance_pct': round(g['variance_pct_sum'] / g['variance_pct_n'], 2) if g['variance_pct_n'] else None,
                'avg_activity_completion_pct': round(g['completion_pct_sum'] / g['completion_pct_n'], 2) if g['completion_pct_n'] else None,
            })

        overall_estimated  = [a['estimated_kg'] for a in analyzed if a['estimated_kg'] is not None]
        overall_variance   = [a['variance_pct'] for a in analyzed if a['variance_pct'] is not None and not a['is_total_loss']]
        overall_completion = [
            (a['activities_completed_count'] / a['activities_total_count']) * 100
            for a in analyzed if a['activities_total_count'] > 0
        ]
        overall = {
            'harvested_crop_count': len(analyzed),
            'total_loss_count': sum(1 for a in analyzed if a['is_total_loss']),
            'avg_estimated_kg': round(sum(overall_estimated) / len(overall_estimated), 2) if overall_estimated else None,
            'avg_actual_kg': round(sum(a['actual_total_kg'] for a in analyzed) / len(analyzed), 2) if analyzed else None,
            'avg_variance_pct': round(sum(overall_variance) / len(overall_variance), 2) if overall_variance else None,
            'avg_activity_completion_pct': round(sum(overall_completion) / len(overall_completion), 2) if overall_completion else None,
        }

        return Response({
            'group_by': group_by,
            'groups': group_results,
            'overall': overall,
            'disclaimer': YIELD_ANALYSIS_DISCLAIMER,
        })


# ─── Module 3: CropActivityLog ───────────────────────────────────────────────

def _crop_record_label(monitoring):
    crop_name = monitoring.crop_type.name if monitoring.crop_type_id else 'Crop'
    if monitoring.farmer_id:
        who = monitoring.farmer.full_name
    elif monitoring.farmers_organization_id:
        who = monitoring.farmers_organization.name
    else:
        who = 'Unknown farmer'
    barangay = monitoring.farm_location_barangay or (monitoring.farmer.barangay if monitoring.farmer_id else '')
    location = f'{who}, {barangay}' if barangay else who
    return f'{crop_name} — {location}'


class CropActivityLogListCreateView(generics.ListCreateAPIView):
    serializer_class = CropActivityLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    pagination_class = None

    def get_target_owner_id(self, request):
        monitoring_id = self.kwargs.get('monitoring_id')
        try:
            return CropMonitoringRecord.objects.get(pk=monitoring_id).farmer_id
        except CropMonitoringRecord.DoesNotExist:
            return None

    def get_queryset(self):
        monitoring_id = self.kwargs.get('monitoring_id')
        # -id tie-breaks -date_of_activity (a plain DateField — day
        # precision): logging several activities for the same real day is
        # routine, not an edge case, so ties here are common in practice.
        return CropActivityLog.objects.filter(
            monitoring_record_id=monitoring_id,
        ).order_by('-date_of_activity', '-id')

    def perform_create(self, serializer):
        monitoring_id = self.kwargs.get('monitoring_id')
        monitoring = CropMonitoringRecord.objects.get(pk=monitoring_id)
        assert_not_locked_by_other(self.request.user, 'crop', monitoring_id)
        target_day = serializer.validated_data.get('target_day')
        date_of_activity = serializer.validated_data.get('date_of_activity')
        is_late = False
        if target_day is not None and date_of_activity and monitoring.date_planted:
            from datetime import timedelta
            stage = CropActivityStage.objects.filter(
                crop_type=monitoring.crop_type,
                day_after_planting=target_day,
            ).first()
            window = stage.window_days if stage else 3
            deadline = monitoring.date_planted + timedelta(days=target_day + window)
            is_late = date_of_activity > deadline
        log = serializer.save(
            monitoring_record_id=monitoring_id,
            recorded_by=self.request.user,
            is_late=is_late,
        )
        if self.request.user.role != 'CITIZEN':
            notify_user(
                recipient=resolve_owner_user(
                    farmer_id=monitoring.farmer_id,
                    farmers_organization_id=monitoring.farmers_organization_id,
                ),
                actor=self.request.user,
                verb='logged an activity on',
                record_type='crop',
                record_id=monitoring_id,
                record_label=_crop_record_label(monitoring),
                detail=f'{log.activity_type} on {log.date_of_activity}',
            )


class CropActivityLogDeleteView(generics.DestroyAPIView):
    serializer_class = CropActivityLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropActivityLog.objects.all()


class CropActivityLogDetailView(generics.RetrieveUpdateAPIView):
    """
    Batch 11: no update endpoint existed for CropActivityLog before this —
    only list/create and delete (see CropActivityLogDeleteView above).
    Built fresh, available to ADMIN/EVALUATOR (unrestricted, matching every
    other model's existing edit access) and CITIZEN (own-record,
    own-entry only, via IsStaffOrOwnRecordCitizen) alike, rather than a
    citizen-only bespoke endpoint.
    """
    queryset = CropActivityLog.objects.select_related('monitoring_record')
    serializer_class = CropActivityLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_owner_id(self, obj):
        return obj.monitoring_record.farmer_id if obj.monitoring_record_id else None

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


# ─── CropDisasterReport ──────────────────────────────────────────────────────

class CropDisasterReportListCreateView(generics.ListCreateAPIView):
    """
    Evaluator-parity batch: CITIZEN may now report a disaster on their own
    monitoring record — the same IsStaffOrOwnRecordCitizen widening pattern
    used for activity logs and harvest records (Batch 11). get_target_owner_id
    resolves the parent CropMonitoringRecord the same way
    CropActivityLogListCreateView already does. Validation (disaster type,
    area-affected cap, Total Loss) is entirely serializer-side and untouched.
    """
    serializer_class = CropDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    pagination_class = None

    def get_target_owner_id(self, request):
        monitoring_id = self.kwargs.get('monitoring_id')
        try:
            return CropMonitoringRecord.objects.get(pk=monitoring_id).farmer_id
        except CropMonitoringRecord.DoesNotExist:
            return None

    def get_queryset(self):
        monitoring_id = self.kwargs.get('monitoring_id')
        return CropDisasterReport.objects.filter(
            monitoring_record_id=monitoring_id,
        ).order_by('-date_of_occurrence')

    def perform_create(self, serializer):
        monitoring_id = self.kwargs.get('monitoring_id')
        monitoring = CropMonitoringRecord.objects.get(pk=monitoring_id)
        assert_not_locked_by_other(self.request.user, 'crop', monitoring_id)
        disaster = serializer.save(
            monitoring_record_id=monitoring_id,
            reported_by=self.request.user,
        )
        notify_staff(
            actor=self.request.user,
            verb='reported a disaster on',
            record_type='crop',
            record_id=monitoring_id,
            record_label=_crop_record_label(monitoring),
            detail=disaster.disaster_type,
        )
        if self.request.user.role != 'CITIZEN':
            notify_user(
                recipient=resolve_owner_user(
                    farmer_id=monitoring.farmer_id,
                    farmers_organization_id=monitoring.farmers_organization_id,
                ),
                actor=self.request.user,
                verb='reported a disaster on',
                record_type='crop',
                record_id=monitoring_id,
                record_label=_crop_record_label(monitoring),
                detail=disaster.disaster_type,
            )


class CropDisasterResolveView(APIView):
    """
    Mark a disaster Recovered. Two paths:
      - All recommended response rules logged -> the usual nudge, no note required.
      - Anything else (incomplete, or zero rules — e.g. the crop recovered on
        its own with no intervention) -> a recovery_note is required so the
        gap is documented rather than silently closed. This used to hard-block
        resolution until every rule was logged, which left disasters stuck
        Active forever whenever nothing was actually done. Total Loss is
        terminal and can never be marked Recovered.

    Evaluator-parity batch: CITIZEN may resolve a disaster on their own
    record. This is a plain APIView (no queryset for DRF's object-level
    permission machinery to hook into), so the ownership check below is
    explicit rather than delegated to IsStaffOrOwnRecordCitizen's
    has_object_permission — same rule (own linked Farmer record only),
    just applied by hand. The recovery logic itself below is completely
    unchanged for every role.
    """
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]

    def post(self, request, pk):
        from datetime import date as _date
        disaster = get_object_or_404(CropDisasterReport, pk=pk)

        if request.user.role == 'CITIZEN':
            owner_farmer_id = disaster.monitoring_record.farmer_id if disaster.monitoring_record_id else None
            if request.user.linked_record_type != 'FARMER' or request.user.linked_record_id != owner_farmer_id:
                return Response({'detail': 'You do not have permission to perform this action.'}, status=403)

        if disaster.status == 'Recovered':
            return Response({'detail': 'Disaster is already marked as recovered.'}, status=400)
        if disaster.is_total_loss:
            return Response({'detail': 'A Total Loss record cannot be marked as recovered.'}, status=400)

        record = disaster.monitoring_record
        rules_qs = DisasterResponseRule.objects.filter(
            disaster_type=disaster.disaster_type,
        ).filter(
            Q(crop_type=record.crop_type) | Q(crop_type__isnull=True)
        )
        activity_logs = CropActivityLog.objects.filter(
            monitoring_record=record
        ).values('activity_type', 'date_of_activity', 'disaster_report_id', 'disaster_rule_id')

        all_done = True
        has_rules = False
        for rule in rules_qs:
            has_rules = True
            is_done = any(
                log.get('disaster_report_id') == disaster.id and
                log.get('disaster_rule_id') == rule.id
                for log in activity_logs
            )
            if not is_done:
                all_done = False
                break

        rules_complete = has_rules and all_done
        recovery_note = (request.data.get('recovery_note') or '').strip()
        if not rules_complete and not recovery_note:
            return Response(
                {'detail': 'A recovery note is required when not all recommended response rules have been completed.'},
                status=400,
            )

        disaster.status = 'Recovered'
        disaster.recovered_date = _date.today()
        disaster.recovered_by = request.user
        disaster.recovery_note = recovery_note
        disaster.save(update_fields=['status', 'recovered_date', 'recovered_by', 'recovery_note'])
        serializer = CropDisasterReportSerializer(disaster)
        return Response(serializer.data, status=200)


class CropDisasterReportDeleteView(generics.DestroyAPIView):
    queryset = CropDisasterReport.objects.all()
    permission_classes = [IsAuthenticated, IsAdmin]

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete disaster reports.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


# ─── LaborOperationLog ──────────────────────────────────────────────────────

class LaborOperationLogListCreateView(generics.ListCreateAPIView):
    serializer_class = LaborOperationLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        monitoring_id = self.kwargs.get('monitoring_id')
        return LaborOperationLog.objects.filter(
            monitoring_record_id=monitoring_id,
        ).order_by('-date')

    def perform_create(self, serializer):
        monitoring_id = self.kwargs.get('monitoring_id')
        serializer.save(
            monitoring_record_id=monitoring_id,
            logged_by=self.request.user,
        )


class LaborOperationLogDeleteView(generics.DestroyAPIView):
    serializer_class = LaborOperationLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = LaborOperationLog.objects.all()


# ─── FarmInputLog ───────────────────────────────────────────────────────────

class FarmInputLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmInputLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        monitoring_id = self.kwargs.get('monitoring_id')
        return FarmInputLog.objects.filter(
            monitoring_record_id=monitoring_id,
        ).order_by('-application_date')

    def perform_create(self, serializer):
        serializer.save(
            monitoring_record_id=self.kwargs.get('monitoring_id'),
            recorded_by=self.request.user,
        )


class FarmInputLogDeleteView(generics.DestroyAPIView):
    serializer_class = FarmInputLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmInputLog.objects.all()


# ─── PestDiseaseReport ───────────────────────────────────────────────────────

class PestDiseaseReportListCreateView(generics.ListCreateAPIView):
    serializer_class = PestDiseaseReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        monitoring_id = self.kwargs.get('monitoring_id')
        return PestDiseaseReport.objects.filter(
            monitoring_record_id=monitoring_id,
        ).order_by('-report_date')

    def perform_create(self, serializer):
        serializer.save(
            monitoring_record_id=self.kwargs.get('monitoring_id'),
            recorded_by=self.request.user,
        )


class PestDiseaseReportDeleteView(generics.DestroyAPIView):
    serializer_class = PestDiseaseReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = PestDiseaseReport.objects.all()


# ─── Module 5: Monitoring Analytics ──────────────────────────────────────────

class SeasonalVarianceView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        year = request.query_params.get('year')
        qs = CropMonitoringRecord.objects.filter(
            status=CropMonitoringRecord.Status.HARVESTED,
            actual_yield_kg__isnull=False,
            estimated_yield_kg__isnull=False,
        )
        if year:
            qs = qs.filter(year=year)
        data = (
            qs.values('season', 'crop_type__name')
            .annotate(
                total_estimated=Sum('estimated_yield_kg'),
                total_actual=Sum('actual_yield_kg'),
            )
            .order_by('season', 'crop_type__name')
        )
        return Response(list(data))


class YearOnYearVarianceView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        crop_type = request.query_params.get('crop_type')
        qs = CropMonitoringRecord.objects.filter(
            status=CropMonitoringRecord.Status.HARVESTED,
            actual_yield_kg__isnull=False,
            estimated_yield_kg__isnull=False,
        )
        if crop_type:
            qs = qs.filter(crop_type__name__icontains=crop_type)
        data = (
            qs.values('year', 'crop_type__name')
            .annotate(
                total_estimated=Sum('estimated_yield_kg'),
                total_actual=Sum('actual_yield_kg'),
            )
            .order_by('year', 'crop_type__name')
        )
        return Response(list(data))


# ─── Module 2: BarangayCropSummary ───────────────────────────────────────────

class BarangayCropSummaryListCreateView(generics.ListCreateAPIView):
    serializer_class = BarangayCropSummarySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = BarangayCropSummary.objects.select_related(
            'recorded_by', 'causal_damage_report',
        ).order_by('barangay', 'crop_name')
        p = self.request.query_params
        if p.get('barangay'):
            qs = qs.filter(barangay__iexact=p['barangay'])
        if p.get('crop_name'):
            qs = qs.filter(crop_name__iexact=p['crop_name'])
        if p.get('season'):
            qs = qs.filter(season=p['season'])
        if p.get('year'):
            qs = qs.filter(year=p['year'])
        if p.get('alert_level'):
            qs = qs.filter(alert_level=p['alert_level'])
        if p.get('submission_status'):
            qs = qs.filter(submission_status=p['submission_status'])
        if p.get('stage'):
            qs = qs.filter(current_growth_stage=p['stage'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class BarangayCropSummaryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BarangayCropSummarySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = BarangayCropSummary.objects.select_related('recorded_by', 'causal_damage_report')
    http_method_names = ['get', 'patch', 'delete']


class BarangayCropSummaryLinkRecordsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk):
        summary = BarangayCropSummary.objects.get(pk=pk)
        ids = request.data.get('monitoring_record_ids', [])
        records = CropMonitoringRecord.objects.filter(pk__in=ids)
        summary.linked_monitoring_records.add(*records)
        serializer = BarangayCropSummarySerializer(summary)
        return Response(serializer.data)


ALERT_ORDER = {'None': 0, 'Low': 1, 'Medium': 2, 'High': 3}
STATUS_ORDER = {'Draft': 0, 'Submitted': 1, 'Verified': 2}


class MunicipalityCropDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        import datetime
        today = datetime.date.today()
        month = today.month
        default_season = 'Wet' if 6 <= month <= 11 else 'Dry'
        season = request.query_params.get('season', default_season)
        year = int(request.query_params.get('year', today.year))

        qs = BarangayCropSummary.objects.filter(season=season, year=year)

        # Overall totals
        agg = qs.aggregate(
            total_area=Sum('area_planted_ha'),
            total_estimated=Sum('estimated_yield_kg'),
            total_actual=Sum('actual_yield_kg'),
        )
        total_area = agg['total_area'] or Decimal('0')
        total_est = agg['total_estimated'] or Decimal('0')
        total_act = agg['total_actual']

        overall_variance_pct = None
        if total_act is not None and total_est and total_est != 0:
            overall_variance_pct = float(((total_act - total_est) / total_est) * 100)

        # Stage distribution per crop
        stage_qs = qs.values('crop_name', 'current_growth_stage').annotate(cnt=Count('id'))
        stage_by_crop = defaultdict(dict)
        for row in stage_qs:
            if row['current_growth_stage']:
                stage_by_crop[row['crop_name']][row['current_growth_stage']] = row['cnt']

        # Alert count per crop
        alert_qs = qs.filter(alert_level__in=['Medium', 'High']).values('crop_name').annotate(
            cnt=Count('id')
        )
        alert_by_crop = {row['crop_name']: row['cnt'] for row in alert_qs}

        # By crop
        crop_qs = qs.values('crop_name').annotate(
            total_area_ha=Sum('area_planted_ha'),
            barangay_count=Count('barangay', distinct=True),
            estimated_yield_kg=Sum('estimated_yield_kg'),
            actual_yield_kg=Sum('actual_yield_kg'),
        ).order_by('-total_area_ha')

        by_crop = []
        for row in crop_qs:
            cn = row['crop_name']
            est = row['estimated_yield_kg'] or Decimal('0')
            act = row['actual_yield_kg']
            var_pct = None
            if act is not None and est and est != 0:
                var_pct = float(((act - est) / est) * 100)
            by_crop.append({
                'crop_name': cn,
                'total_area_ha': float(row['total_area_ha'] or 0),
                'barangay_count': row['barangay_count'],
                'estimated_yield_kg': float(est),
                'actual_yield_kg': float(act) if act is not None else None,
                'variance_pct': var_pct,
                'alert_count': alert_by_crop.get(cn, 0),
                'stage_distribution': stage_by_crop.get(cn, {}),
            })

        # By barangay — Python-level to get max alert_level
        all_records = list(qs.values(
            'barangay', 'alert_level', 'submission_status',
            'area_planted_ha', 'crop_name', 'observed_problems',
        ))
        barangay_map = {}
        for rec in all_records:
            b = rec['barangay']
            if b not in barangay_map:
                barangay_map[b] = {
                    'barangay': b,
                    'crops_reported': 0,
                    'total_area_ha': Decimal('0'),
                    'alert_level': 'None',
                    'submission_status': 'Draft',
                    'has_observed_problems': False,
                }
            d = barangay_map[b]
            d['crops_reported'] += 1
            d['total_area_ha'] += (rec['area_planted_ha'] or Decimal('0'))
            if ALERT_ORDER.get(rec['alert_level'], 0) > ALERT_ORDER.get(d['alert_level'], 0):
                d['alert_level'] = rec['alert_level']
            if STATUS_ORDER.get(rec['submission_status'], 0) > STATUS_ORDER.get(d['submission_status'], 0):
                d['submission_status'] = rec['submission_status']
            if rec['observed_problems']:
                d['has_observed_problems'] = True

        for d in barangay_map.values():
            d['total_area_ha'] = float(d['total_area_ha'])

        by_barangay = sorted(barangay_map.values(), key=lambda x: x['barangay'])

        # Submission tracker
        all_barangay_names = [b[0] for b in BARANGAY_CHOICES]
        reported = set(barangay_map.keys())
        not_submitted_list = [b for b in all_barangay_names if b not in reported]

        submission_tracker = {
            'total_barangays': len(all_barangay_names),
            'submitted': len(reported),
            'not_submitted': len(not_submitted_list),
            'not_submitted_list': not_submitted_list,
        }

        # Alerts list
        alerts = list(
            qs.filter(alert_level__in=['Medium', 'High'])
            .values('barangay', 'crop_name', 'alert_level', 'observed_problems')
            .order_by('-alert_level')
        )

        return Response({
            'current_season': season,
            'current_year': year,
            'total_area_planted_ha': float(total_area),
            'total_estimated_yield_kg': float(total_est),
            'total_actual_yield_kg': float(total_act) if total_act is not None else None,
            'overall_variance_pct': overall_variance_pct,
            'by_crop': by_crop,
            'by_barangay': by_barangay,
            'submission_tracker': submission_tracker,
            'alerts': alerts,
        })


class CropHistoricalTimelineView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        crop_name = request.query_params.get('crop_name')
        barangay = request.query_params.get('barangay')

        if not crop_name:
            return Response({'detail': 'crop_name is required.'}, status=400)

        qs = BarangayCropSummary.objects.filter(crop_name__iexact=crop_name)
        if barangay:
            qs = qs.filter(barangay__iexact=barangay)

        # Group by season + year
        grouped = qs.values('season', 'year').annotate(
            total_area_ha=Sum('area_planted_ha'),
            total_estimated_yield_kg=Sum('estimated_yield_kg'),
            total_actual_yield_kg=Sum('actual_yield_kg'),
            barangay_count=Count('barangay', distinct=True),
        ).order_by('year', 'season')

        # Primary causal factor per season+year (most common)
        causal_qs = qs.exclude(causal_factor='').exclude(causal_factor='None').values(
            'season', 'year', 'causal_factor'
        ).annotate(cnt=Count('id')).order_by('year', 'season', '-cnt')

        causal_map = {}
        for row in causal_qs:
            key = (row['season'], row['year'])
            if key not in causal_map:
                causal_map[key] = row['causal_factor']

        timeline = []
        for row in grouped:
            key = (row['season'], row['year'])
            est = row['total_estimated_yield_kg']
            act = row['total_actual_yield_kg']
            var_pct = None
            if act is not None and est and est != 0:
                var_pct = float(((Decimal(str(act)) - Decimal(str(est))) / Decimal(str(est))) * 100)
            timeline.append({
                'season': row['season'],
                'year': row['year'],
                'total_area_ha': float(row['total_area_ha'] or 0),
                'total_estimated_yield_kg': float(est) if est is not None else None,
                'total_actual_yield_kg': float(act) if act is not None else None,
                'variance_pct': var_pct,
                'primary_causal_factor': causal_map.get(key, 'None'),
                'barangay_count': row['barangay_count'],
            })

        return Response({
            'crop_name': crop_name,
            'scope': barangay if barangay else 'Municipality-wide',
            'timeline': timeline,
        })


# ─── Module 3: Submission Status Tracker ─────────────────────────────────────

class BarangaySubmissionStatusView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        season = request.query_params.get('season')
        year = request.query_params.get('year')
        if not season or not year:
            return Response({'detail': 'season and year are required.'}, status=400)

        all_barangays = [b[0] for b in BARANGAY_CHOICES]
        records = BarangayCropSummary.objects.filter(
            season=season, year=year,
        ).values('barangay', 'crop_name', 'submission_status')

        by_barangay = defaultdict(list)
        for rec in records:
            by_barangay[rec['barangay']].append(rec)

        result = []
        submitted = 0
        not_submitted = 0
        verified = 0

        for b in all_barangays:
            if b in by_barangay:
                recs = by_barangay[b]
                crops = [r['crop_name'] for r in recs]
                statuses = [r['submission_status'] for r in recs]
                if all(s == 'Verified' for s in statuses):
                    status = 'Verified'
                    verified += 1
                elif any(s in ('Submitted', 'Verified') for s in statuses):
                    status = 'Submitted'
                else:
                    status = 'Draft'
                submitted += 1
                result.append({
                    'barangay': b,
                    'status': status,
                    'crops_reported': crops,
                    'record_count': len(recs),
                })
            else:
                not_submitted += 1
                result.append({
                    'barangay': b,
                    'status': 'Not Submitted',
                    'crops_reported': [],
                    'record_count': 0,
                })

        return Response({
            'season': season,
            'year': int(year),
            'summary': {
                'submitted': submitted,
                'not_submitted': not_submitted,
                'verified': verified,
            },
            'barangays': result,
        })


# ─── Crop Category / Subcategory ─────────────────────────────────────────────

class CropCategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CropCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None
    # Newest-first — see CropTypeListView's own comment.
    queryset = CropCategory.objects.order_by('-id')

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class CropCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CropCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropCategory.objects.all()


class CropSubcategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = CropSubcategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        # Newest-first — see CropTypeListView's own comment.
        qs = CropSubcategory.objects.select_related('category').order_by('-id')
        category_id = self.request.query_params.get('category_id')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class CropSubcategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CropSubcategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropSubcategory.objects.select_related('category').all()


# ─── Seed Source ──────────────────────────────────────────────────────────────

class SeedSourceListCreateView(generics.ListCreateAPIView):
    serializer_class = SeedSourceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None
    queryset = SeedSource.objects.order_by('-id')


class SeedSourceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SeedSourceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = SeedSource.objects.all()


# ─── Activity Type ────────────────────────────────────────────────────────────

class ActivityTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = ActivityTypeSerializer
    pagination_class = None
    # Newest-first — see CropTypeListView's own comment.
    queryset = ActivityType.objects.all().order_by('-id')

    def get_permissions(self):
        # GET is read by every activity-logging surface, staff and citizen
        # alike (CropMonitoringPage, CitizenFarmerActivityScreen,
        # CitizenActivityLogModal) — same shape as
        # CropMonitoringListCreateView's own GET/POST split. Only
        # admins/evaluators may add a new type.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]


class ActivityTypeDetailView(generics.RetrieveUpdateAPIView):
    """Toggle-not-delete, same as CropTypeDetailView — see ActivityType's
    own model docstring for why."""
    serializer_class = ActivityTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = ActivityType.objects.all()


# ─── Crop Variety ─────────────────────────────────────────────────────────────

class CropVarietyListCreateView(generics.ListCreateAPIView):
    serializer_class = CropVarietySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = CropVariety.objects.select_related('crop_type').order_by('-id')
        crop_type_id = self.request.query_params.get('crop_type')
        if crop_type_id:
            qs = qs.filter(Q(crop_type_id=crop_type_id) | Q(crop_type__isnull=True))
            qs = qs.filter(is_active=True)
        return qs


class CropVarietyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CropVarietySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropVariety.objects.select_related('crop_type').all()


# ─── Crop Input Type ────────────────────────────────────────────────────────
# Mirrors fisheries' FeedTypeListCreateView/FeedTypeDetailView exactly.

class CropInputTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = CropInputTypeSerializer
    pagination_class = None

    def get_permissions(self):
        # GET widened to any authenticated user — CropInputType is shared
        # reference data with no per-record owner, needed so a citizen's
        # activity-log form can offer a crop-type-scoped input recommendation.
        # Write access (POST/PATCH/DELETE) stays staff-only.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        # Newest-first — see CropTypeListView's own comment.
        qs = CropInputType.objects.order_by('-id')
        crop_type_id = self.request.query_params.get('crop_type')
        if crop_type_id:
            qs = qs.filter(crop_types__id=crop_type_id)
        return qs


class CropInputTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CropInputTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropInputType.objects.all()


# ─── CropRemark ──────────────────────────────────────────────────────────────

class CropRemarkListCreateView(generics.ListCreateAPIView):
    serializer_class = CropRemarkSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = CropRemark.objects.select_related('crop_type', 'recorded_by').order_by('-date_recorded')
        crop_type_id = self.request.query_params.get('crop_type')
        if crop_type_id:
            qs = qs.filter(crop_type_id=crop_type_id)
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class CropRemarkDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = CropRemarkSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropRemark.objects.select_related('crop_type', 'recorded_by')
    http_method_names = ['get', 'patch', 'delete']


class MonitoringRemarkListCreateView(generics.ListCreateAPIView):
    serializer_class = MonitoringRemarkSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return CropRemark.objects.filter(
            monitoring_record_id=self.kwargs['monitoring_id']
        ).select_related('recorded_by').order_by('-date_recorded')

    def perform_create(self, serializer):
        from django.shortcuts import get_object_or_404
        monitoring_record = get_object_or_404(CropMonitoringRecord, pk=self.kwargs['monitoring_id'])
        serializer.save(
            recorded_by=self.request.user,
            monitoring_record=monitoring_record,
            crop_type=monitoring_record.crop_type,
        )


# ─── CropActivityStage CRUD ──────────────────────────────────────────────────

class CropActivityStageListCreateView(generics.ListCreateAPIView):
    serializer_class = CropActivityStageSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return CropActivityStage.objects.filter(
            crop_type_id=self.kwargs['crop_type_id']
        ).order_by('day_after_planting')

    def perform_create(self, serializer):
        serializer.save(crop_type_id=self.kwargs['crop_type_id'])


class CropActivityStageDeleteView(generics.DestroyAPIView):
    serializer_class = CropActivityStageSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = CropActivityStage.objects.all()


class ActivityStageNameSuggestionsView(APIView):
    """Distinct CropActivityStage.stage_name values used across EVERY crop
    type, each with one representative recommendation — powers the Add
    Activity combobox on Crop Settings (CropOptionPage.jsx's
    SuggestionsSection), so staff adding e.g. "Land Preparation" to a new
    crop can pick the name already used for 19 other crops instead of
    retyping it, and get a starting-point recommendation to edit rather
    than write from scratch. Real data (2026-09-20): 200 stages across 20
    crop types, "Fertilizer Application" alone repeated 26 times."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        # Newest row per name wins (order_by('-id') + setdefault keeps the
        # FIRST one seen) — most likely to reflect current phrasing/practice
        # for that activity, not necessarily accurate for every crop's own
        # rates/technique (recommendation stays freely editable after
        # autofill precisely because it won't always fit as-is).
        seen = {}
        rows = CropActivityStage.objects.order_by('-id').values('stage_name', 'recommendation')
        for row in rows:
            seen.setdefault(row['stage_name'], row['recommendation'])
        data = [{'stage_name': name, 'recommendation': rec} for name, rec in sorted(seen.items())]
        return Response(data)
