import logging
from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.core.files.storage import default_storage
from django.db import transaction
from django.db.models import Case, CharField, Count, F, Q, Sum, Value, When
from django.db.models.functions import Cast, Concat
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics, status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import (
    STAFF_ROLES, IsAdmin, IsAdminOrEvaluator, IsStaffOrFisherfolk, IsStaffOrFisherfolkReadOnly,
    IsStaffOrOwnRecordCitizen, fisherfolk_scope, is_fisherfolk_citizen, scope_to_fisherfolk,
)
from accounts.utils import create_inactive_citizen_shell
from core.locking import assert_not_locked_by_other
from core.notifications import notify_staff, notify_user, resolve_owner_user
from core.utils import accumulate_yield_group, build_name_search_q, day_range_bounds, filter_people_search, harvest_gate_status, is_plain_int, new_yield_group
from core.idnumbers import by_id_key
from core.photos import discard_uploaded_files, validated_photos
from core.validators import validate_uploaded_image

from monitoring.models import AquacultureProductionUnit

from . import disaster_reports
from .eligibility import NO_PONDS_MESSAGE, fisherfolk_has_ponds
from .notifications import queue_force_harvest
from .models import (
    HARVEST_TIMING_LABELS,
    DiseaseResponseGuide,
    DiseaseType,
    FeedType,
    FisheriesActivityLog,
    FisheriesActivityType,
    FisheriesDisasterReport,
    FisheriesDisasterReportPhoto,
    FisheriesDisasterResponseRule,
    FisheriesDisasterStockLoss,
    FisheriesHarvestRecord,
    Fisherfolk,
    FishingTripLog,
    Pond,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
    calculate_estimated_harvest_kg,
    harvest_timing,
    production_cycle_numbers_bulk,
    stocking_display_status_q,
)
from .serializers import (
    DiseaseResponseGuideSerializer,
    DiseaseTypeSerializer,
    FeedTypeSerializer,
    FisherfolkCreateSerializer,
    FisherfolkDetailSerializer,
    FisherfolkListSerializer,
    FisheriesActivityLogSerializer,
    FisheriesActivityTypeSerializer,
    FisheriesDisasterReportSerializer,
    FisheriesHarvestRecordSerializer,
    FishingTripLogSerializer,
    GeneralDisasterReportSerializer,
    PondSerializer,
    SpeciesActivityStageSerializer,
    SpeciesCategorySerializer,
    SpeciesOptionSerializer,
    StockingRecordDetailSerializer,
    StockingRecordSerializer,
    TripSpeciesEntrySerializer,
)
from core.exports import SafeWorkbook

logger = logging.getLogger(__name__)


# ─── Fisherfolk ───────────────────────────────────────────────────────────────

class FisherfolkListView(generics.ListCreateAPIView):
    def get_permissions(self):
        # Registering fisherfolk stays staff-only. Reading is also open to a fisherfolk citizen - the
        # reused Admin pages (Start Production Cycle's fisherfolk picker, Forecasting's filter) need it -
        # but scoped to their own single record below.
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsStaffOrFisherfolk()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkCreateSerializer if self.request.method == 'POST' else FisherfolkListSerializer

    def get_queryset(self):
        from django.utils.timezone import localdate
        qs = scope_to_fisherfolk(Fisherfolk.objects.all(), self.request.user, 'id').order_by('-date_registered', '-id')
        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            # Same full-name handling as FarmerListView: every whitespace-
            # separated token must match some name field, so "Juan dela Cruz"
            # finds first_name "Juan" + last_name "Dela Cruz".
            qs = filter_people_search(
                qs, search,
                name_fields=['first_name', 'middle_name', 'last_name'],
                id_fields=['rsbsa_number', 'lgu_registration_number', 'fishr_number'],
                other_fields=['barangay'],
            )
        if params.get('status'):
            v = params['status'].lower()
            if v in ('active', 'true', '1'):
                qs = qs.filter(is_active=True)
            elif v in ('inactive', 'false', '0'):
                qs = qs.filter(is_active=False)
        if params.get('gender'):
            qs = qs.filter(gender__iexact=params['gender'])
        if params.get('fisherfolk_type'):
            qs = qs.filter(fisherfolk_type__iexact=params['fisherfolk_type'])
        if params.get('is_senior') and params['is_senior'].lower() == 'true':
            today = localdate()   # the Manila calendar day, as in FarmerListView
            cutoff = today.replace(year=today.year - 60)
            qs = qs.filter(birthdate__lte=cutoff)
        if params.get('is_pwd') is not None:
            qs = qs.filter(is_pwd=(params['is_pwd'].lower() in ('true', '1')))
        if params.get('is_4ps') is not None:
            qs = qs.filter(is_4ps_beneficiary=(params['is_4ps'].lower() in ('true', '1')))
        if params.get('organization') is not None:
            # Real membership (join table), as FarmerListView filters — the
            # direct fisherfolk_organization FK is legacy and unset for
            # nearly every record.
            qs = qs.filter(
                fisherfolk_organizations__organization_id=params['organization'],
                fisherfolk_organizations__is_active=True,
            ).distinct()
        if params.get('registered_from'):
            bound = day_range_bounds(params['registered_from'])
            if bound:
                qs = qs.filter(date_registered__gte=bound)
        if params.get('registered_to'):
            bound = day_range_bounds(params['registered_to'], end_of_day=True)
            if bound:
                qs = qs.filter(date_registered__lte=bound)
        return qs

    def perform_create(self, serializer):
        # An inactive shell account is created immediately, ready for a
        # later in-person "Set Up Account" visit
        # (ActivateCitizenAccountButton / SetCitizenPasswordView) — staff no
        # longer type or see a password at enrollment time.
        with transaction.atomic():
            serializer.save(registered_by=self.request.user)
            fisherfolk = serializer.instance
            create_inactive_citizen_shell(User.LinkedRecordType.FISHERFOLK, fisherfolk, email=fisherfolk.email)


class FisherfolkDetailView(generics.RetrieveUpdateAPIView):
    queryset = Fisherfolk.objects.all()
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_serializer_class(self):
        return FisherfolkCreateSerializer if self.request.method == 'PATCH' else FisherfolkDetailSerializer

    def update(self, request, *args, **kwargs):
        if 'is_active' in request.data and request.user.role != 'ADMIN':
            return Response(
                {'detail': "Only an Admin can change a fisherfolk's status."},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().update(request, *args, **kwargs)


class FisherfolkDuplicateCheckView(APIView):
    """GET /api/fisheries/fisherfolk/check-duplicate/?first_name=&last_name=&birth_date="""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        first_name = request.query_params.get('first_name', '').strip()
        last_name  = request.query_params.get('last_name',  '').strip()
        birth_date = request.query_params.get('birth_date', '').strip()

        if not first_name or not last_name:
            return Response({'duplicates': []})

        qs = Fisherfolk.objects.filter(
            first_name__iexact=first_name,
            last_name__iexact=last_name,
        )
        if birth_date:
            qs = qs.filter(birthdate=birth_date)

        duplicates = [
            {
                'id': f.id,
                'full_name': f.full_name,
                'barangay': f.barangay,
                'lgu_registration_number': f.lgu_registration_number,
                'birth_date': str(f.birthdate) if f.birthdate else None,
            }
            for f in qs[:5]
        ]
        return Response({'duplicates': duplicates})


# ─── Species Category ─────────────────────────────────────────────────────────

class SpeciesCategoryListCreateView(generics.ListCreateAPIView):
    serializer_class = SpeciesCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None
    queryset = SpeciesCategory.objects.order_by('name')


class SpeciesCategoryDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SpeciesCategorySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = SpeciesCategory.objects.all()


# ─── Fisheries Activity Type ──────────────────────────────────────────────────

class FisheriesActivityTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesActivityTypeSerializer
    pagination_class = None
    queryset = FisheriesActivityType.objects.all().order_by('name')

    def get_permissions(self):
        # GET is read by every activity-logging surface, staff and citizen
        # alike (StockingMonitoringModals, CitizenActivityLogModal) — mirrors
        # production.ActivityTypeListCreateView's own GET/POST split. Only
        # admins/evaluators may add a new type.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]


class FisheriesActivityTypeDetailView(generics.RetrieveUpdateAPIView):
    """Toggle-not-delete — see FisheriesActivityType's own model docstring."""
    serializer_class = FisheriesActivityTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheriesActivityType.objects.all()


# ─── Species Option ───────────────────────────────────────────────────────────

class StockingFormOptionsView(APIView):
    """Read-only Pond Location / Water Source options for the Start Production Cycle form.

    Serves the backend's own authoritative lists - core.constants.BARANGAY_CHOICES and
    fisheries.models.WATER_SOURCE_CHOICES - i.e. exactly the values StockingRecord validates
    against, so the dropdowns can never offer something the backend rejects."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from core.constants import BARANGAY_CHOICES
        from .models import WATER_SOURCE_CHOICES
        return Response({
            'barangays': [value for value, _ in BARANGAY_CHOICES],
            'water_sources': [value for value, _ in WATER_SOURCE_CHOICES],
        })


class SpeciesOptionListCreateView(generics.ListCreateAPIView):
    serializer_class = SpeciesOptionSerializer
    # Shared reference data: a fisherfolk may read it (Start Production Cycle, Forecasting); writes staff-only.
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolkReadOnly]
    pagination_class = None

    def get_queryset(self):
        qs = SpeciesOption.objects.select_related('category').prefetch_related('stages').order_by('species_name')
        category_id = self.request.query_params.get('category_id')
        if category_id:
            qs = qs.filter(category_id=category_id)
        return qs


class SpeciesOptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = SpeciesOptionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = SpeciesOption.objects.select_related('category').prefetch_related('stages')


# ─── Species Activity Stages ──────────────────────────────────────────────────

class SpeciesActivityStageListCreateView(generics.ListCreateAPIView):
    serializer_class = SpeciesActivityStageSerializer
    # Shared reference data: a fisherfolk may read the stages (activity logs); writes staff-only.
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolkReadOnly]
    pagination_class = None

    def get_queryset(self):
        return SpeciesActivityStage.objects.filter(
            species_option_id=self.kwargs['species_id']
        ).order_by('day_after_stocking')

    def perform_create(self, serializer):
        serializer.save(species_option_id=self.kwargs['species_id'])


class SpeciesActivityStageDeleteView(generics.DestroyAPIView):
    serializer_class = SpeciesActivityStageSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = SpeciesActivityStage.objects.all()


# ─── Feed Type (Batch 4) ────────────────────────────────────────────────────

class FeedTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = FeedTypeSerializer
    pagination_class = None

    def get_permissions(self):
        # Batch F — GET widened to any authenticated user: FeedType is
        # shared reference data with no per-record owner (unlike
        # CropActivitySuggestionsView's IsStaffOrOwnRecordCitizen widening
        # in Batch E, there's no ownership check to make here), needed so
        # a citizen's activity-log form can offer a species-scoped feed
        # type picker. Write access (POST/PATCH/DELETE) stays staff-only.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        # Same species-scoping pattern as DiseaseTypeListCreateView (Batch C).
        qs = FeedType.objects.order_by('name')
        species_id = self.request.query_params.get('species')
        if species_id:
            qs = qs.filter(species_options__id=species_id)
        return qs


class FeedTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FeedTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FeedType.objects.all()


# ─── Disease reference data (Batch 4) ───────────────────────────────────────

class DiseaseTypeListCreateView(generics.ListCreateAPIView):
    serializer_class = DiseaseTypeSerializer
    pagination_class = None

    def get_permissions(self):
        # DiseaseType is a REFERENCE table, not anybody's personal data, and a
        # fisherfolk citizen has to read it to say what is wrong with their
        # pond (the health-log screen offers these as choices). Reading is
        # therefore open to any authenticated user; creating one stays
        # staff-only, unchanged.
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdminOrEvaluator()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = DiseaseType.objects.order_by('name')
        species_id = self.request.query_params.get('species')
        if species_id:
            qs = qs.filter(species_options__id=species_id)
        return qs


class DiseaseTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DiseaseTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = DiseaseType.objects.all()


class DiseaseResponseGuideListCreateView(generics.ListCreateAPIView):
    serializer_class = DiseaseResponseGuideSerializer
    pagination_class = None

    def get_permissions(self):
        # Same reasoning as DiseaseTypeListCreateView above: the health-log
        # screen shows the guide for whichever illness the fisherfolk picked
        # ("Pangkalahatang mungkahi sa pag-aalaga"), so a citizen must be able
        # to read it. Authoring guidance stays staff-only — this text steers
        # how someone treats their stock.
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdminOrEvaluator()]
        return [IsAuthenticated()]

    def get_queryset(self):
        qs = DiseaseResponseGuide.objects.select_related('disease_type').order_by('disease_type__name')
        disease_type_id = self.request.query_params.get('disease_type')
        if disease_type_id:
            qs = qs.filter(disease_type_id=disease_type_id)
        return qs


class DiseaseResponseGuideDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = DiseaseResponseGuideSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = DiseaseResponseGuide.objects.select_related('disease_type')


# ─── Pond ─────────────────────────────────────────────────────────────────────

class PondListCreateView(generics.ListCreateAPIView):
    """Ponds belonging to one fisherfolk. Returns both active and inactive
    ponds — the Fisherfolk Detail page's management table needs to show
    deactivated ponds too; the stocking-form pond selector filters to
    is_active on the frontend.

    Batch F — GET widened to IsStaffOrOwnRecordCitizen so a fisherfolk's
    own citizen account can list their own ponds (including unstocked
    ones, which never appear in the StockingRecord list) for the home
    screen's "My Ponds" section. Write access (POST) stays staff-only —
    citizens still cannot create ponds.
    """
    serializer_class = PondSerializer
    pagination_class = None
    owner_record_type = 'FISHERFOLK'

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsStaffOrOwnRecordCitizen()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_target_owner_id(self, request):
        # The fisherfolk being queried IS the URL kwarg itself here — no
        # parent object to look up, unlike stocking logs resolving a
        # monitoring/stocking id's owner.
        try:
            return int(self.kwargs['fisherfolk_id'])
        except (TypeError, ValueError):
            return None

    def get_queryset(self):
        # Newest-first, matching every other list in this app (Farmers,
        # Fisherfolk, Organizations, Stocking/Harvest/Crop records, Audit
        # Log) — this used to sort oldest-first, the one real exception.
        # -id tie-breaks -date_created: confirmed against real data that
        # ponds created in the same request/batch share one identical
        # second-precision timestamp (e.g. fisherfolk #18's 4 ponds).
        return Pond.objects.filter(fisherfolk_id=self.kwargs['fisherfolk_id']).order_by('-date_created', '-id')

    def perform_create(self, serializer):
        serializer.save(fisherfolk_id=self.kwargs['fisherfolk_id'])


class PondBulkCreateView(APIView):
    """Batch D — bulk pond creation, alongside PondListCreateView's existing
    single-add flow (unchanged). Accepts a list of pond objects, validates
    ALL of them with the same PondSerializer before creating ANY (so a
    single bad row returns per-item errors with nothing persisted), then
    saves them one at a time — not bulk_create — so Pond.save()'s
    auto-numbering (see Pond.save) sees each prior row already committed
    and continues the sequence correctly within the same request."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, fisherfolk_id):
        get_object_or_404(Fisherfolk, pk=fisherfolk_id)
        items = request.data
        if not isinstance(items, list) or not items:
            return Response(
                {'detail': 'Expected a non-empty list of ponds.'},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        item_serializers = [PondSerializer(data=item) for item in items]
        validities = [s.is_valid() for s in item_serializers]
        if not all(validities):
            return Response({'errors': [s.errors for s in item_serializers]}, status=drf_status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            created = [s.save(fisherfolk_id=fisherfolk_id) for s in item_serializers]

        return Response(PondSerializer(created, many=True).data, status=drf_status.HTTP_201_CREATED)


class PondDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = PondSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = Pond.objects.all()

    def destroy(self, request, *args, **kwargs):
        pond = self.get_object()
        if pond.stocking_records.exists():
            return Response(
                {'detail': 'This pond has stocking history and cannot be deleted. Deactivate it instead.'},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Stocking Record ──────────────────────────────────────────────────────────

def stocking_pond_q(text):
    """Stockings whose Pond is named like `text`, or that have a production unit labelled like it ("Pond 2", "Cage 1").
    Case-insensitive and partial; a stock listed through several matching units still appears once (no join)."""
    unit_cycles = AquacultureProductionUnit.objects.annotate(
        label=Concat(
            Case(When(unit_type='pond', then=Value('Pond')), default=Value('Cage'), output_field=CharField()),
            Value(' '), Cast('unit_number', CharField()), output_field=CharField(),
        ),
    ).filter(label__icontains=text).values('production_cycle_id')
    return Q(pond__name__icontains=text) | Q(production_cycle_id__in=unit_cycles)


class StockingListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        # Batch 11: CITIZEN may list (own records only, scoped below) but
        # never create — staff remains the sole gatekeeper for starting a
        # new stocking cycle.
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return StockingRecordSerializer

    def get_queryset(self):
        qs = StockingRecord.objects.select_related(
            'fisherfolk', 'species', 'species__category', 'recorded_by', 'production_cycle',
            'production_cycle__organization',
        ).prefetch_related('logs', 'disaster_reports', 'harvests').order_by('-date_recorded', '-id')

        if self.request.user.role == 'CITIZEN':
            fisherfolk_id = self.request.user.get_linked_fisherfolk_id()
            qs = qs.filter(fisherfolk_id=fisherfolk_id if fisherfolk_id else -1)

        params = self.request.query_params
        raw_status = params.get('status', '')
        if raw_status:
            # Filters on the DISPLAYED status (Stocked / Near Harvest / Late from the dates, see
            # stocking_display_status), so a row and the filter that lists it always agree.
            statuses = [s.strip() for s in raw_status.split(',') if s.strip()]
            qs = qs.filter(stocking_display_status_q(statuses))
        else:
            qs = qs.exclude(status__in=[
                StockingRecord.Status.TOTAL_LOSS,
                StockingRecord.Status.HARVESTED,
            ])

        if params.get('season'):
            qs = qs.filter(season__iexact=params['season'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('species'):
            qs = qs.filter(species_id=params['species'])
        if params.get('barangay'):
            qs = qs.filter(pond_location_barangay__iexact=params['barangay'])
        pond = (params.get('pond') or '').strip()
        if pond:
            qs = qs.filter(stocking_pond_q(pond))
        # Fisherfolk by name in any order or by RSBSA / LGU / FishR number
        # (as typed or without dashes), plus species and barangay.
        qs = filter_people_search(
            qs, params.get('search'),
            name_fields=['fisherfolk__first_name', 'fisherfolk__middle_name', 'fisherfolk__last_name'],
            id_fields=['fisherfolk__rsbsa_number', 'fisherfolk__lgu_registration_number', 'fisherfolk__fishr_number'],
            other_fields=['species__species_name', 'pond_location_barangay'],
        )
        # Fisheries Forecasting "Forecast" tab: day-window scope over the real
        # expected_harvest_date field (today <= date <= date_to), rather than
        # trusting `status` alone — status only flips to Near Harvest when
        # something calls .save() on the record, so a record already inside
        # the window can still read Stocked if nothing has touched it since.
        # Same date_from/date_to query-param convention already used by
        # auditlog/views.py. Total Loss (and Harvested) stay excluded via the
        # existing no-status-param default branch above.
        if params.get('date_from'):
            qs = qs.filter(expected_harvest_date__gte=params['date_from'])
        if params.get('date_to'):
            qs = qs.filter(expected_harvest_date__lte=params['date_to'])
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


class StockingBulkCreateView(APIView):
    """Mirrors PondBulkCreateView's bulk-create pattern above exactly, per
    the tabular multi-row Add Stocking form: validates EVERY row with
    StockingRecordSerializer before creating ANY (so a single bad row
    returns per-item errors with nothing persisted), then saves them one at
    a time — not bulk_create — inside a single transaction, since
    StockingRecord.save() computes per-instance fields and needs to
    actually run for each row."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        items = request.data
        if not isinstance(items, list) or not items:
            return Response(
                {'detail': 'Expected a non-empty list of stocking records.'},
                status=drf_status.HTTP_400_BAD_REQUEST,
            )

        item_serializers = [StockingRecordSerializer(data=item) for item in items]
        validities = [s.is_valid() for s in item_serializers]
        if not all(validities):
            return Response({'errors': [s.errors for s in item_serializers]}, status=drf_status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            created = [s.save(recorded_by=request.user) for s in item_serializers]

        return Response(StockingRecordSerializer(created, many=True).data, status=drf_status.HTTP_201_CREATED)


STOCKING_TEMPLATE_HEADERS = [
    'Fisherfolk RSBSA Number', 'Species Name', 'Date Stocked (YYYY-MM-DD)',
    'Number of Fingerlings', 'Culture Type (Pond/Cage/Pen)',
]
STOCKING_TEMPLATE_SAMPLE = ['01-33-02-999-999999', 'Tilapia', '2025-01-15', 5000, 'Pond']
# Far above any real single stocking, well inside a 32-bit integer column.
MAX_FINGERLINGS = 10_000_000


class StockingForecastingTemplateView(APIView):
    """Mirrors ForecastingTemplateView (production/views.py) exactly, with
    fisheries-appropriate columns substituted: RSBSA number instead of
    organization name (StockingRecord has no organization-level FK — only
    an individual fisherfolk FK — so rows are matched to a specific person,
    not an org), species instead of crop type, date stocked instead of date
    planted, number of fingerlings instead of area planted (area_hectares is
    optional on StockingRecord; number_of_fingerlings is the required
    quantity field). Culture Type is a genuinely new required column with no
    crop-side equivalent — StockingRecord.culture_type has no default and
    must be supplied."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from io import BytesIO

        from django.http import HttpResponse
        from openpyxl.styles import Font, PatternFill

        wb = SafeWorkbook()
        ws = wb.active
        ws.title = 'Stocking Forecasting Import'

        headers = STOCKING_TEMPLATE_HEADERS
        green_fill = PatternFill(start_color='1E4620', end_color='1E4620', fill_type='solid')
        white_font = Font(color='FFFFFF', bold=True)

        col_widths = [28, 25, 28, 22, 28]
        for col, (header, width) in enumerate(zip(headers, col_widths), 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.fill = green_fill
            cell.font = white_font
            ws.column_dimensions[cell.column_letter].width = width

        for col, value in enumerate(STOCKING_TEMPLATE_SAMPLE, 1):
            ws.cell(row=2, column=col, value=value)

        buf = BytesIO()
        wb.save(buf)
        buf.seek(0)

        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = 'attachment; filename="stocking_forecasting_template.xlsx"'
        return response


class StockingForecastingImportView(APIView):
    """Mirrors ForecastingImportView (production/views.py) exactly, including
    its duplicate-detection shape: parses the uploaded Excel row by row (data
    starts row 3, same as crop's template), creates one StockingRecord per
    valid non-duplicate row directly via .objects.create() (not the
    serializer — same as crop), collects per-row errors without rolling back
    earlier successful rows (crop's Excel import is deliberately not atomic;
    the bulk-create tabular form is the atomic path, unaffected by this).

    Identity for duplicate detection is (fisherfolk, species, date_stocked)
    — the three fields that together identify "this stocking event" from
    what the import actually captures; culture_type/fingerlings/etc. are
    details of the event, not part of what makes two rows "the same event".
    Two passes: first parse every row and group by that identity to catch
    same-file collisions (every row in a colliding group is flagged, none
    created); rows unique within the file are then checked against the
    database before being created.

    `dry_run` (any of "1"/"true"/"yes", multipart form field alongside
    `file`) makes this a preview-only call — see ForecastingImportView's
    matching docstring (production/views.py) for the full rationale; this
    view mirrors it exactly, including the added `dry_run`/`summary`/`rows`
    response fields alongside the unchanged {created, errors, duplicates}
    the Fisheries Forecasting page already depends on."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        from core.utils import run_import_atomically

        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        dry_run = str(request.data.get('dry_run', '')).strip().lower() in ('1', 'true', 'yes')

        # All-or-nothing: rows that are merely invalid are reported, but an
        # unexpected failure part-way through can no longer leave a
        # half-imported file (see core.utils.run_import_atomically).
        return run_import_atomically(lambda: self._import(request, file, dry_run))

    def _import(self, request, file, dry_run):
        import datetime as dt
        from collections import defaultdict

        from core.utils import ImportFileError, cell_text, read_template_rows

        try:
            rows_iter = read_template_rows(
                file, file.name, STOCKING_TEMPLATE_HEADERS, sample_row=STOCKING_TEMPLATE_SAMPLE,
            )
        except ImportFileError as exc:
            return Response({'error': str(exc)}, status=400)
        except Exception as exc:
            return Response({'error': f'Invalid file: {exc}'}, status=400)

        errors = []
        rows = []
        valid_culture_types = {c.lower(): c for c in dict(StockingRecord.CULTURE_TYPE_CHOICES)}
        ready = []  # rows that parsed cleanly
        groups = defaultdict(list)  # identity key -> [row_num, ...]

        def invalid(row_num, msg):
            errors.append({'row': row_num, 'error': msg})
            rows.append({'row': row_num, 'status': 'invalid', 'label': f'Row {row_num}', 'detail': msg})

        def cell(row, i):
            return row[i] if i < len(row) else None

        for row_num, row in rows_iter:
            rsbsa            = cell_text(cell(row, 0))
            species_name     = cell_text(cell(row, 1))
            date_str         = cell_text(cell(row, 2))
            fingerlings_str  = cell_text(cell(row, 3))
            culture_type_str = cell_text(cell(row, 4))

            if not rsbsa or not species_name or not date_str or not fingerlings_str or not culture_type_str:
                invalid(row_num, 'Fisherfolk RSBSA Number, Species Name, Date Stocked, Number of Fingerlings, '
                                 'and Culture Type are required.')
                continue

            try:
                fisherfolk = by_id_key(Fisherfolk.objects.all(), 'rsbsa_number', rsbsa).first()
                if not fisherfolk:
                    invalid(row_num, f'Fisherfolk with RSBSA number "{rsbsa}" not found.')
                    continue
            except Exception as exc:
                invalid(row_num, str(exc))
                continue

            try:
                species = SpeciesOption.objects.filter(species_name__iexact=species_name).first()
                if not species:
                    invalid(row_num, f'Species "{species_name}" not found.')
                    continue
            except Exception as exc:
                invalid(row_num, str(exc))
                continue

            try:
                date_stocked = dt.date.fromisoformat(date_str[:10])
            except ValueError:
                invalid(row_num, f'Invalid date "{date_str}". Use YYYY-MM-DD.')
                continue
            # Same rule the manual Add Stocking form enforces.
            if date_stocked > dt.date.today():
                invalid(row_num, f'Date Stocked {date_stocked.isoformat()} is in the future.')
                continue

            try:
                fingerlings_float = float(fingerlings_str.replace(',', ''))
                if fingerlings_float != fingerlings_float or fingerlings_float in (float('inf'), float('-inf')):
                    raise ValueError
                number_of_fingerlings = int(fingerlings_float)
            except (ValueError, OverflowError):
                invalid(row_num, f'Invalid number of fingerlings "{fingerlings_str}".')
                continue
            if not 1 <= number_of_fingerlings <= MAX_FINGERLINGS:
                invalid(row_num, f'Number of fingerlings {number_of_fingerlings:,} is not realistic '
                                 f'(must be between 1 and {MAX_FINGERLINGS:,}).')
                continue

            culture_type = valid_culture_types.get(culture_type_str.lower())
            if not culture_type:
                invalid(row_num, f'Invalid culture type "{culture_type_str}". Use Pond, Cage, or Pen.')
                continue

            key = (fisherfolk.id, species.id, date_stocked)
            ready.append({
                'row_num': row_num, 'fisherfolk': fisherfolk, 'species': species,
                'date_stocked': date_stocked, 'number_of_fingerlings': number_of_fingerlings,
                'culture_type': culture_type, 'key': key,
            })
            groups[key].append(row_num)

        created = 0
        duplicates = []

        for item in ready:
            row_num, key = item['row_num'], item['key']
            fisherfolk, species, date_stocked = item['fisherfolk'], item['species'], item['date_stocked']
            label = f'{fisherfolk.full_name} — {species.species_name} ({date_stocked.isoformat()})'

            colliding_rows = [r for r in groups[key] if r != row_num]
            if colliding_rows:
                detail = (
                    f'Duplicate of row(s) {", ".join(str(r) for r in colliding_rows)} in this file '
                    f'(same Fisherfolk RSBSA "{fisherfolk.rsbsa_number}", Species "{species.species_name}", '
                    f'Date Stocked {date_stocked.isoformat()}). None of the colliding rows were created — '
                    f'resolve the conflict and re-upload.'
                )
                duplicates.append({'row': row_num, 'reason': 'in_file', 'error': detail, 'colliding_rows': colliding_rows})
                rows.append({'row': row_num, 'status': 'duplicate_in_file', 'label': label, 'detail': detail, 'colliding_rows': colliding_rows})
                continue

            existing = StockingRecord.objects.filter(
                fisherfolk=fisherfolk, species=species, date_stocked=date_stocked,
            ).first()
            if existing:
                detail = (
                    f'A record already exists for Fisherfolk RSBSA "{fisherfolk.rsbsa_number}", '
                    f'Species "{species.species_name}", Date Stocked {date_stocked.isoformat()} '
                    f'(record #{existing.id}). Not created again.'
                )
                duplicates.append({'row': row_num, 'reason': 'database', 'error': detail, 'existing_record_id': existing.id})
                rows.append({'row': row_num, 'status': 'duplicate_in_database', 'label': label, 'detail': detail, 'existing_record_id': existing.id})
                continue

            if dry_run:
                rows.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': 'Will be created.'})
                continue

            try:
                month = date_stocked.month
                season = 'Wet' if 5 <= month <= 10 else 'Dry'
                with transaction.atomic():
                    record = StockingRecord.objects.create(
                        fisherfolk=fisherfolk,
                        species=species,
                        date_stocked=date_stocked,
                        number_of_fingerlings=item['number_of_fingerlings'],
                        culture_type=item['culture_type'],
                        season=season,
                        year=date_stocked.year,
                        recorded_by=request.user,
                    )
                created += 1
                rows.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': f'Created (record #{record.id}).'})
            except Exception as exc:
                invalid(row_num, str(exc))

        summary = {
            'ready': sum(1 for r in rows if r['status'] == 'ready'),
            'duplicate_in_file': sum(1 for r in rows if r['status'] == 'duplicate_in_file'),
            'duplicate_in_database': sum(1 for r in rows if r['status'] == 'duplicate_in_database'),
            'invalid': sum(1 for r in rows if r['status'] == 'invalid'),
        }
        return Response({
            'created': created, 'errors': errors, 'duplicates': duplicates,
            'dry_run': dry_run, 'summary': summary, 'rows': rows,
        })


class StockingHistoryView(generics.ListAPIView):
    """All stocking records (every status) for the grouped-by-fisherfolk
    forecasting view. Reuses StockingRecordSerializer — which already exposes
    status, land_status, date_stocked, estimated_harvest_kg, total_harvested_kg
    and harvest_variance_days — and is unpaginated so the client can group
    across the full set. Filters mirror the stocking list / yield-analysis.
    A fisherfolk citizen gets only their own records (Forecasting's grouped view)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    serializer_class = StockingRecordSerializer
    pagination_class = None

    def get_queryset(self):
        qs = scope_to_fisherfolk(StockingRecord.objects.all(), self.request.user).select_related(
            'fisherfolk', 'species', 'species__category',
        ).prefetch_related('logs', 'disaster_reports', 'harvests').order_by(
            'fisherfolk__last_name', 'fisherfolk__first_name', '-date_stocked',
        )
        params = self.request.query_params
        if params.get('species'):
            qs = qs.filter(species_id=params['species'])
        if params.get('barangay'):
            qs = qs.filter(pond_location_barangay__iexact=params['barangay'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('search'):
            qs = filter_people_search(
                qs, params.get('search'),
                name_fields=['fisherfolk__first_name', 'fisherfolk__middle_name', 'fisherfolk__last_name'],
                id_fields=['fisherfolk__rsbsa_number', 'fisherfolk__lgu_registration_number', 'fisherfolk__fishr_number'],
                other_fields=['species__species_name', 'pond_location_barangay'],
            )
        return qs


class StockingDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    fisherfolk_blocked_methods = ('DELETE',)   # deleting stocking records stays staff-only (governance)

    def get_queryset(self):
        # A fisherfolk citizen only ever reaches their own stocking records - another id is a 404.
        return scope_to_fisherfolk(StockingRecord.objects.all(), self.request.user).select_related(
            'fisherfolk', 'species', 'species__category', 'recorded_by',
        ).prefetch_related('logs', 'disaster_reports', 'disaster_reports__photos', 'harvests', 'harvests__production_units', 'harvests__unit_harvests__production_unit')

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return StockingRecordDetailSerializer
        return StockingRecordSerializer

    def update(self, request, *args, **kwargs):
        owner = fisherfolk_scope(request.user)
        if owner is not None:
            # A fisherfolk can edit their own record but never move it to another fisherfolk or cycle.
            instance = self.get_object()
            data = request.data.copy()
            data['fisherfolk'] = owner
            if 'production_cycle' in data:
                data['production_cycle'] = instance.production_cycle_id
            serializer = self.get_serializer(instance, data=data, partial=kwargs.pop('partial', False))
            serializer.is_valid(raise_exception=True)
            self.perform_update(serializer)
            return Response(serializer.data)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        obj = self.get_object()
        if obj.status == StockingRecord.Status.HARVESTED:
            return Response(
                {'detail': 'Harvested records are historical production data and cannot be deleted.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete stocking records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


# ─── Nested sub-resources ─────────────────────────────────────────────────────

def _stocking_record_label(stocking):
    species_name = stocking.species.species_name if stocking.species_id else 'Stock'
    who = stocking.fisherfolk.full_name if stocking.fisherfolk_id else 'Unknown fisherfolk'
    barangay = stocking.pond_location_barangay or ''
    location = f'{who}, {barangay}' if barangay else who
    return f'{species_name} — {location}'


class StockingActivityLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes
    pagination_class = None

    def get_target_owner_id(self, request):
        stocking_id = self.kwargs.get('stocking_id')
        try:
            return StockingRecord.objects.get(pk=stocking_id).fisherfolk_id
        except StockingRecord.DoesNotExist:
            return None

    def get_queryset(self):
        # -id tie-breaks -date_of_activity (a plain DateField — day
        # precision): logging several activities for the same real day is
        # routine, not an edge case.
        return FisheriesActivityLog.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-date_of_activity', '-id')

    def perform_create(self, serializer):
        stocking_id = self.kwargs.get('stocking_id')
        stocking = StockingRecord.objects.get(pk=stocking_id)
        assert_not_locked_by_other(self.request.user, 'stocking', stocking_id)
        target_day = serializer.validated_data.get('target_day')
        date_of_activity = serializer.validated_data.get('date_of_activity')
        is_late = False
        if target_day is not None and date_of_activity and stocking.date_stocked:
            from datetime import timedelta
            stage = SpeciesActivityStage.objects.filter(
                species_option=stocking.species,
                day_after_stocking=target_day,
            ).first()
            window = stage.window_days if stage else 3
            deadline = stocking.date_stocked + timedelta(days=target_day + window)
            is_late = date_of_activity > deadline
        log = serializer.save(
            stocking_record_id=stocking_id,
            logged_by=self.request.user,
            is_late=is_late,
        )
        if self.request.user.role != 'CITIZEN':
            notify_user(
                recipient=resolve_owner_user(fisherfolk_id=stocking.fisherfolk_id),
                actor=self.request.user,
                verb='logged an activity on',
                record_type='stocking',
                record_id=stocking_id,
                record_label=_stocking_record_label(stocking),
                detail=f'{log.activity} on {log.date_of_activity}',
            )


class StockingActivityLogDeleteView(generics.DestroyAPIView):
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheriesActivityLog.objects.all()


class StockingActivityLogDetailView(generics.RetrieveUpdateAPIView):
    """Batch 11: same rationale as CropActivityLogDetailView in production/views.py — no
    update endpoint existed for FisheriesActivityLog before this (list/create + delete only)."""
    queryset = FisheriesActivityLog.objects.select_related('stocking_record')
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_owner_id(self, obj):
        return obj.stocking_record.fisherfolk_id if obj.stocking_record_id else None

    def get_object_creator_id(self, obj):
        return obj.logged_by_id


class StockingDisasterReportListCreateView(generics.ListCreateAPIView):
    """
    Evaluator-parity batch: CITIZEN may now report a disaster on their own
    stocking record — mirrors CropDisasterReportListCreateView in
    production/views.py. Validation (disaster type, area-affected cap,
    Total Loss) is entirely serializer-side and untouched.
    """
    serializer_class = FisheriesDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes
    pagination_class = None

    def get_target_owner_id(self, request):
        stocking_id = self.kwargs.get('stocking_id')
        try:
            return StockingRecord.objects.get(pk=stocking_id).fisherfolk_id
        except StockingRecord.DoesNotExist:
            return None

    def get_queryset(self):
        return FisheriesDisasterReport.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).prefetch_related('photos').order_by('-date_of_occurrence', '-id')

    def create(self, request, *args, **kwargs):
        # Same contract as the general (no-stock) disaster create: optional 0-10 `photos`, validated before
        # anything is saved, and report + photos + response built in one transaction.
        _check_fisherfolk_disaster_type(request)
        photos = _validated_damage_photos(request)
        serializer = self.get_serializer(data=_disaster_form_data(request))
        serializer.is_valid(raise_exception=True)
        stocking_id = self.kwargs['stocking_id']
        owner_id = StockingRecord.objects.filter(pk=stocking_id).values_list('fisherfolk_id', flat=True).first()
        data, created = _create_disaster_with_photos(self, serializer, photos, owner_id, stocking_id)
        return Response(data, status=drf_status.HTTP_201_CREATED if created else drf_status.HTTP_200_OK)

    def perform_create(self, serializer):
        stocking_id = self.kwargs['stocking_id']
        stocking = StockingRecord.objects.get(pk=stocking_id)
        assert_not_locked_by_other(self.request.user, 'stocking', stocking_id)
        if is_fisherfolk_citizen(self.request.user):
            # Their own log: submitted to Admin (and Admin notified) by _create_disaster_with_photos,
            # in the same transaction, once the photos are saved too.
            serializer.save(stocking_record_id=stocking_id, reported_by=self.request.user)
            return
        disaster = serializer.save(
            stocking_record_id=stocking_id,
            reported_by=self.request.user,
        )
        notify_staff(
            actor=self.request.user,
            verb='reported a disaster on',
            record_type='stocking',
            record_id=stocking_id,
            record_label=_stocking_record_label(stocking),
            detail=disaster.disaster_type,
        )
        if self.request.user.role != 'CITIZEN':
            notify_user(
                recipient=resolve_owner_user(fisherfolk_id=stocking.fisherfolk_id),
                actor=self.request.user,
                verb='reported a disaster on',
                record_type='stocking',
                record_id=stocking_id,
                record_label=_stocking_record_label(stocking),
                detail=disaster.disaster_type,
            )


def _stock_losses_payload(request):
    """`stock_losses` as a list: a JSON array in a JSON body, or a JSON-encoded string field in a multipart
    body (which is how the form sends it alongside the photo files)."""
    import json
    raw = request.data.get('stock_losses')
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raise ValidationError({'stock_losses': ['Invalid affected-stock data.']})
    return raw


class MultiStockDisasterReportCreateView(generics.CreateAPIView):
    """POST /fisheries/disaster-reports/stocks/ - ONE disaster log covering one or more of a fisherfolk's
    stocks, with the fingerlings lost (and Total Loss) per stock and pond/cage. Used by the fisherfolk's own
    Log Disaster and by Admin/Evaluator logging on a fisherfolk's behalf (same form, same rules).

    Owner: a fisherfolk citizen is always their own record (any `fisherfolk` sent is ignored); staff must
    send `fisherfolk`. Every stock is checked against that owner (disaster_reports.plan_stock_losses) before
    anything is saved. The report (stocking_record = the first stock, so every single-stock reader keeps
    working), its loss rows, Total Loss on the closed stocks, the photos and the submission/notification
    are ONE transaction - any failure leaves nothing behind. A stock-less (equipment only) log stays on
    /monitoring/fisherfolk-disasters/."""
    serializer_class = FisheriesDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def create(self, request, *args, **kwargs):
        _check_fisherfolk_disaster_type(request)
        owner_id = fisherfolk_scope(request.user)
        if owner_id is None:   # staff: the fisherfolk being logged for
            try:
                owner_id = int(request.data.get('fisherfolk'))
            except (TypeError, ValueError):
                raise ValidationError({'fisherfolk': ['Select a fisherfolk.']})
            if not Fisherfolk.objects.filter(pk=owner_id).exists():
                raise ValidationError({'fisherfolk': ['Fisherfolk not found.']})
        photos = _validated_damage_photos(request)
        self._plan = disaster_reports.plan_stock_losses(owner_id, _stock_losses_payload(request))
        primary = self._plan['stocks'][0]
        data = {k: v for k, v in dict(_disaster_form_data(request)).items()
                if k not in ('stock_losses', 'fisherfolk', 'is_total_loss', 'area_affected_ha')}
        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        data, created = _create_disaster_with_photos(self, serializer, photos, owner_id, primary.id)
        return Response(data, status=drf_status.HTTP_201_CREATED if created else drf_status.HTTP_200_OK)

    def perform_create(self, serializer):
        plan = self._plan
        primary = plan['stocks'][0]
        for s in plan['stocks']:
            assert_not_locked_by_other(self.request.user, 'stocking', s.id)
        # Report-level Total Loss only when EVERY affected stock was closed (it blocks "Mark Recovered").
        all_closed = set(plan['closes']) == {s.id for s in plan['stocks']}
        report = serializer.save(stocking_record=primary, reported_by=self.request.user, is_total_loss=all_closed)
        disaster_reports.save_stock_losses(report, plan)
        if is_fisherfolk_citizen(self.request.user):
            return   # submitted to Admin (and Admin notified) by _create_disaster_with_photos
        label = disaster_reports.affected_stocks_label(report)
        notify_staff(actor=self.request.user, verb='reported a disaster on', record_type='stocking',
                     record_id=primary.id, record_label=label, detail=report.disaster_type)
        notify_user(recipient=resolve_owner_user(fisherfolk_id=primary.fisherfolk_id), actor=self.request.user,
                    verb='reported a disaster on', record_type='stocking', record_id=primary.id,
                    record_label=label, detail=report.disaster_type)


class FisheriesDisasterResolveView(APIView):
    """
    Mark a disaster Recovered. Two paths:
      - All recommended response rules logged -> the usual nudge, no note required.
      - Anything else (incomplete, or zero rules — e.g. the stock recovered
        on its own with no intervention) -> a recovery_note is required so
        the gap is documented rather than silently closed. This used to
        hard-block recovery until every rule was logged, which left
        disasters stuck Active forever whenever nothing was actually done.
        Total Loss is terminal and can never be marked Recovered.

    Evaluator-parity batch: CITIZEN may resolve a disaster on their own
    record — mirrors CropDisasterResolveView in production/views.py. Same
    explicit-check rationale: plain APIView, no DRF object-permission hook
    to delegate to. Recovery logic below unchanged for every role.
    """
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes

    def post(self, request, pk):
        disaster = get_object_or_404(FisheriesDisasterReport, pk=pk)

        if request.user.role == 'CITIZEN':
            owner_fisherfolk_id = disaster.stocking_record.fisherfolk_id if disaster.stocking_record_id else None
            if request.user.linked_record_type != 'FISHERFOLK' or request.user.linked_record_id != owner_fisherfolk_id:
                return Response({'detail': 'You do not have permission to perform this action.'}, status=403)

        if disaster.status == 'Recovered':
            return Response({'detail': 'Disaster is already marked as recovered.'}, status=400)
        if disaster.is_total_loss:
            return Response({'detail': 'A Total Loss record cannot be marked as recovered.'}, status=400)
        blocked = disaster_reports.recovery_block_reason(disaster)      # everything affected is harvested or a total loss
        if blocked:
            return Response({'detail': blocked}, status=400)

        record = disaster.stocking_record
        rules_qs = FisheriesDisasterResponseRule.objects.filter(
            disaster_type=disaster.disaster_type,
        ).filter(
            Q(species=record.species) | Q(species__isnull=True)
        )
        activity_logs = FisheriesActivityLog.objects.filter(
            stocking_record=record
        ).values('activity', 'date_of_activity', 'disaster_report_id', 'disaster_rule_id')

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
        disaster.recovered_date = date.today()
        disaster.recovered_by = request.user
        disaster.recovery_note = recovery_note
        disaster.save(update_fields=['status', 'recovered_date', 'recovered_by', 'recovery_note'])
        serializer = FisheriesDisasterReportSerializer(disaster)
        return Response(serializer.data, status=200)


class StockingDisasterReportDeleteView(generics.DestroyAPIView):
    queryset = FisheriesDisasterReport.objects.all()
    permission_classes = [IsAuthenticated, IsAdmin]

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete disaster reports.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


# ─── General (fisherfolk-direct) Disaster Reports ─────────────────────────────
# Consolidated batch: for fisherfolk with no stocking cycle to attach a
# StockingDisasterReportListCreateView report to (Capture-type fisherfolk
# have no StockingRecord at all). Retired monitoring.FisherfolkDisasterReport's
# rows and endpoints were merged onto FisheriesDisasterReport so disaster
# reporting has one table instead of two unreconciled ones. Staff-only —
# same as the old model, no citizen self-service extension here.
#
# Scoped to stocking_record__isnull=True (fisherfolk-direct rows only) —
# cycle-attached disasters already have their own dedicated resolve/delete
# surface (StockingDisasterReportDeleteView / FisheriesDisasterResolveView,
# with the response-rule engine behind it) inside the aquaculture cycle
# detail view. Showing them here too, editable through this simpler
# no-rules-checked path, would recreate the exact two-inconsistent-paths
# problem this consolidation is meant to remove.

def _fisherfolk_disaster_label(fisherfolk):
    barangay = fisherfolk.barangay or ''
    return f'{fisherfolk.full_name}, {barangay}' if barangay else fisherfolk.full_name


def _general_disaster_data(request):
    """A fisherfolk citizen's disaster data with `fisherfolk` forced to their own record (never trusted
    from the request); staff data unchanged. Built as a plain dict rather than request.data.copy(): a
    multipart request carries uploaded files, and QueryDict.copy() deep-copies them, which fails for large
    (temporary-file) uploads. The multi-photo `photos` files are handled separately by the view."""
    owner = fisherfolk_scope(request.user)
    if owner is None:
        return request.data
    if hasattr(request.data, 'getlist'):   # form / multipart: one value per field (photos excluded)
        data = {k: request.data.get(k) for k in request.data.keys() if k != 'photos'}
    else:
        data = dict(request.data)
    data['fisherfolk'] = owner
    return data


# Fisherfolk accounts report aquaculture disasters only: no Disease Outbreak (disease goes through the
# Health Log / Force Harvest). Staff keep every FisheriesDisasterReport type.
FISHERFOLK_DISASTER_TYPES = ('Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Other')


# A fisherfolk may only record recovery on a logged disaster, never change its content.
FISHERFOLK_RECOVERY_FIELDS = ('status', 'recovery_note')


def _check_fisherfolk_disaster_type(request):
    if not is_fisherfolk_citizen(request.user):
        return
    disaster_type = request.data.get('disaster_type')
    if disaster_type and disaster_type not in FISHERFOLK_DISASTER_TYPES:
        raise ValidationError({'disaster_type': ['This disaster type is not available for fisherfolk reports.']})


def _disaster_form_data(request):
    """request.data minus the multi-photo `photos` files, as a plain dict for multipart (QueryDict.copy()
    would deep-copy the uploaded files, which fails for large temporary-file uploads)."""
    if hasattr(request.data, 'getlist'):
        return {k: request.data.get(k) for k in request.data.keys() if k != 'photos'}
    return request.data


_discard_uploaded_files = discard_uploaded_files   # the shared cleanup helper (core/photos.py)


def _create_disaster_with_photos(view, serializer, photos, owner_fisherfolk_id, stocking_record_id=None):
    """Save the log (view.perform_create), then each photo as its own row, then - for a fisherfolk's own
    log - submit it to Admin (submitted_at/by + Admin notification), then build the response. All in ONE
    transaction: a failure anywhere leaves no log, no photos, no submission, no notification and (via the
    cleanup below) no orphaned files.

    The owner's row is locked first, so a repeat of the same log moments later (double click, browser or
    network retry) finds the one already saved and returns it instead of creating a second log/notification.
    Returns (response data, created)."""
    user = view.request.user
    written = []
    try:
        with transaction.atomic():
            disaster_reports.lock_owner(owner_fisherfolk_id)
            plan = getattr(view, '_plan', None)   # multi-stock log: its loss rows are part of "the same log"
            existing = disaster_reports.find_recent_duplicate(
                user, owner_fisherfolk_id, stocking_record_id, serializer.validated_data,
                stock_loss_rows=plan['rows'] if plan else None,
            )
            if existing is not None:
                return view.get_serializer(existing).data, False
            view.perform_create(serializer)
            report = serializer.instance
            if report.photo:
                written.append(report.photo.name)
            # Each photo is its own row/file on THIS (just created, ownership-checked) log.
            for f in photos:
                row = FisheriesDisasterReportPhoto.objects.create(disaster_report=report, image=f, uploaded_by=user)
                written.append(row.image.name)
            if is_fisherfolk_citizen(user):
                # The fisherfolk's Log Disaster IS the submission - there is no separate submit step.
                disaster_reports.submit_on_log(report, user)
            return view.get_serializer(report).data, True
    except Exception:
        _discard_uploaded_files(written)
        raise


def _validated_damage_photos(request):
    """The multipart `photos` files of a disaster report: optional (0 is fine), at most
    FisheriesDisasterReportPhoto.MAX_PER_REPORT, each checked by the project's image rules
    (JPG/PNG/WEBP, 5 MB). Raises ValidationError so nothing is saved when any photo is invalid."""
    return validated_photos(request, 'photos', limit=FisheriesDisasterReportPhoto.MAX_PER_REPORT)


class GeneralDisasterReportListCreateView(generics.ListCreateAPIView):
    serializer_class = GeneralDisasterReportSerializer
    # Fisherfolk citizens: their own disaster reports only, and new reports are always their own.
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        qs = scope_to_fisherfolk(FisheriesDisasterReport.objects.all(), self.request.user).filter(
            stocking_record__isnull=True,
        ).select_related('fisherfolk').prefetch_related('photos').order_by('-date_of_occurrence', '-id')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        if params.get('disaster_type'):
            qs = qs.filter(disaster_type=params['disaster_type'])
        return qs

    def create(self, request, *args, **kwargs):
        _check_fisherfolk_disaster_type(request)
        photos = _validated_damage_photos(request)          # 0-10 valid photos, or nothing is saved
        serializer = self.get_serializer(data=_general_disaster_data(request))
        serializer.is_valid(raise_exception=True)
        # A disaster needs a pond or cage to report on: nobody (the fisherfolk or staff on their behalf) can log
        # a disaster for a fisherfolk who has none.
        if not fisherfolk_has_ponds(serializer.validated_data['fisherfolk'].pk):
            return Response({'detail': NO_PONDS_MESSAGE}, status=drf_status.HTTP_400_BAD_REQUEST)
        # The report, its photos AND the response data are built in ONE transaction: if anything fails
        # (e.g. a photo row, or reading the photos back), the report is rolled back too - the user is never
        # told "failed" for a report that was in fact saved, and there are no half-saved reports. Photos can
        # never be attached to anyone else's report, since there is no photo endpoint taking an id.
        owner_id = serializer.validated_data['fisherfolk'].pk
        data, created = _create_disaster_with_photos(self, serializer, photos, owner_id)
        return Response(data, status=drf_status.HTTP_201_CREATED if created else drf_status.HTTP_200_OK)

    def perform_create(self, serializer):
        if is_fisherfolk_citizen(self.request.user):
            # Their own log: submitted to Admin (and Admin notified) by _create_disaster_with_photos.
            serializer.save(reported_by=self.request.user)
            return
        disaster = serializer.save(reported_by=self.request.user)
        notify_staff(
            actor=self.request.user,
            verb='reported a disaster on',
            record_type='fisherfolk_disaster',
            record_id=disaster.fisherfolk_id,
            record_label=_fisherfolk_disaster_label(disaster.fisherfolk),
            detail=disaster.disaster_type,
        )
        if self.request.user.role == 'CITIZEN':
            return   # the fisherfolk reported it themselves - no need to notify them about it
        notify_user(
            recipient=resolve_owner_user(fisherfolk_id=disaster.fisherfolk_id),
            actor=self.request.user,
            verb='reported a disaster on',
            record_type='fisherfolk_disaster',
            record_id=disaster.fisherfolk_id,
            record_label=_fisherfolk_disaster_label(disaster.fisherfolk),
            detail=disaster.disaster_type,
        )


class DisasterEligibilityView(APIView):
    """Can a disaster be logged for this fisherfolk? A fisherfolk account asks about itself; staff pass
    ?fisherfolk=<id>. The screens use it to explain the rule up front (see fisheries/eligibility.py)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        owner = fisherfolk_scope(request.user)
        fisherfolk_id = owner if owner is not None else request.query_params.get('fisherfolk')
        try:
            fisherfolk_id = int(fisherfolk_id)
        except (TypeError, ValueError):
            return Response({'detail': 'fisherfolk is required.'}, status=drf_status.HTTP_400_BAD_REQUEST)
        has_ponds = fisherfolk_has_ponds(fisherfolk_id)
        return Response({
            'fisherfolk': fisherfolk_id,
            'has_ponds': has_ponds,
            'can_log_disaster': has_ponds,
            'message': None if has_ponds else NO_PONDS_MESSAGE,
        })


class GeneralDisasterReportDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = GeneralDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    fisherfolk_blocked_methods = ('DELETE',)   # deleting disaster reports stays Admin-only (destroy below)
    http_method_names = ['get', 'patch', 'delete']

    def get_queryset(self):
        return scope_to_fisherfolk(FisheriesDisasterReport.objects.all(), self.request.user).filter(
            stocking_record__isnull=True,
        ).select_related('fisherfolk').prefetch_related('photos')

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        instance = self.get_object()
        if is_fisherfolk_citizen(request.user):
            # A fisherfolk's log is submitted to Admin when it is logged, so its content is read-only to
            # them. Only the disaster's recovery lifecycle (status / recovery_note - what Mark Recovered
            # does for stock logs) may move. Office staff keep full edit rights.
            changed = [k for k in request.data.keys() if k not in FISHERFOLK_RECOVERY_FIELDS]
            if changed or getattr(request, 'FILES', None):
                return Response({'detail': disaster_reports.READ_ONLY_MESSAGE}, status=drf_status.HTTP_403_FORBIDDEN)
        serializer = self.get_serializer(instance, data=_general_disaster_data(request), partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete disaster reports.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)

    def perform_update(self, serializer):
        # No stocking cycle means no species/activity logs to check
        # response-rule completeness against, so — unlike
        # FisheriesDisasterResolveView — reaching Recovered here always
        # needs a manual recovery_note, with no auto-complete path.
        instance = serializer.instance
        new_status = serializer.validated_data.get('status', instance.status)
        if new_status == 'Recovered' and instance.status != 'Recovered':
            recovery_note = (serializer.validated_data.get('recovery_note') or '').strip()
            if not recovery_note:
                raise ValidationError({'recovery_note': 'A recovery note is required to mark this Recovered.'})
            serializer.save(recovered_date=date.today(), recovered_by=self.request.user)
        else:
            serializer.save()


# ─── Disaster Logs (list / details / PDF) ──────────────────────────────────────
# One surface for BOTH kinds of FisheriesDisasterReport (stock-attached and general). Fisherfolk reach only
# their own logs - anything else is a 404, whatever id is put in the URL - and staff reach every log.
# All read-only: logs are created through the two create endpoints above.

def _scoped_disaster_reports(user):
    qs = disaster_reports.report_queryset()
    if user.role in STAFF_ROLES:
        return qs
    owner = user.get_linked_fisherfolk_id()
    return qs.filter(Q(fisherfolk_id=owner) | Q(stocking_record__fisherfolk_id=owner))


class FisheriesDisasterReportListView(APIView):
    """Disaster log rows. Fisherfolk: their own. Staff: every fisherfolk's (Admin > Disaster > Fisheries).
    Filters: search (fisherfolk, species, type, reference no.), barangay, disaster_type, status, year,
    submission. With ?page= the response is paginated ({count, page, page_size, results}); without it, a
    plain list."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    PAGE_SIZE = 20

    def get(self, request):
        qs = _scoped_disaster_reports(request.user)
        params = request.query_params
        submission = params.get('submission')
        if submission in FisheriesDisasterReport.SubmissionStatus.values:
            qs = qs.filter(submission_status=submission)
        if params.get('disaster_type'):
            qs = qs.filter(disaster_type=params['disaster_type'])
        if params.get('status') in ('Active', 'Recovered'):
            qs = qs.filter(status=params['status'])
        if is_plain_int(params.get('year', '')):
            qs = qs.filter(date_of_occurrence__year=int(params['year']))
        if params.get('barangay'):
            b = params['barangay']
            qs = qs.filter(Q(fisherfolk__barangay__iexact=b) | Q(stocking_record__fisherfolk__barangay__iexact=b))
        search = (params.get('search') or '').strip()
        if search:
            match = (Q(fisherfolk__first_name__icontains=search) | Q(fisherfolk__last_name__icontains=search)
                     | Q(stocking_record__fisherfolk__first_name__icontains=search)
                     | Q(stocking_record__fisherfolk__last_name__icontains=search)
                     | Q(stocking_record__species__species_name__icontains=search)
                     | Q(disaster_type__icontains=search) | Q(disaster_type_other_specify__icontains=search)
                     # any affected stock of a multi-stock log (a subquery, so a log is never listed twice)
                     | Q(pk__in=FisheriesDisasterStockLoss.objects.filter(
                         stocking_record__species__species_name__icontains=search).values('disaster_report_id')))
            ref = search.upper().replace('FDR-', '').split('-')[-1]
            if is_plain_int(ref):
                match |= Q(pk=int(ref))
            qs = qs.filter(match)
        if submission == FisheriesDisasterReport.SubmissionStatus.SUBMITTED:
            qs = qs.order_by('-submitted_at', '-id')
        else:
            qs = qs.order_by('-date_reported', '-id')
        if not params.get('page'):
            return Response([disaster_reports.report_list_row(r) for r in qs])
        try:
            page = max(1, int(params['page']))
        except ValueError:
            page = 1
        count = qs.count()
        rows = qs[(page - 1) * self.PAGE_SIZE: page * self.PAGE_SIZE]
        return Response({'count': count, 'page': page, 'page_size': self.PAGE_SIZE,
                         'results': [disaster_reports.report_list_row(r) for r in rows]})


class FisheriesDisasterReportDocumentView(APIView):
    """The complete disaster log (Disaster Details; also what Print and the PDF are built from)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, pk):
        report = get_object_or_404(_scoped_disaster_reports(request.user), pk=pk)
        return Response(disaster_reports.report_document(report, request))

class FisheriesDisasterReportPdfView(APIView):
    """The saved disaster log as a real PDF file (read-only - nothing is created or changed)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, pk):
        report = get_object_or_404(_scoped_disaster_reports(request.user), pk=pk)
        doc = disaster_reports.report_document(report, request)
        try:
            pdf_bytes = disaster_reports.build_report_pdf(report, doc)
        except Exception:
            logger.exception('Disaster report PDF failed for report %s', report.pk)
            return Response({'detail': 'The PDF could not be generated. The disaster log was not changed - please try again.'},
                            status=drf_status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf_bytes, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{doc["pdf_filename"]}"'
        response['Cache-Control'] = 'no-store'
        return response


class StockingHarvestListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesHarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes
    pagination_class = None

    def _stocking(self):
        """The stocking record of this URL, read once per request (the permission check, the harvest
        pre-checks and the serializer all use the same row instead of each querying it again)."""
        if not hasattr(self, '_stocking_cache'):
            self._stocking_cache = StockingRecord.objects.filter(pk=self.kwargs.get('stocking_id')).first()
        return self._stocking_cache

    def get_target_owner_id(self, request):
        record = self._stocking()
        return record.fisherfolk_id if record else None

    def get_serializer_context(self):
        context = super().get_serializer_context()
        if self.request.method == 'POST':
            # Already loaded by create(); validate() reuses them rather than querying them again.
            context['stocking_record'] = self._stocking()
            context['harvest_units'] = getattr(self, '_harvest_units_cache', None)
        return context

    def get_queryset(self):
        return FisheriesHarvestRecord.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-harvest_date')

    def create(self, request, *args, **kwargs):
        stocking_id = kwargs.get('stocking_id')
        try:
            record = self._stocking()
            if record is None:
                raise StockingRecord.DoesNotExist
            if record.status == StockingRecord.Status.TOTAL_LOSS:
                return Response(
                    {'detail': 'Cannot record harvest for a Total Loss record — the stock was completely destroyed.'},
                    status=drf_status.HTTP_400_BAD_REQUEST,
                )
            # A cycle is harvested once: no further harvest (partial or final) after the final one.
            if record.status == StockingRecord.Status.HARVESTED or record.harvests.filter(is_final=True).exists():
                return Response(
                    {'detail': 'This production cycle has already been harvested. A harvest cannot be recorded twice.'},
                    status=drf_status.HTTP_400_BAD_REQUEST,
                )
            # date_stocked is only an approximation for records with
            # date_stocked_is_estimated=True (see the field's own comment) —
            # the 50%-duration math below would be measuring against a
            # made-up start date, so this blocks outright rather than gating
            # by a duration that means nothing yet. Mirrors
            # HarvestRecordCreateView.create()'s identical block on the crop side.
            if record.date_stocked_is_estimated:
                return Response(
                    {'detail': (
                        'This record\'s stocking date is an estimate, not a confirmed field date. '
                        'Harvest cannot be recorded until a staff member confirms or corrects the '
                        'real stocking date.'
                    )},
                    status=drf_status.HTTP_400_BAD_REQUEST,
                )
            # Force Harvest (an affected pond/cage still awaiting harvest, per the cycle's Health Log)
            # lifts only this waiting rule, so it can be recorded before half the culture duration.
            # Naming ponds/cages is NOT enough: a normal harvest of selected units stays gated. Only a
            # selection that is an actual Force Harvest (every unit awaiting Force Harvest) is exempt.
            is_gated, message = harvest_gate_status(record.date_stocked, record.expected_harvest_date)
            requested_units = request.data.get('production_units')
            if not requested_units and isinstance(request.data.get('unit_quantities'), list):
                # A per-unit harvest names its ponds/cages through unit_quantities instead.
                requested_units = [row.get('production_unit') for row in request.data['unit_quantities'] if isinstance(row, dict)]
            if requested_units and record.production_cycle_id:
                # The ponds/cages' harvest status, computed once for this request: the gate below and the
                # serializer's validation (via get_serializer_context) both use it.
                self._harvest_units_cache = record.harvest_units()
            if is_gated:
                if requested_units:
                    if not record.is_force_harvest_selection(requested_units, getattr(self, '_harvest_units_cache', None)):
                        return Response({'detail': message}, status=drf_status.HTTP_400_BAD_REQUEST)
                else:
                    # Force Harvest is unit-specific: one affected pond must NOT unlock a normal harvest of the
                    # whole cycle before 50%. The only exception is the legacy case of a mortality/disease log
                    # that was never tied to any pond/cage (cycle-level behaviour, as before).
                    from monitoring.models import cycle_force_status
                    _, legacy_unassigned_force = cycle_force_status(record.production_cycle_id)
                    if not legacy_unassigned_force:
                        return Response({'detail': message}, status=drf_status.HTTP_400_BAD_REQUEST)
        except StockingRecord.DoesNotExist:
            pass
        assert_not_locked_by_other(request.user, 'stocking', stocking_id)
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        stocking_id = self.kwargs['stocking_id']
        harvest = serializer.save(
            stocking_record_id=stocking_id,
            recorded_by=self.request.user,
        )
        if harvest.is_final:
            StockingRecord.objects.filter(pk=stocking_id).update(
                status=StockingRecord.Status.HARVESTED
            )
        # The response: the saved harvest with its ponds/cages and per-unit rows prefetched, so the
        # serializer does not look each unit up one by one.
        serializer.instance = FisheriesHarvestRecord.objects.select_related(
            'stocking_record__fisherfolk', 'stocking_record__species', 'stocking_record__production_cycle', 'recorded_by',
        ).prefetch_related('production_units', 'unit_harvests__production_unit').get(pk=harvest.pk)
        if harvest.is_force_harvest:
            # ONE "Force Harvest Recorded" notification for the event (owner + staff), once it commits. It
            # replaces the generic "recorded a harvest" message below for the owner.
            queue_force_harvest(serializer.instance, self.request.user)
            return
        stocking = StockingRecord.objects.get(pk=stocking_id)
        if self.request.user.role != 'CITIZEN':
            notify_user(
                recipient=resolve_owner_user(fisherfolk_id=stocking.fisherfolk_id),
                actor=self.request.user,
                verb='recorded a harvest for',
                record_type='stocking',
                record_id=stocking_id,
                record_label=_stocking_record_label(stocking),
                detail=f'{harvest.quantity_kg} kg',
            )


class StockingHarvestDetailView(generics.RetrieveUpdateAPIView):
    """Batch 11: mirrors HarvestRecordDetailView in production/views.py for the fisheries side."""
    queryset = FisheriesHarvestRecord.objects.select_related('stocking_record')
    serializer_class = FisheriesHarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_owner_id(self, obj):
        return obj.stocking_record.fisherfolk_id if obj.stocking_record_id else None

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


def harvest_variance(estimated_kg, actual_kg, harvest_count):
    """Actual vs estimated harvest. difference_kg needs a harvest and an estimate; variance_pct also needs
    a non-zero estimate: ((actual - estimated) / estimated) * 100. Nothing is computed from other values."""
    if not harvest_count or estimated_kg is None:
        return None, None
    difference = actual_kg - estimated_kg
    pct = None if estimated_kg == 0 else float(difference / estimated_kg * Decimal('100'))
    return difference, pct


class StockingVarianceDetailsView(APIView):
    """Read-only data for the Forecasting "Harvest Variance Details" modal of ONE stocking record: the
    estimate, the actual total (the same SUM(FisheriesHarvestRecord.quantity_kg) as total_harvested_kg -
    FisheriesHarvestUnit rows are only listed, never added again), the harvest records with their units,
    type, date and reason, and the Health Log / Feeding Log entries of THIS record's own production cycle.
    It only lists recorded data; no cause is inferred.
    A fisherfolk citizen can open only their own records (another id is a 404); the activities listed
    always belong to that record's own cycle."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, pk):
        from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, cycle_force_status
        rec = get_object_or_404(scope_to_fisherfolk(StockingRecord.objects.all(), request.user), pk=pk)
        unit_label = lambda u: f'{u.get_unit_type_display()} {u.unit_number}'
        harvests = list(rec.harvests.prefetch_related('production_units', 'unit_harvests__production_unit').order_by('harvest_date', 'id'))
        actual = sum((h.quantity_kg for h in harvests), Decimal('0'))
        # The variance compares the harvest recorded SO FAR with the estimate, whether or not the cycle is
        # fully harvested; is_fully_harvested (final harvest recorded) only tells the UI how to word it.
        is_fully_harvested = rec.status == StockingRecord.Status.HARVESTED
        difference, pct = harvest_variance(rec.estimated_harvest_kg, actual, len(harvests))
        force_reasons, _ = cycle_force_status(rec.production_cycle_id)

        # Per unit of each Force Harvest: that unit's own harvested kg (when recorded per unit), so a
        # Health Log row can show the harvest it led to.
        force_harvest_by_unit = {}
        harvest_rows = []
        for h in harvests:
            kg_by_unit = {row.production_unit_id: row.quantity_kg for row in h.unit_harvests.all()}
            units = []
            for u in sorted(h.production_units.all(), key=lambda x: x.unit_number):
                kg = kg_by_unit.get(u.id)
                units.append({
                    'production_unit': u.id, 'label': unit_label(u),
                    'quantity_kg': str(kg) if kg is not None else None,     # None: older combined record
                    # Force Harvest reason = that unit's OWN Health Log observation(s).
                    'health_reasons': force_reasons.get(u.id, []) if h.is_force_harvest else [],
                })
                if h.is_force_harvest:
                    force_harvest_by_unit[u.id] = {'harvest_id': h.id, 'harvest_date': str(h.harvest_date),
                                                   'quantity_kg': str(kg) if kg is not None else None}
            timing, timing_days = harvest_timing(h.harvest_date, rec.expected_harvest_date)
            harvest_rows.append({
                'id': h.id, 'harvest_date': str(h.harvest_date),
                # Each record's own timing (same rule as Record Harvest); its reason is early_late_reason.
                'harvest_timing': timing, 'harvest_timing_label': HARVEST_TIMING_LABELS.get(timing),
                'harvest_timing_days': timing_days,
                'harvest_type': 'Force' if h.is_force_harvest else 'Normal',
                'is_final': h.is_final, 'quantity_kg': str(h.quantity_kg),
                'reason': h.early_late_reason,       # the saved text itself (a custom "Other" reason included)
                'area_or_units_harvested': h.area_or_units_harvested, 'notes': h.notes,
                'units': units,
            })

        # EVERY pond/cage of this record's cycle (from AquacultureProductionUnit, not from the harvest links,
        # so never-harvested units are included), with its state from the existing harvest data
        # (StockingRecord.harvest_units) and its own recorded kg. A unit that is not harvested has no
        # actual harvest (None, never 0); a unit inside an older combined record has no own kg either.
        unit_kg = {}
        combined_units = set()
        for h in harvests:
            rows = {row.production_unit_id: row.quantity_kg for row in h.unit_harvests.all()}
            for u in h.production_units.all():
                if u.id in rows:
                    unit_kg[u.id] = unit_kg.get(u.id, Decimal('0')) + rows[u.id]
                else:
                    combined_units.add(u.id)
        unit_status_rows = []
        for u in rec.harvest_units():
            status = 'force_harvested' if u['force_harvested'] else 'harvested' if u['harvested'] else 'still_stocked'
            kg = unit_kg.get(u['id']) if u['harvested'] else None
            unit_status_rows.append({
                'id': u['id'], 'name': u['label'], 'status': status,
                'actual_harvest_kg': str(kg) if kg is not None else None,
                'in_combined_harvest': u['harvested'] and kg is None and u['id'] in combined_units,
            })

        health_rows, feeding_rows = [], []
        if rec.production_cycle_id:   # activities of THIS cycle only - never another cycle or fisherfolk
            for log in AquacultureHealthLog.objects.filter(production_cycle_id=rec.production_cycle_id) \
                    .select_related('production_unit').order_by('log_date', 'id'):
                health_rows.append({
                    'id': log.id, 'log_date': str(log.log_date),
                    'production_unit': log.production_unit_id,
                    'unit_label': unit_label(log.production_unit) if log.production_unit else None,
                    'observation': log.observation, 'mortality_count': log.mortality_count,
                    'treatment_applied': log.treatment_applied, 'notes': log.notes,
                    'force_harvest': log.force_harvest,
                    # The Force Harvest record of this log's unit, if one was recorded.
                    'force_harvest_record': force_harvest_by_unit.get(log.production_unit_id),
                })
            for log in AquacultureFeedingLog.objects.filter(production_cycle_id=rec.production_cycle_id) \
                    .prefetch_related('unit_quantities__production_unit').order_by('feeding_date', 'id'):
                feeding_rows.append({
                    'id': log.id, 'feeding_date': str(log.feeding_date), 'feed_type': log.feed_type,
                    'quantity_kg': str(log.quantity_kg), 'notes': log.notes,
                    'units': [{'production_unit': q.production_unit_id, 'label': unit_label(q.production_unit),
                               'quantity_kg': str(q.quantity_kg)} for q in log.unit_quantities.all()],
                })

        activity_dates = [r['harvest_date'] for r in harvest_rows] + [r['log_date'] for r in health_rows] \
            + [r['feeding_date'] for r in feeding_rows]
        return Response({
            'stocking_record': rec.id,
            'production_cycle': rec.production_cycle_id,
            'estimated_kg': str(rec.estimated_harvest_kg) if rec.estimated_harvest_kg is not None else None,
            'estimated_harvest_date': str(rec.expected_harvest_date) if rec.expected_harvest_date else None,
            'actual_total_kg': str(actual),
            'harvest_count': len(harvests),
            'status': rec.status,
            'is_fully_harvested': is_fully_harvested,
            'production_units': unit_status_rows,
            'difference_kg': str(difference) if difference is not None else None,
            'variance_pct': pct,
            'period': {'from': str(rec.date_stocked) if rec.date_stocked else None,
                       'to': max(activity_dates) if activity_dates else None},
            'harvests': harvest_rows,
            'health_logs': health_rows,
            'feeding_logs': feeding_rows,
        })


class StockingProductionUnitsView(APIView):
    """Read-only rows for the Fisheries Monitoring expandable cycle row: every pond/cage of ONE stocking
    record's production cycle with its dimensions, area, fingerlings, estimate, actual harvest, harvest
    date and status. Everything comes from recorded data:
      - unit fields from AquacultureProductionUnit;
      - estimated kg = the shared calculate_estimated_harvest_kg() formula applied to the unit's OWN
        fingerling_count with the record's survival rate / ABW (the same inputs as the record's estimate,
        never an even split of it); None when an input is missing;
      - actual kg = the unit's own FisheriesHarvestUnit rows; a unit inside an older combined harvest has
        no own kg (None + in_combined_harvest) - no split is invented;
      - status from StockingRecord.harvest_units() rules.
    A fisherfolk citizen can open only their own records (another id is a 404)."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, pk):
        from monitoring.models import AquacultureProductionUnit
        rec = get_object_or_404(scope_to_fisherfolk(StockingRecord.objects.all(), request.user), pk=pk)
        if not rec.production_cycle_id:
            return Response({'stocking_record': rec.id, 'production_cycle': None, 'units': []})
        units = list(AquacultureProductionUnit.objects.filter(production_cycle_id=rec.production_cycle_id).order_by('unit_type', 'unit_number'))
        harvests = rec.harvests.prefetch_related('production_units', 'unit_harvests')
        unit_kg, unit_dates, combined_units = {}, {}, set()
        for h in harvests:
            rows = {row.production_unit_id: row.quantity_kg for row in h.unit_harvests.all()}
            for u in h.production_units.all():
                unit_dates.setdefault(u.id, set()).add(h.harvest_date)
                if u.id in rows:
                    unit_kg[u.id] = unit_kg.get(u.id, Decimal('0')) + rows[u.id]
                else:
                    combined_units.add(u.id)
        status_by_id = {u['id']: u for u in rec.harvest_units()}
        record_closed = rec.status in (StockingRecord.Status.HARVESTED, StockingRecord.Status.TOTAL_LOSS)
        out = []
        for u in units:
            st = status_by_id.get(u.id, {})
            if st.get('force_harvested'):
                status = 'force_harvested'
            elif st.get('harvested'):
                status = 'harvested'
            elif record_closed:
                # The record was closed (final harvest without this unit listed, or Total Loss): the unit is
                # not still growing, but no unit-level harvest exists for it.
                status = 'total_loss' if rec.status == StockingRecord.Status.TOTAL_LOSS else 'cycle_harvested'
            elif st.get('force_harvest'):
                status = 'awaiting_force_harvest'
            else:
                status = 'in_progress'
            estimate = calculate_estimated_harvest_kg(u.fingerling_count, rec.survival_rate_pct, rec.avg_body_weight_kg)
            kg = unit_kg.get(u.id)
            dates = sorted(unit_dates.get(u.id, ()))
            out.append({
                'id': u.id, 'label': f'{u.get_unit_type_display()} {u.unit_number}', 'unit_type': u.unit_type,
                'unit_number': u.unit_number,
                'length_m': str(u.length_m) if u.length_m is not None else None,
                'width_m': str(u.width_m) if u.width_m is not None else None,
                'size_sqm': str(u.size_sqm) if u.size_sqm is not None else None,
                'fingerling_count': u.fingerling_count,
                'estimated_harvest_kg': str(estimate) if estimate is not None else None,
                'actual_harvest_kg': str(kg) if kg is not None else None,
                'in_combined_harvest': u.id in combined_units and kg is None,
                'harvest_dates': [str(d) for d in dates],
                'status': status,
                'force_harvest_reasons': st.get('reasons', []),
            })
        return Response({'stocking_record': rec.id, 'production_cycle': rec.production_cycle_id, 'units': out})


class StockingHarvestDeleteView(generics.DestroyAPIView):
    """Admin-only: delete a harvest record; if it was the final harvest, reopen the stocking cycle."""
    queryset = FisheriesHarvestRecord.objects.select_related('stocking_record')
    permission_classes = [IsAuthenticated, IsAdmin]

    def perform_destroy(self, instance):
        stocking = instance.stocking_record
        was_final = instance.is_final
        instance.delete()
        if was_final:
            # Revert to For Harvest only if no other final harvest remains
            still_final = FisheriesHarvestRecord.objects.filter(
                stocking_record=stocking, is_final=True
            ).exists()
            if not still_final:
                stocking.status = stocking.determine_status()
                stocking.save(update_fields=['status'])


# ─── Activity Suggestions ─────────────────────────────────────────────────────

class FisheriesActivitySuggestionsView(APIView):
    # Widened to match the crop side, which was widened in Batch E while this
    # was left staff-only. A fisherfolk citizen could not read suggestions for
    # their OWN pond, so the home screen's feeding hero and the disaster
    # recommendation checklist both silently degraded to empty on a 403.
    # ADMIN/EVALUATOR access is unchanged - this class is a strict superset -
    # and the response shape is untouched. Ownership is resolved by hand below
    # for the same reason the crop view does it: this is a plain APIView with
    # no queryset for DRF's object-level machinery to hook into.
    permission_classes = [IsAuthenticated, IsStaffOrOwnRecordCitizen]
    owner_record_type = 'FISHERFOLK'   # owner ids here are Fisherfolk pks - a Farmer-linked citizen never passes

    def get_target_owner_id(self, request):
        stocking_id = self.kwargs.get('stocking_id')
        try:
            return StockingRecord.objects.get(pk=stocking_id).fisherfolk_id
        except StockingRecord.DoesNotExist:
            return None

    def get(self, request, stocking_id):
        record = get_object_or_404(
            StockingRecord.objects.select_related('species'),
            pk=stocking_id,
        )

        stages = SpeciesActivityStage.objects.filter(
            species_option=record.species
        ).order_by('day_after_stocking')

        activity_logs = list(
            FisheriesActivityLog.objects.filter(
                stocking_record=record
            ).values('id', 'activity', 'date_of_activity', 'target_day',
                      'disaster_report_id', 'disaster_rule_id')
        )

        today = date.today()
        days_elapsed = (today - record.date_stocked).days if record.date_stocked else 0
        total_days = record.species.culture_duration_days if record.species else 0
        stocked = record.date_stocked
        is_total_loss = record.status == StockingRecord.Status.TOTAL_LOSS

        suggestions = []
        # Skipped when date_stocked is only an estimate — day-based due dates
        # would be measured against a made-up start date. Same exclusion as
        # CropActivitySuggestionsView's date_planted_is_estimated guard.
        if not is_total_loss and not record.date_stocked_is_estimated:
            for stage in stages:
                days_list = stage.application_days if stage.application_days else [stage.day_after_stocking]
                for occurrence_day in days_list:
                    due_date = stocked + timedelta(days=occurrence_day) if stocked else None
                    days_diff = occurrence_day - days_elapsed

                    is_done = False
                    done_date = None
                    if due_date:
                        window = stage.window_days
                        for log in activity_logs:
                            if log['activity'] != stage.activity_name:
                                continue
                            target_match = log.get('target_day') is not None and log['target_day'] == occurrence_day
                            date_match = abs((log['date_of_activity'] - due_date).days) <= window
                            if target_match or date_match:
                                is_done = True
                                done_date = log['date_of_activity'].isoformat()
                                break

                    if is_done:
                        item_status = 'done'
                    elif days_diff < -stage.window_days:
                        item_status = 'overdue'
                    elif abs(days_diff) <= stage.window_days:
                        item_status = 'due_now'
                    else:
                        item_status = 'upcoming'

                    suggestions.append({
                        'id': stage.id,
                        'occurrence_key': f'{stage.id}_{occurrence_day}',
                        'activity_name': stage.activity_name,
                        'day_after_stocking': occurrence_day,
                        'recommendation': stage.recommendation,
                        'priority': stage.priority,
                        'window_days': stage.window_days,
                        'status': item_status,
                        'is_completed': is_done,
                        'done_date': done_date,
                        'days_diff': days_diff,
                    })

            suggestions.sort(key=lambda s: s['day_after_stocking'])

        active_disasters = list(
            FisheriesDisasterReport.objects.filter(
                stocking_record=record, status='Active',
            ).order_by('-date_of_occurrence')
        )
        disaster_response = []
        for disaster in active_disasters:
            rules_qs = FisheriesDisasterResponseRule.objects.filter(
                disaster_type=disaster.disaster_type,
            ).filter(
                Q(species=record.species) | Q(species__isnull=True)
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
                'can_recover': disaster.status == 'Active' and disaster_reports.recovery_block_reason(disaster) is None,
                'recovery_block_reason': disaster_reports.recovery_block_reason(disaster) if disaster.status == 'Active' else None,
                'all_rules_done': all_rules_done,
                'rules': rules_list,
            })

        return Response({
            'days_elapsed': days_elapsed,
            'total_days': total_days,
            'is_total_loss': is_total_loss,
            'date_stocked_is_estimated': record.date_stocked_is_estimated,
            'suggestions': suggestions,
            'disaster_response': disaster_response,
        })


# ─── Legacy Capture Fishing / Vessel / Assistance ─────────────────────────────
# Relocated from monitoring app (Phase 3 of the fisheries merge).

# Capture Fishing: Admin/Evaluator see every catch log (unchanged); a fisherfolk citizen sees and records
# only their own, and their summary aggregates only their own trips.

def _trip_queryset(user):
    return scope_to_fisherfolk(FishingTripLog.objects.all(), user)


def _with_own_fisherfolk_trip(request):
    owner = fisherfolk_scope(request.user)
    if owner is None:
        return request.data
    data = request.data.copy()
    data['fisherfolk'] = owner
    return data


class FishingTripLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FishingTripLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    pagination_class = None

    def get_queryset(self):
        qs = _trip_queryset(self.request.user).select_related(
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

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=_with_own_fisherfolk_trip(request))
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=drf_status.HTTP_201_CREATED)

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FishingTripLogDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FishingTripLogSerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]
    fisherfolk_blocked_methods = ('DELETE',)   # deleting catch logs stays Admin-only (destroy below)

    def get_queryset(self):
        return _trip_queryset(self.request.user).select_related('fisherfolk').prefetch_related('species_entries')

    def update(self, request, *args, **kwargs):
        partial = kwargs.pop('partial', False)
        serializer = self.get_serializer(self.get_object(), data=_with_own_fisherfolk_trip(request), partial=partial)
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete catch logs.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class TripSpeciesEntryListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request, trip_id):
        trip = get_object_or_404(_trip_queryset(request.user), pk=trip_id)
        entries = TripSpeciesEntry.objects.filter(fishing_trip=trip).order_by('-volume_kg')
        serializer = TripSpeciesEntrySerializer(entries, many=True)
        return Response(serializer.data)

    def post(self, request, trip_id):
        trip = get_object_or_404(_trip_queryset(request.user), pk=trip_id)
        serializer = TripSpeciesEntrySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save(fishing_trip=trip)
        return Response(serializer.data, status=201)


class TripSpeciesEntryDeleteView(generics.DestroyAPIView):
    serializer_class = TripSpeciesEntrySerializer
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get_queryset(self):
        return scope_to_fisherfolk(TripSpeciesEntry.objects.all(), self.request.user, 'fishing_trip__fisherfolk_id')


class FishingTripSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        season = request.query_params.get('season')
        year = request.query_params.get('year')
        barangay = request.query_params.get('barangay')

        qs = _trip_queryset(request.user)
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


# ─── Fisheries Assistance Records ────────────────────────────────────────────

# FisheriesAssistanceListCreateView / FisheriesAssistanceDetailView retired
# (Batch 6) — absorbed into interventions.FisherfolkBeneficiaryRecord
# (program=null), reachable at /interventions/fisherfolk-beneficiaries/adhoc/.


# ─── Yield Analysis (descriptive) ──────────────────────────────────────────────
# Mirrors production/views.py's crop Yield Analysis module exactly: compares
# actual harvest against the STOCKING'S OWN planting-time estimate (no
# historical-average dataset exists to compare against). Missed activities
# are surfaced as *possible* contributing factors — this module never claims
# causation.

FISHERIES_YIELD_ANALYSIS_DISCLAIMER = (
    'This analysis is descriptive. Harvest yield is affected by many factors '
    'including water quality, disease, and weather; missed activities are '
    'shown as possible contributing factors, not proven causes.'
)


def _fisheries_yield_analysis_queryset(request):
    qs = StockingRecord.objects.filter(
        status__in=[StockingRecord.Status.HARVESTED, StockingRecord.Status.TOTAL_LOSS],
    ).select_related('fisherfolk', 'species', 'species__category').prefetch_related(
        'logs', 'harvests',
    )
    if request.user.role == 'CITIZEN':
        # Batch 11: same own-record-only scoping as production's
        # _yield_analysis_queryset — no aggregate/comparison view for this
        # role (FisheriesYieldAnalysisSummaryView stays IsAdminOrEvaluator).
        # Batch 12: get_linked_fisherfolk_id() (not get_linked_record())
        # keeps this type-safe now that ORGANIZATION-linked citizens exist —
        # stocking records are out of scope for that role entirely.
        fisherfolk_id = request.user.get_linked_fisherfolk_id()
        qs = qs.filter(fisherfolk_id=fisherfolk_id if fisherfolk_id else -1)
    barangay   = request.query_params.get('barangay', '')
    species    = request.query_params.get('species', '')
    year       = request.query_params.get('year', '')
    fisherfolk = request.query_params.get('fisherfolk', '')
    if barangay:
        qs = qs.filter(pond_location_barangay__iexact=barangay)
    if species:
        qs = qs.filter(species_id=species)
    if year:
        qs = qs.filter(year=year)
    if fisherfolk:
        qs = qs.filter(fisherfolk_id=fisherfolk)
    return qs.order_by('-date_stocked')


def _yield_analysis_context(records):
    """Per-record lookups of the yield analysis loaded once for all records: each species' activity stages
    (in SpeciesActivityStage's own order) and every record's production cycle number."""
    stages_by_species = defaultdict(list)
    species_ids = {r.species_id for r in records if r.species_id}
    if species_ids:
        for stage in SpeciesActivityStage.objects.filter(species_option_id__in=species_ids):
            stages_by_species[stage.species_option_id].append(stage)
    return {'stages_by_species': stages_by_species, 'cycle_no': production_cycle_numbers_bulk(records)}


def _stocking_activity_completion(rec, stages=None, build_breakdown=True):
    """
    Expand this stocking's SpeciesActivityStage occurrences (application_days),
    the same expansion FisheriesActivitySuggestionsView uses, and match each
    one against the stocking's logged activities using the same rule: same
    activity name, and either the log's target_day matches the occurrence or
    its date falls within the stage's window_days of the scheduled due date.
    `stages`: this species' stages when already loaded (see _yield_analysis_context).
    """
    if stages is None:
        stages = SpeciesActivityStage.objects.filter(species_option_id=rec.species_id)
    logs = list(rec.logs.all())
    stocked = rec.date_stocked

    total = 0
    completed = 0
    missed_high = []
    breakdown = []

    for stage in stages:
        days_list = stage.application_days if stage.application_days else [stage.day_after_stocking]
        for occurrence_day in days_list:
            total += 1
            due_date = stocked + timedelta(days=occurrence_day) if stocked else None
            is_done = False
            if due_date:
                window = stage.window_days
                for log in logs:
                    if log.activity != stage.activity_name:
                        continue
                    target_match = log.target_day is not None and log.target_day == occurrence_day
                    date_match = log.date_of_activity is not None and abs((log.date_of_activity - due_date).days) <= window
                    if target_match or date_match:
                        is_done = True
                        break
            if is_done:
                completed += 1
            elif stage.priority == SpeciesActivityStage.Priority.HIGH:
                missed_high.append({'activity': stage.activity_name, 'scheduled_day': occurrence_day})
            if build_breakdown:
                breakdown.append({
                    'activity': stage.activity_name,
                    'scheduled_day': occurrence_day,
                    'priority': stage.priority,
                    'completed': is_done,
                })

    return total, completed, missed_high, breakdown


def _analyze_stocking(rec, context=None, light=False):
    """`context`: _yield_analysis_context() of the records being analyzed (no per-record queries).
    `light`: skip the per-activity breakdown (the aggregate summary only needs the counts)."""
    harvests = list(rec.harvests.all())
    actual_total_kg = sum((h.quantity_kg for h in harvests if h.quantity_kg is not None), Decimal('0'))
    estimated_kg = rec.estimated_harvest_kg

    if estimated_kg is None:
        variance_kg = None
        variance_pct = None
    else:
        variance_kg = actual_total_kg - estimated_kg
        variance_pct = None if estimated_kg == 0 else float((variance_kg / estimated_kg) * Decimal('100'))

    total, completed, missed_high, breakdown = _stocking_activity_completion(
        rec, context['stages_by_species'].get(rec.species_id, []) if context else None, build_breakdown=not light)

    harvest_dates = sorted({
        (h.harvest_date or h.date_recorded.date()).isoformat()
        for h in harvests
    })

    if rec.pond_location_barangay:
        barangay = rec.pond_location_barangay
    elif rec.fisherfolk:
        barangay = rec.fisherfolk.barangay
    else:
        barangay = '—'

    return {
        'id': rec.id,
        'fisherfolk': rec.fisherfolk.full_name if rec.fisherfolk else '—',
        'fisherfolk_id': rec.fisherfolk_id,
        'barangay': barangay or '—',
        'species': rec.species.species_name if rec.species else '—',
        'culture_type': rec.culture_type,
        'is_total_loss': rec.status == StockingRecord.Status.TOTAL_LOSS,
        'date_stocked': rec.date_stocked.isoformat() if rec.date_stocked else None,
        'harvest_dates': harvest_dates,
        'estimated_kg': float(estimated_kg) if estimated_kg is not None else None,
        'actual_total_kg': float(actual_total_kg),
        'variance_kg': float(variance_kg) if variance_kg is not None else None,
        'variance_pct': round(variance_pct, 2) if variance_pct is not None else None,
        'production_cycle_no': context['cycle_no'][rec.id] if context else rec.compute_production_cycle_no(),
        'activities_completed_count': completed,
        'activities_total_count': total,
        'missed_high_priority': missed_high,
        'activity_breakdown': breakdown,
    }


def _cycle_trend_note(analyzed):
    """
    Average variance % by production cycle number (1 / 2 / 3+), purely
    descriptive — never a claim about *why* later cycles differ. None when
    there isn't enough data to say anything meaningful (fewer than 2
    distinct cycle numbers represented, or fewer than 3 stockings total).
    """
    buckets = {}
    for a in analyzed:
        cycle = a['production_cycle_no']
        if a['variance_pct'] is None or a['is_total_loss'] or cycle is None:   # None: record without a fisherfolk
            continue
        key = str(cycle) if cycle < 3 else '3+'
        b = buckets.setdefault(key, {'sum': 0.0, 'n': 0})
        b['sum'] += a['variance_pct']
        b['n'] += 1

    total_n = sum(b['n'] for b in buckets.values())
    if len(buckets) < 2 or total_n < 3:
        return None

    order = {'1': 0, '2': 1, '3+': 2}
    return sorted(
        [
            {'cycle': key, 'avg_variance_pct': round(b['sum'] / b['n'], 2), 'stocking_count': b['n']}
            for key, b in buckets.items()
        ],
        key=lambda x: order.get(x['cycle'], 99),
    )


def _chunked(iterable, size):
    chunk = []
    for item in iterable:
        chunk.append(item)
        if len(chunk) >= size:
            yield chunk
            chunk = []
    if chunk:
        yield chunk


def _iter_fisheries_yield_analysis(request, chunk_size=400):
    """(record, light analysis) for every harvested stocking, a chunk at a time (see production._iter_yield_analysis)."""
    for chunk in _chunked(_fisheries_yield_analysis_queryset(request).iterator(chunk_size=chunk_size), chunk_size):
        context = _yield_analysis_context(chunk)
        for rec in chunk:
            yield rec, _analyze_stocking(rec, context, light=True)


class FisheriesYieldAnalysisView(APIView):
    # Batch 11: CITIZEN allowed here too — _fisheries_yield_analysis_queryset()
    # scopes the actual rows returned, ADMIN/EVALUATOR stay unrestricted.
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = _fisheries_yield_analysis_queryset(request)
        search = request.query_params.get('search', '').strip()
        for token in search.split():
            qs = qs.filter(
                Q(species__species_name__icontains=token) | Q(fisherfolk__first_name__icontains=token)
                | Q(fisherfolk__middle_name__icontains=token) | Q(fisherfolk__last_name__icontains=token)
                | Q(pond_location_barangay__icontains=token) | Q(fisherfolk__barangay__icontains=token))
        paging = None
        if 'page' in request.query_params:
            try:
                page = max(1, int(request.query_params.get('page') or 1))
            except ValueError:
                page = 1
            try:
                size = min(100, max(1, int(request.query_params.get('page_size') or 25)))
            except ValueError:
                size = 25
            paging = (page, size)
        if paging:
            # One page (with its activity breakdowns) instead of every harvested stocking.
            page, size = paging
            total = qs.count()
            records = list(qs[(page - 1) * size:page * size])
        else:
            records = list(qs)
            total = len(records)
        context = _yield_analysis_context(records)
        data = [_analyze_stocking(rec, context) for rec in records]
        payload = {
            'count': total,
            'records': data,
            'disclaimer': FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
        }
        if paging:
            payload.update({'page': page, 'page_size': size})
        return Response(payload)


class FisheriesYieldAnalysisSummaryView(APIView):
    # A fisherfolk citizen may open it too: _fisheries_yield_analysis_queryset() already limits a CITIZEN
    # to their own stocking records, so their summary only ever aggregates their own data.
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'species'):
            group_by = 'barangay'

        groups = {}
        trend_rows = []   # only what _cycle_trend_note reads, not the whole analysis
        n = losses = 0
        estimated_sum = actual_sum = variance_sum = completion_sum = 0.0
        estimated_n = variance_n = completion_n = 0
        for rec, a in _iter_fisheries_yield_analysis(request):
            key = (rec.species.species_name if rec.species else '—') if group_by == 'species' else a['barangay']
            g = groups.setdefault(key, new_yield_group())
            accumulate_yield_group(g, a)
            trend_rows.append({'production_cycle_no': a['production_cycle_no'], 'variance_pct': a['variance_pct'],
                               'is_total_loss': a['is_total_loss']})
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
                'stocking_count': g['count'],
                'total_loss_count': g['total_loss_count'],
                'avg_estimated_kg': round(float(g['estimated_sum'] / g['estimated_n']), 2) if g['estimated_n'] else None,
                'avg_actual_kg': round(float(g['actual_sum'] / g['count']), 2) if g['count'] else None,
                'avg_variance_pct': round(g['variance_pct_sum'] / g['variance_pct_n'], 2) if g['variance_pct_n'] else None,
                'avg_activity_completion_pct': round(g['completion_pct_sum'] / g['completion_pct_n'], 2) if g['completion_pct_n'] else None,
            })

        overall = {
            'stocking_count': n,
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
            'cycle_trend': _cycle_trend_note(trend_rows),
            'disclaimer': FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
        })


from core.pcic import PcicFormPhotoMixin  # noqa: E402


class PondPcicFormView(PcicFormPhotoMixin, PondDetailView):
    """POST/DELETE the photo of a pond's PCIC insurance form."""


class StockingPcicFormView(PcicFormPhotoMixin, StockingDetailView):
    """POST/DELETE the photo of a stocking record's PCIC insurance form (staff, or the fisherfolk who owns it)."""
