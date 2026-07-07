from datetime import date, timedelta

from django.db.models import Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import generics, status as drf_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrEvaluator

from .models import (
    FisheriesActivityLog,
    FisheriesDisasterReport,
    FisheriesDisasterResponseRule,
    FisheriesHarvestRecord,
    Fisherfolk,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
)
from .serializers import (
    FisherfolkCreateSerializer,
    FisherfolkDetailSerializer,
    FisherfolkListSerializer,
    FisheriesActivityLogSerializer,
    FisheriesDisasterReportSerializer,
    FisheriesHarvestRecordSerializer,
    SpeciesActivityStageSerializer,
    SpeciesCategorySerializer,
    SpeciesOptionSerializer,
    StockingRecordDetailSerializer,
    StockingRecordSerializer,
)


# ─── Fisherfolk ───────────────────────────────────────────────────────────────

class FisherfolkListView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkCreateSerializer if self.request.method == 'POST' else FisherfolkListSerializer

    def get_queryset(self):
        from django.utils.timezone import now
        qs = Fisherfolk.objects.all().order_by('-date_registered')
        params = self.request.query_params
        search = params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(middle_name__icontains=search)
                | Q(lgu_registration_number__icontains=search)
                | Q(fishr_number__icontains=search)
                | Q(barangay__icontains=search)
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
            today = now().date()
            cutoff = today.replace(year=today.year - 60)
            qs = qs.filter(birthdate__lte=cutoff)
        if params.get('is_pwd') is not None:
            qs = qs.filter(is_pwd=(params['is_pwd'].lower() in ('true', '1')))
        if params.get('is_4ps') is not None:
            qs = qs.filter(is_4ps_beneficiary=(params['is_4ps'].lower() in ('true', '1')))
        if params.get('association') is not None:
            qs = qs.filter(fisherfolk_association_id=params['association'])
        return qs

    def perform_create(self, serializer):
        serializer.save(registered_by=self.request.user)


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


# ─── Species Option ───────────────────────────────────────────────────────────

class SpeciesOptionListCreateView(generics.ListCreateAPIView):
    serializer_class = SpeciesOptionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
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
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
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


# ─── Stocking Record ──────────────────────────────────────────────────────────

class StockingListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get_serializer_class(self):
        return StockingRecordSerializer

    def get_queryset(self):
        qs = StockingRecord.objects.select_related(
            'fisherfolk', 'species', 'species__category', 'recorded_by',
        ).prefetch_related('logs', 'disaster_reports', 'harvests').order_by('-date_recorded')

        params = self.request.query_params
        raw_status = params.get('status', '')
        if raw_status:
            statuses = [s.strip() for s in raw_status.split(',') if s.strip()]
            qs = qs.filter(status__in=statuses)
        else:
            qs = qs.filter(status__in=[StockingRecord.Status.STOCKED, StockingRecord.Status.FOR_HARVEST])

        if params.get('season'):
            qs = qs.filter(season__iexact=params['season'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('barangay'):
            qs = qs.filter(pond_location_barangay__iexact=params['barangay'])
        if params.get('search'):
            q = params['search'].strip()
            qs = qs.filter(
                Q(fisherfolk__first_name__icontains=q)
                | Q(fisherfolk__last_name__icontains=q)
                | Q(species__species_name__icontains=q)
                | Q(pond_location_barangay__icontains=q)
            )
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class StockingDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = StockingRecord.objects.select_related(
        'fisherfolk', 'species', 'species__category', 'recorded_by',
    ).prefetch_related('logs', 'disaster_reports', 'harvests')

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return StockingRecordDetailSerializer
        return StockingRecordSerializer

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

class StockingActivityLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesActivityLog.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-date_of_activity')

    def perform_create(self, serializer):
        serializer.save(
            stocking_record_id=self.kwargs['stocking_id'],
            logged_by=self.request.user,
        )


class StockingActivityLogDeleteView(generics.DestroyAPIView):
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheriesActivityLog.objects.all()


class StockingDisasterReportListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesDisasterReport.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-date_of_occurrence')

    def perform_create(self, serializer):
        serializer.save(
            stocking_record_id=self.kwargs['stocking_id'],
            reported_by=self.request.user,
        )


class FisheriesDisasterResolveView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk):
        disaster = get_object_or_404(FisheriesDisasterReport, pk=pk)
        if disaster.status == 'Resolved':
            return Response({'detail': 'Disaster is already resolved.'}, status=400)

        record = disaster.stocking_record
        rules_qs = FisheriesDisasterResponseRule.objects.filter(
            disaster_type=disaster.disaster_type,
        ).filter(
            Q(species=record.species) | Q(species__isnull=True)
        )
        activity_logs = FisheriesActivityLog.objects.filter(
            stocking_record=record
        ).values('activity', 'date_of_activity')

        all_done = True
        has_rules = False
        for rule in rules_qs:
            has_rules = True
            is_done = any(
                log['activity'] == rule.activity_name and
                log['date_of_activity'] >= disaster.date_of_occurrence
                for log in activity_logs
            )
            if not is_done:
                all_done = False
                break

        if has_rules and not all_done:
            return Response(
                {'detail': 'Cannot resolve: not all recommended response rules have been completed.'},
                status=400,
            )

        disaster.status = 'Resolved'
        disaster.resolved_date = date.today()
        disaster.resolved_by = request.user
        disaster.save(update_fields=['status', 'resolved_date', 'resolved_by'])
        serializer = FisheriesDisasterReportSerializer(disaster)
        return Response(serializer.data, status=200)


class StockingHarvestListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesHarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesHarvestRecord.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-harvest_date')

    def perform_create(self, serializer):
        harvest = serializer.save(
            stocking_record_id=self.kwargs['stocking_id'],
            recorded_by=self.request.user,
        )
        if harvest.is_final:
            StockingRecord.objects.filter(pk=self.kwargs['stocking_id']).update(
                status=StockingRecord.Status.HARVESTED
            )


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
                stocking.status = StockingRecord.Status.FOR_HARVEST
                stocking.save(update_fields=['status'])


# ─── Activity Suggestions ─────────────────────────────────────────────────────

class FisheriesActivitySuggestionsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, stocking_id):
        record = get_object_or_404(
            StockingRecord.objects.select_related('species'),
            pk=stocking_id,
        )

        stages = SpeciesActivityStage.objects.filter(
            species_option=record.species
        ).order_by('day_after_stocking')

        activity_logs = FisheriesActivityLog.objects.filter(
            stocking_record=record
        ).values('activity', 'date_of_activity', 'target_day')

        today = date.today()
        days_elapsed = (today - record.date_stocked).days if record.date_stocked else 0
        total_days = record.species.culture_duration_days if record.species else 0
        stocked = record.date_stocked

        suggestions = []
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
                    log['activity'] == rule.activity_name and
                    log['date_of_activity'] >= disaster.date_of_occurrence
                    for log in activity_logs
                )
                rules_list.append({
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
                'all_rules_done': all_rules_done,
                'rules': rules_list,
            })

        return Response({
            'days_elapsed': days_elapsed,
            'total_days': total_days,
            'suggestions': suggestions,
            'disaster_response': disaster_response,
        })
