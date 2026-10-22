import json
from collections import defaultdict
from datetime import timedelta
from decimal import Decimal
from io import BytesIO

from django.core.files.base import ContentFile
from django.db import transaction
from django.db.models import Avg, Case, CharField, Count, Exists, F, IntegerField, OuterRef, Prefetch, Q, Sum, Value, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, status as drf_status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import (
    IsAdmin, IsAdminOrEvaluator, IsStaffOrFarmer, IsStaffOrFarmerReadOnly, IsStaffOrOwnRecordCitizen, STAFF_ROLES,
    farmer_scope, scope_to_farmer,
)
from core.constants import BARANGAY_CHOICES
from core.locking import assert_not_locked_by_other
from core.notifications import notify_staff, notify_user, resolve_owner_user
from core.utils import accumulate_yield_group, filter_people_search, is_plain_int, new_yield_group
from associations.models import FarmersOrganizationMember
from farmers.models import FarmParcel, Farmer
from fisheries.models import Fisherfolk

from core.photos import discard_uploaded_files, validated_photos
from .duplicates import find_active_duplicates, same_place
from .naming import normalize_name
from .schedule_rules import done_date as step_done_date, is_setup_stage, step_status
from .dashboard_activity import (
    active_disaster_rows, barangay_rows, crop_activity_status,
    crop_yield_variance, fisheries_activity_status, fisheries_yield_variance, not_received_count, sector_summary,
)
from .models import (
    ActivityType,
    BarangayCropSummary,
    CropActivityLog, CropActivityStage, CropCategory, CropDisasterReport, CropDisasterReportPhoto,
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes

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
                # how early or late a harvest is would be measured against a
                # made-up start date, so this blocks outright. Same pattern as
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
                # No "half the growing time" block any more: a crop can be harvested early. HarvestRecordSerializer
                # requires a reason when the harvest is more than 7 days before (or after) the expected date.
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes
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
            'fisheries_yield_variance': fisheries_yield_variance(),
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
    permission_classes = [IsAuthenticated, IsStaffOrFarmerReadOnly]   # reference data: a farmer may read
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

def _filter_monitoring_queryset(qs, request):
    """The access rule and every filter of the Crop Monitoring list, shared by the record list and by the grouped view
    (CropMonitoringGroupsView), so a group's count is always the number of records its list shows."""
    if request.user.role == 'CITIZEN':
        farmer_id = request.user.get_linked_farmer_id()
        qs = qs.filter(farmer_id=farmer_id if farmer_id else -1)
    params = request.query_params
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
    # The page splits "Near Harvest" by how far the expected date is (the same days the page used to compute itself):
    # Due Harvest = still ahead, Ready for Harvest = today or up to 7 days past, Overdue = more than 7 days past.
    display = params.get('display_status')
    if display in ('Due Harvest', 'Ready for Harvest', 'Overdue'):
        today = timezone.localdate()
        qs = qs.filter(status=CropMonitoringRecord.Status.NEAR_HARVEST)
        if display == 'Due Harvest':
            qs = qs.filter(expected_harvest_date__gt=today)
        elif display == 'Ready for Harvest':
            qs = qs.filter(expected_harvest_date__lte=today, expected_harvest_date__gte=today - timedelta(days=7))
        else:
            qs = qs.filter(expected_harvest_date__lt=today - timedelta(days=7))
    if params.get('farm_parcel'):
        qs = qs.filter(farm_parcel_id=params['farm_parcel'])
    if params.get('farmer'):
        qs = qs.filter(farmer_id=params['farmer'])
    if params.get('farmers_organization'):
        qs = qs.filter(farmers_organization_id=params['farmers_organization'])
    # Typed in the list's search bar: the farmer (name in any order, or an
    # RSBSA number as typed or without its dashes), the crop, the
    # organization or the barangay — searched across ALL records, not just
    # the page currently on screen.
    return filter_people_search(
        qs, params.get('search'),
        name_fields=['farmer__first_name', 'farmer__middle_name', 'farmer__last_name'],
        id_fields=['farmer__rsbsa_number'],
        other_fields=['crop_type__name', 'farmers_organization__name', 'farm_location_barangay'],
    )


class CropMonitoringGroupsView(APIView):
    """GET ?group_by=crop|farmer plus the list's own filters: the Crop Monitoring table grouped, paged ten groups at a
    time. A group is one crop type, or one farmer (an organization's own crops form a group per organization); it carries
    how many records it holds, their total planted area and how many are near harvest. Opening a group is the ordinary
    list scoped to it (?crop_type=, ?farmer=, ?farmers_organization=), so counts and rows always agree."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        group_by = request.query_params.get('group_by')
        if group_by not in ('crop', 'farmer'):
            raise ValidationError({'group_by': 'Use group_by=crop or group_by=farmer.'})
        qs = _filter_monitoring_queryset(CropMonitoringRecord.objects.all(), request)
        totals = dict(
            count=Count('id'), area=Sum('area_planted_ha'),
            near_harvest=Count('id', filter=Q(status=CropMonitoringRecord.Status.NEAR_HARVEST)),
        )
        if group_by == 'crop':
            rows = qs.values('crop_type_id', 'crop_type__name').annotate(**totals).order_by('crop_type__name', 'crop_type_id')
        else:
            rows = qs.values(
                'farmer_id', 'farmers_organization_id', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name',
                'farmer__barangay', 'farmers_organization__name', 'farmers_organization__barangay',
            ).annotate(**totals).order_by('farmer__last_name', 'farmer__first_name', 'farmers_organization__name', 'farmer_id', 'farmers_organization_id')
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response([self._shape(group_by, row) for row in page])

    @staticmethod
    def _shape(group_by, row):
        shared = {'count': row['count'], 'area_planted_ha': float(row['area'] or 0), 'near_harvest': row['near_harvest']}
        if group_by == 'crop':
            return {'key': f"c{row['crop_type_id']}", 'id': row['crop_type_id'], 'name': row['crop_type__name'], 'barangay': '', **shared}
        if row['farmer_id']:
            name = ' '.join(n for n in (row['farmer__first_name'], row['farmer__middle_name'], row['farmer__last_name']) if n)
            return {'key': f"f{row['farmer_id']}", 'id': row['farmer_id'], 'name': name, 'barangay': row['farmer__barangay'] or '', **shared}
        if row['farmers_organization_id']:
            return {'key': f"o{row['farmers_organization_id']}", 'id': row['farmers_organization_id'],
                    'name': row['farmers_organization__name'], 'barangay': row['farmers_organization__barangay'] or '', **shared}
        return {'key': 'none', 'id': None, 'name': 'Not linked to a farmer', 'barangay': '', **shared}


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
        ).prefetch_related(
            'activity_logs', 'labor_logs', 'harvest_records', 'disaster_reports',
            Prefetch('farmer__farmer_organizations', queryset=FarmersOrganizationMember.objects.select_related('organization')),
        ).order_by('-date_recorded', '-id')
        qs = qs.annotate(
            has_disaster=Exists(
                CropDisasterReport.objects.filter(
                    monitoring_record=OuterRef('pk'), status='Active',
                )
            )
        )
        qs = _filter_monitoring_queryset(qs, self.request)
        params = self.request.query_params
        # Forecast lists ask for the soonest expected harvest first; any other
        # value is ignored (the default newest-first order stays).
        ordering = params.get('ordering')
        if ordering in ('expected_harvest_date', '-expected_harvest_date'):
            harvest = F('expected_harvest_date')
            qs = qs.order_by(
                harvest.desc(nulls_last=True) if ordering.startswith('-') else harvest.asc(nulls_last=True),
                '-id',
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

        # Every row passed on its own, but two rows of this same form can still be the same crop in the same
        # place (the database check cannot see them: nothing is saved yet). Later rows are refused.
        batch_errors = [{} for _ in item_serializers]
        for i, current in enumerate(item_serializers):
            row = current.validated_data
            for j in range(i):
                earlier = item_serializers[j].validated_data
                if (
                    row.get('farmer') and earlier.get('farmer') and row['farmer'].id == earlier['farmer'].id
                    and row['crop_type'].id == earlier['crop_type'].id
                    and normalize_name(row.get('variety_used')) == normalize_name(earlier.get('variety_used'))
                    and same_place(
                        row['farm_parcel'].id if row.get('farm_parcel') else None, row.get('farm_location_barangay', ''),
                        earlier['farm_parcel'].id if earlier.get('farm_parcel') else None,
                        earlier.get('farm_location_barangay', ''),
                    )
                ):
                    batch_errors[i] = {'crop_type': [f'This record duplicates row {j + 1} of this form.']}
                    break
        if any(batch_errors):
            return Response({'errors': batch_errors}, status=drf_status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            created = [s.save(recorded_by=request.user) for s in item_serializers]

        return Response(CropMonitoringRecordSerializer(created, many=True).data, status=drf_status.HTTP_201_CREATED)


class CropMonitoringDetailView(generics.RetrieveUpdateDestroyAPIView):
    # A farmer account may READ its own crop record (the Crop Monitoring page's details window); changing or
    # deleting a record stays staff-only.
    permission_classes = [IsAuthenticated, IsStaffOrFarmer]
    farmer_blocked_methods = ('PUT', 'PATCH', 'DELETE')

    def get_queryset(self):
        return scope_to_farmer(
            CropMonitoringRecord.objects.select_related(
                'farm_parcel', 'farm_parcel__farmer', 'crop_type',
            ).prefetch_related('activity_logs', 'input_logs', 'pest_disease_reports', 'labor_logs'),
            self.request.user, 'farmer_id',
        )

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
        params = request.query_params
        farmer_id, crop_type_id = params.get('farmer'), params.get('crop_type')
        if not is_plain_int(farmer_id) or not is_plain_int(crop_type_id):
            return Response({'duplicates': []})
        parcel = params.get('parcel')
        exclude = params.get('exclude')
        found = find_active_duplicates(
            farmer_id=int(farmer_id), crop_type_id=int(crop_type_id), variety=params.get('variety', ''),
            farm_parcel_id=int(parcel) if is_plain_int(parcel) else None,
            barangay=params.get('barangay', ''),
            exclude_id=int(exclude) if is_plain_int(exclude) else None,
        )[:5]
        results = [
            {
                'id':           r.id,
                'crop_type':    r.crop_type.name if r.crop_type else '',
                'variety_used': r.variety_used,
                'date_planted': str(r.date_planted) if r.date_planted else None,
                'area_planted_ha': str(r.area_planted_ha),
                'status':       r.status,
            }
            for r in found
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes

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

        log_rows = [(l['activity_type'], l['date_of_activity'], l['target_day']) for l in activity_logs]
        suggestions = []
        # An estimated date_planted (see the field's own comment) has no real
        # relationship to when activities are actually due — every
        # occurrence_day would be measured against a made-up start date, which
        # is pure noise, not a suggestion. Suppressed entirely rather than
        # shown-but-wrong.
        if not is_total_loss and not record.date_planted_is_estimated:
            for stage in stages:
                days_list = stage.application_days if stage.application_days else [stage.day_after_planting]
                setup = is_setup_stage(stage)   # Land Preparation / Planting style: done once (see schedule_rules)
                for occurrence_day in days_list:
                    due_date = planted + timedelta(days=occurrence_day) if planted else None
                    days_diff = occurrence_day - days_elapsed

                    done_on = step_done_date(stage.stage_name, occurrence_day, due_date, stage.window_days, log_rows, setup)
                    is_done = done_on is not None
                    done_date = done_on.isoformat() if done_on else None
                    status = step_status(occurrence_day, days_elapsed, stage.window_days, is_done, setup)

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
                'can_recover': disaster.can_recover,
                'recovery_block_reason': disaster.recovery_block_reason if disaster.status == 'Active' else None,
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
    ).select_related('farmer', 'crop_type').only(
        # Only what _analyze_crop / _activity_completion read. A full row is ~30 columns; over the remote
        # database fetching them for every harvested crop took ~13 s against ~3 s for these.
        'id', 'status', 'farm_location_barangay', 'variety_used', 'area_planted_ha', 'date_planted',
        'estimated_yield_kg', 'farmer_id', 'crop_type_id',
        'farmer__id', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name', 'farmer__barangay',
        'crop_type__id', 'crop_type__name',
    ).prefetch_related(
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
    return qs.order_by('-date_planted', 'id')


def _stages_by_crop(records):
    """{crop_type_id: [CropActivityStage, ...]} for every crop in `records`, in 2 queries at most.

    _activity_completion used to query the stages once per record, which over the remote database made
    the yield analysis take minutes for a few thousand harvested crops."""
    crop_ids = {r.crop_type_id for r in records if r.crop_type_id}
    grouped = {cid: [] for cid in crop_ids}
    if crop_ids:
        for stage in CropActivityStage.objects.filter(crop_type_id__in=crop_ids).order_by('day_after_planting', 'id'):
            grouped[stage.crop_type_id].append(stage)
    return grouped


def _activity_completion(rec, stages_by_crop=None, build_breakdown=True):
    """
    Expand this crop's CropActivityStage occurrences (application_days, same
    expansion the suggestions engine uses) and match each one against the
    crop's logged activities using the same rule CropActivitySuggestionsView
    uses: same activity name, and either the log's target_day matches the
    occurrence or its date falls within the stage's window_days of the
    scheduled due date.
    """
    from datetime import timedelta

    if stages_by_crop is not None:
        stages = stages_by_crop.get(rec.crop_type_id, [])
    else:
        stages = CropActivityStage.objects.filter(crop_type_id=rec.crop_type_id).order_by('day_after_planting', 'id')
    log_rows = [(log.activity_type, log.date_of_activity, log.target_day) for log in rec.activity_logs.all()]
    planted = rec.date_planted

    total = 0
    completed = 0
    missed_high = []
    breakdown = []

    for stage in stages:
        days_list = stage.application_days if stage.application_days else [stage.day_after_planting]
        setup = is_setup_stage(stage)
        for occurrence_day in days_list:
            total += 1
            due_date = planted + timedelta(days=occurrence_day) if planted else None
            is_done = step_done_date(stage.stage_name, occurrence_day, due_date, stage.window_days, log_rows, setup) is not None
            if is_done:
                completed += 1
            elif stage.priority == CropActivityStage.Priority.HIGH:
                missed_high.append({'activity': stage.stage_name, 'scheduled_day': occurrence_day})
            if build_breakdown:
                breakdown.append({
                    'activity': stage.stage_name,
                    'scheduled_day': occurrence_day,
                    'priority': stage.priority,
                    'completed': is_done,
                })

    return total, completed, missed_high, breakdown


def _analyze_crop(rec, stages_by_crop=None, light=False):
    """`light`: skip the per-activity breakdown (the aggregate summary only needs the counts)."""
    harvests = list(rec.harvest_records.all())
    actual_total_kg = sum((h.volume_kg for h in harvests if h.volume_kg is not None), Decimal('0'))
    estimated_kg = rec.estimated_yield_kg

    if estimated_kg is None:
        variance_kg = None
        variance_pct = None
    else:
        variance_kg = actual_total_kg - estimated_kg
        variance_pct = None if estimated_kg == 0 else float((variance_kg / estimated_kg) * Decimal('100'))

    total, completed, missed_high, breakdown = _activity_completion(rec, stages_by_crop, build_breakdown=not light)

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




def _chunked(iterable, size):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _page_params(request, default_size=25, max_size=100):
    """(page, page_size) when the caller asked for one page of the yield analysis, else None (everything, as before)."""
    if 'page' not in request.query_params:
        return None
    try:
        page = max(1, int(request.query_params.get('page') or 1))
    except ValueError:
        page = 1
    try:
        size = min(max_size, max(1, int(request.query_params.get('page_size') or default_size)))
    except ValueError:
        size = default_size
    return page, size


def _yield_search(qs, text, fields):
    """Every word of `text` must match at least one of `fields` (icontains), so "marie fontanilla" finds a farmer
    whose first and last names are in different columns."""
    for token in text.split():
        cond = Q()
        for f in fields:
            cond |= Q(**{f + '__icontains': token})
        qs = qs.filter(cond)
    return qs


def _iter_yield_analysis(request, chunk_size=400):
    """(record, light analysis) for every harvested crop, a chunk at a time, so thousands of crops (and their
    activity logs) are never held in memory together - the aggregate summary used to run a 512 MB server out of it."""
    for chunk in _chunked(_yield_analysis_queryset(request).iterator(chunk_size=chunk_size), chunk_size):
        stages = _stages_by_crop(chunk)
        for rec in chunk:
            yield rec, _analyze_crop(rec, stages, light=True)


class YieldAnalysisView(APIView):
    # Batch 11: CITIZEN is allowed here too — _yield_analysis_queryset()
    # scopes the actual rows returned, ADMIN/EVALUATOR stay unrestricted.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _yield_analysis_queryset(request)
        search = request.query_params.get('search', '').strip()
        if search:
            qs = _yield_search(qs, search, [
                'crop_type__name', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name',
                'farm_location_barangay', 'farmer__barangay'])
        paging = _page_params(request)
        if paging:
            # One page (with its activity breakdowns) instead of every harvested crop.
            page, size = paging
            total = qs.count()
            records = list(qs[(page - 1) * size:page * size])
        else:
            records = list(qs)
            total = len(records)
        stages = _stages_by_crop(records)
        data = [_analyze_crop(rec, stages) for rec in records]
        payload = {
            'count': total,
            'records': data,
            'disclaimer': YIELD_ANALYSIS_DISCLAIMER,
        }
        if paging:
            payload.update({'page': page, 'page_size': size})
        return Response(payload)


class YieldAnalysisSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'crop_type'):
            group_by = 'barangay'

        groups = {}
        n = losses = 0
        estimated_sum = actual_sum = variance_sum = completion_sum = 0.0
        estimated_n = variance_n = completion_n = 0
        for rec, a in _iter_yield_analysis(request):
            key = (rec.crop_type.name if rec.crop_type else '—') if group_by == 'crop_type' else a['barangay']
            g = groups.setdefault(key, new_yield_group())
            accumulate_yield_group(g, a)
            n += 1
            actual_sum += a['actual_total_kg']
            if a['is_total_loss']:
                losses += 1
            if a['estimated_kg'] is not None:
                estimated_sum += a['estimated_kg']
                estimated_n += 1
            if a['variance_pct'] is not None and not a['is_total_loss']:
                variance_sum += a['variance_pct']
                variance_n += 1
            if a['activities_total_count'] > 0:
                completion_sum += (a['activities_completed_count'] / a['activities_total_count']) * 100
                completion_n += 1

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

        overall = {
            'harvested_crop_count': n,
            'total_loss_count': losses,
            'avg_estimated_kg': round(estimated_sum / estimated_n, 2) if estimated_n else None,
            'avg_actual_kg': round(actual_sum / n, 2) if n else None,
            'avg_variance_pct': round(variance_sum / variance_n, 2) if variance_n else None,
            'avg_activity_completion_pct': round(completion_sum / completion_n, 2) if completion_n else None,
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes
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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes
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
        ).prefetch_related('photos').order_by('-date_of_occurrence')

    def create(self, request, *args, **kwargs):
        # 0-10 damage photos (the older single `photo` field counts as one), validated before anything is saved;
        # the report, its photo rows and the response are built in ONE transaction, and the files written by a
        # failed attempt are removed again.
        if not hasattr(request.data, 'items'):
            raise ValidationError({'detail': 'Send the report as a form or a JSON object.'})
        photos = validated_photos(request, 'photos', legacy_field='photo', limit=CropDisasterReportPhoto.MAX_PER_PARENT)
        if hasattr(request.data, 'getlist'):   # multipart: one value per field, photo files excluded
            data = {k: request.data.get(k) for k in request.data.keys() if k not in ('photos', 'photo')}
        else:
            data = {k: v for k, v in request.data.items() if k not in ('photos', 'photo')}
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        written = []
        try:
            with transaction.atomic():
                self.perform_create(serializer)
                report = serializer.instance
                for f in photos:
                    row = CropDisasterReportPhoto.objects.create(disaster_report=report, image=f, uploaded_by=request.user)
                    written.append(row.image.name)
                report = CropDisasterReport.objects.prefetch_related('photos').get(pk=report.pk)
                response_data = self.get_serializer(report).data
        except Exception:
            discard_uploaded_files(written)
            raise
        return Response(response_data, status=drf_status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        monitoring_id = self.kwargs.get('monitoring_id')
        monitoring = CropMonitoringRecord.objects.get(pk=monitoring_id)
        assert_not_locked_by_other(self.request.user, 'crop', monitoring_id)
        disaster = serializer.save(
            monitoring_record_id=monitoring_id,
            reported_by=self.request.user,
        )
        _notify_crop_disaster(self.request.user, monitoring, disaster)


def _notify_crop_disaster(user, monitoring, disaster):
    """Tell the staff (and, when staff logged it, the crop's owner) that a disaster was reported on this crop."""
    notify_staff(
        actor=user,
        verb='reported a disaster on',
        record_type='crop',
        record_id=monitoring.id,
        record_label=_crop_record_label(monitoring),
        detail=disaster.disaster_type,
    )
    if user.role != 'CITIZEN':
        notify_user(
            recipient=resolve_owner_user(
                farmer_id=monitoring.farmer_id,
                farmers_organization_id=monitoring.farmers_organization_id,
            ),
            actor=user,
            verb='reported a disaster on',
            record_type='crop',
            record_id=monitoring.id,
            record_label=_crop_record_label(monitoring),
            detail=disaster.disaster_type,
        )


MAX_MULTI_DISASTER_CROPS = 50


class CropDisasterReportMultiCreateView(APIView):
    """One disaster event on several of ONE farmer's crops, logged in a single request.

    Body (JSON, or multipart when there are photos - then `crops` is a JSON string): the shared fields of the single-crop
    form (disaster_type, disaster_type_other_specify, date_of_occurrence, estimated_damage, production_loss, severity,
    photos) and `crops`: [{monitoring_record, area_affected_ha, is_total_loss}, ...]. It creates one CropDisasterReport
    per crop, each validated exactly like the single-crop endpoint and each with its own copy of the photos, so every
    report keeps its own recovery, Total Loss and photos. All or nothing: one problem saves nothing.

    Staff may log for any farmer's crops; a farmer account only for its own; nobody else.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not hasattr(request.data, 'items'):
            raise ValidationError({'detail': 'Send the report as a form or a JSON object.'})
        items = request.data.get('crops')
        if isinstance(items, str):
            try:
                items = json.loads(items)
            except ValueError:
                raise ValidationError({'crops': 'The list of crops could not be read.'})
        if not isinstance(items, list) or not items:
            raise ValidationError({'crops': 'Choose at least one crop.'})
        if len(items) > MAX_MULTI_DISASTER_CROPS:
            raise ValidationError({'crops': f'At most {MAX_MULTI_DISASTER_CROPS} crops can be logged at once.'})
        try:
            ids = [int(item['monitoring_record']) for item in items]
        except (TypeError, KeyError, ValueError):
            raise ValidationError({'crops': 'Each crop needs its record id.'})
        if len(set(ids)) != len(ids):
            raise ValidationError({'crops': 'The same crop is listed twice.'})

        records = {
            r.id: r for r in CropMonitoringRecord.objects.select_related('crop_type', 'farmer', 'farmers_organization').filter(pk__in=ids)
        }
        if len(records) != len(ids):
            raise ValidationError({'crops': 'One of the crops could not be found.'})
        owners = {r.farmer_id for r in records.values()}
        if len(owners) != 1 or None in owners:
            raise ValidationError({'crops': 'All the crops must belong to the same farmer.'})
        farmer_id = owners.pop()
        user = request.user
        if user.role not in STAFF_ROLES and farmer_scope(user) != farmer_id:
            raise PermissionDenied('You can only report a disaster on your own crops.')

        photos = validated_photos(request, 'photos', legacy_field='photo', limit=CropDisasterReportPhoto.MAX_PER_PARENT)
        contents = [(f.name, f.read()) for f in photos]
        if hasattr(request.data, 'getlist'):   # multipart: one value per field, photo files excluded
            shared = {k: request.data.get(k) for k in request.data.keys() if k not in ('photos', 'photo', 'crops')}
        else:
            shared = {k: v for k, v in request.data.items() if k not in ('photos', 'photo', 'crops')}

        validated, errors = [], []
        for item in items:
            record = records[int(item['monitoring_record'])]
            fields = {**shared, 'area_affected_ha': item.get('area_affected_ha'), 'is_total_loss': bool(item.get('is_total_loss', False))}
            serializer = CropDisasterReportSerializer(data=fields, context={'request': request, 'monitoring_record': record})
            if serializer.is_valid():
                validated.append((record, serializer))
            else:
                errors.append({'monitoring_record': record.id, 'errors': serializer.errors})
        if errors:
            first = errors[0]
            problem = next(iter(first['errors'].values()))
            message = problem[0] if isinstance(problem, (list, tuple)) and problem else str(problem)
            return Response({
                'detail': f"{_crop_record_label(records[first['monitoring_record']])}: {message}",
                'errors': errors,
            }, status=drf_status.HTTP_400_BAD_REQUEST)

        written, report_ids = [], []
        try:
            with transaction.atomic():
                for record, serializer in validated:
                    assert_not_locked_by_other(user, 'crop', record.id)
                    report = serializer.save(monitoring_record=record, reported_by=user)
                    for name, blob in contents:
                        row = CropDisasterReportPhoto.objects.create(
                            disaster_report=report, image=ContentFile(blob, name=name), uploaded_by=user)
                        written.append(row.image.name)
                    _notify_crop_disaster(user, record, report)
                    report_ids.append(report.pk)
                created = CropDisasterReport.objects.prefetch_related('photos').filter(pk__in=report_ids).order_by('id')
                response_data = CropDisasterReportSerializer(created, many=True, context={'request': request}).data
        except Exception:
            discard_uploaded_files(written)
            raise
        return Response(response_data, status=drf_status.HTTP_201_CREATED)


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
    owner_record_type = 'FARMER'   # owner ids here are Farmer pks - a Fisherfolk-linked citizen never passes

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
        blocked = disaster.recovery_block_reason          # a harvested or total-loss crop: the disaster stays in the history
        if blocked:
            return Response({'detail': blocked}, status=400)

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
        summary = get_object_or_404(BarangayCropSummary, pk=pk)
        ids = request.data.get('monitoring_record_ids', [])
        if not isinstance(ids, list) or not all(isinstance(i, int) and not isinstance(i, bool) for i in ids):
            return Response({'monitoring_record_ids': ['Send a list of record ids (numbers).']}, status=drf_status.HTTP_400_BAD_REQUEST)
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
    permission_classes = [IsAuthenticated, IsStaffOrFarmerReadOnly]   # reference data: a farmer may read
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


# ─── Farmer Disaster Logs (Admin > Disaster > Farmer Disaster) ─────────────────
# Read-only views over the existing CropDisasterReport records (created as before through
# CropDisasterReportListCreateView). Staff only - farmer and organization accounts are unchanged.

class CropDisasterLogListView(APIView):
    """Every farmer disaster log. Filters: search (farmer/organization, crop, type, reference no.), barangay,
    disaster_type, status, year. With ?page= the response is paginated ({count, page, page_size, results}).
    A farmer account gets only its own logs, whatever the filters say."""
    permission_classes = [IsAuthenticated, IsStaffOrFarmer]
    PAGE_SIZE = 20

    def get(self, request):
        from . import crop_disaster_logs
        qs = scope_to_farmer(crop_disaster_logs.crop_queryset(), request.user, 'monitoring_record__farmer_id').order_by('-date_reported', '-id')
        params = request.query_params
        if params.get('disaster_type'):
            qs = qs.filter(disaster_type=params['disaster_type'])
        if params.get('status') in ('Active', 'Recovered'):
            qs = qs.filter(status=params['status'])
        if is_plain_int(params.get('year', '')):
            qs = qs.filter(date_of_occurrence__year=int(params['year']))
        if params.get('barangay'):
            qs = qs.filter(monitoring_record__farm_location_barangay__iexact=params['barangay'])
        search = (params.get('search') or '').strip()
        if search:
            match = (Q(monitoring_record__farmer__first_name__icontains=search)
                     | Q(monitoring_record__farmer__last_name__icontains=search)
                     | Q(monitoring_record__farm_parcel__farmer__first_name__icontains=search)
                     | Q(monitoring_record__farm_parcel__farmer__last_name__icontains=search)
                     | Q(monitoring_record__farmers_organization__name__icontains=search)
                     | Q(monitoring_record__crop_type__name__icontains=search)
                     | Q(disaster_type__icontains=search) | Q(disaster_type_other_specify__icontains=search))
            ref = search.upper().replace('CDR-', '').split('-')[-1]
            if is_plain_int(ref):
                match |= Q(pk=int(ref))
            qs = qs.filter(match)
        if not params.get('page'):
            return Response([crop_disaster_logs.list_row(r) for r in qs])
        try:
            page = max(1, int(params['page']))
        except ValueError:
            page = 1
        count = qs.count()
        rows = qs[(page - 1) * self.PAGE_SIZE: page * self.PAGE_SIZE]
        return Response({'count': count, 'page': page, 'page_size': self.PAGE_SIZE,
                         'results': [crop_disaster_logs.list_row(r) for r in rows]})


class CropDisasterLogDocumentView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrFarmer]

    def get(self, request, pk):
        from . import crop_disaster_logs
        report = get_object_or_404(scope_to_farmer(crop_disaster_logs.crop_queryset(), request.user, 'monitoring_record__farmer_id'), pk=pk)
        return Response(crop_disaster_logs.document(report, request))


class CropDisasterLogPdfView(APIView):
    """The saved farmer disaster log as a real PDF (read-only)."""
    permission_classes = [IsAuthenticated, IsStaffOrFarmer]

    def get(self, request, pk):
        import logging
        from django.http import HttpResponse
        from . import crop_disaster_logs
        report = get_object_or_404(scope_to_farmer(crop_disaster_logs.crop_queryset(), request.user, 'monitoring_record__farmer_id'), pk=pk)
        doc = crop_disaster_logs.document(report, request)
        try:
            pdf_bytes = crop_disaster_logs.build_pdf(report, doc)
        except Exception:
            logging.getLogger(__name__).exception('Farmer disaster log PDF failed for %s', report.pk)
            return Response({'detail': 'The PDF could not be generated. The disaster log was not changed - please try again.'},
                            status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{doc["pdf_filename"]}"'
        response['Cache-Control'] = 'no-store'
        return response


from core.pcic import PcicFormPhotoMixin  # noqa: E402


class CropMonitoringPcicFormView(PcicFormPhotoMixin, CropMonitoringDetailView):
    """POST/DELETE the photo of a planting record's PCIC insurance form. Staff only: a farmer can read their own
    planting records but not change them, and the form is part of the record."""
    farmer_blocked_methods = ('POST', 'PUT', 'PATCH', 'DELETE')
