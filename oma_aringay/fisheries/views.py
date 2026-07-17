from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import Count, Q, Sum
from django.shortcuts import get_object_or_404
from rest_framework import generics, status as drf_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdmin, IsAdminOrEvaluator
from core.locking import assert_not_locked_by_other
from core.notifications import notify_all_except
from core.utils import day_range_bounds

from .models import (
    FisheriesActivityLog,
    FisheriesAssistanceRecord,
    FisheriesDisasterReport,
    FisheriesDisasterResponseRule,
    FisheriesHarvestRecord,
    Fisherfolk,
    FishingTripLog,
    SpeciesActivityStage,
    SpeciesCategory,
    SpeciesOption,
    StockingRecord,
    TripSpeciesEntry,
    VesselInspection,
)
from .serializers import (
    FisherfolkCreateSerializer,
    FisherfolkDetailSerializer,
    FisherfolkListSerializer,
    FisheriesActivityLogSerializer,
    FisheriesAssistanceSerializer,
    FisheriesDisasterReportSerializer,
    FisheriesHarvestRecordSerializer,
    FishingTripLogSerializer,
    SpeciesActivityStageSerializer,
    SpeciesCategorySerializer,
    SpeciesOptionSerializer,
    StockingRecordDetailSerializer,
    StockingRecordSerializer,
    TripSpeciesEntrySerializer,
    VesselInspectionSerializer,
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

def _stocking_record_label(stocking):
    species_name = stocking.species.species_name if stocking.species_id else 'Stock'
    who = stocking.fisherfolk.full_name if stocking.fisherfolk_id else 'Unknown fisherfolk'
    barangay = stocking.pond_location_barangay or ''
    location = f'{who}, {barangay}' if barangay else who
    return f'{species_name} — {location}'


class StockingActivityLogListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesActivityLogSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesActivityLog.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-date_of_activity')

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
        notify_all_except(
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


class StockingDisasterReportListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesDisasterReportSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesDisasterReport.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-date_of_occurrence')

    def perform_create(self, serializer):
        stocking_id = self.kwargs['stocking_id']
        stocking = StockingRecord.objects.get(pk=stocking_id)
        assert_not_locked_by_other(self.request.user, 'stocking', stocking_id)
        disaster = serializer.save(
            stocking_record_id=stocking_id,
            reported_by=self.request.user,
        )
        notify_all_except(
            actor=self.request.user,
            verb='reported a disaster on',
            record_type='stocking',
            record_id=stocking_id,
            record_label=_stocking_record_label(stocking),
            detail=disaster.disaster_type,
        )


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
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk):
        disaster = get_object_or_404(FisheriesDisasterReport, pk=pk)
        if disaster.status == 'Recovered':
            return Response({'detail': 'Disaster is already marked as recovered.'}, status=400)
        if disaster.is_total_loss:
            return Response({'detail': 'A Total Loss record cannot be marked as recovered.'}, status=400)

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


class StockingHarvestListCreateView(generics.ListCreateAPIView):
    serializer_class = FisheriesHarvestRecordSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FisheriesHarvestRecord.objects.filter(
            stocking_record_id=self.kwargs['stocking_id']
        ).order_by('-harvest_date')

    def create(self, request, *args, **kwargs):
        stocking_id = kwargs.get('stocking_id')
        try:
            record = StockingRecord.objects.get(pk=stocking_id)
            if record.status == StockingRecord.Status.TOTAL_LOSS:
                return Response(
                    {'detail': 'Cannot record harvest for a Total Loss record — the stock was completely destroyed.'},
                    status=drf_status.HTTP_400_BAD_REQUEST,
                )
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
        stocking = StockingRecord.objects.get(pk=stocking_id)
        notify_all_except(
            actor=self.request.user,
            verb='recorded a harvest for',
            record_type='stocking',
            record_id=stocking_id,
            record_label=_stocking_record_label(stocking),
            detail=f'{harvest.quantity_kg} kg',
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
                stocking.status = stocking.determine_status()
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
        if not is_total_loss:
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
                'all_rules_done': all_rules_done,
                'rules': rules_list,
            })

        return Response({
            'days_elapsed': days_elapsed,
            'total_days': total_days,
            'is_total_loss': is_total_loss,
            'suggestions': suggestions,
            'disaster_response': disaster_response,
        })


# ─── Legacy Capture Fishing / Vessel / Assistance ─────────────────────────────
# Relocated from monitoring app (Phase 3 of the fisheries merge).

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

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete catch logs.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


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

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete vessel inspections.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class VesselLicenseAlertView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        threshold = date.today() + timedelta(days=30)
        qs = VesselInspection.objects.filter(
            license_expiry_date__lte=threshold,
        ).select_related('fisherfolk').order_by('license_expiry_date')
        serializer = VesselInspectionSerializer(qs, many=True)
        return Response(serializer.data)


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


class FisheriesAssistanceDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FisheriesAssistanceSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisheriesAssistanceRecord.objects.select_related('fisherfolk')
    http_method_names = ['get', 'patch', 'delete']

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete assistance records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


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


def _stocking_activity_completion(rec):
    """
    Expand this stocking's SpeciesActivityStage occurrences (application_days),
    the same expansion FisheriesActivitySuggestionsView uses, and match each
    one against the stocking's logged activities using the same rule: same
    activity name, and either the log's target_day matches the occurrence or
    its date falls within the stage's window_days of the scheduled due date.
    """
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
            breakdown.append({
                'activity': stage.activity_name,
                'scheduled_day': occurrence_day,
                'priority': stage.priority,
                'completed': is_done,
            })

    return total, completed, missed_high, breakdown


def _analyze_stocking(rec):
    harvests = list(rec.harvests.all())
    actual_total_kg = sum((h.quantity_kg for h in harvests if h.quantity_kg is not None), Decimal('0'))
    estimated_kg = rec.estimated_harvest_kg

    if estimated_kg is None:
        variance_kg = None
        variance_pct = None
    else:
        variance_kg = actual_total_kg - estimated_kg
        variance_pct = None if estimated_kg == 0 else float((variance_kg / estimated_kg) * Decimal('100'))

    total, completed, missed_high, breakdown = _stocking_activity_completion(rec)

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
        'production_cycle_no': rec.compute_production_cycle_no(),
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
        if a['variance_pct'] is None:
            continue
        cycle = a['production_cycle_no']
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


class FisheriesYieldAnalysisView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        records = _fisheries_yield_analysis_queryset(request)
        data = [_analyze_stocking(rec) for rec in records]
        return Response({
            'count': len(data),
            'records': data,
            'disclaimer': FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
        })


class FisheriesYieldAnalysisSummaryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'species'):
            group_by = 'barangay'

        records = list(_fisheries_yield_analysis_queryset(request))
        analyzed = [_analyze_stocking(rec) for rec in records]

        groups = {}
        for rec, a in zip(records, analyzed):
            key = (rec.species.species_name if rec.species else '—') if group_by == 'species' else a['barangay']
            g = groups.setdefault(key, {
                'count': 0,
                'estimated_sum': Decimal('0'), 'estimated_n': 0,
                'actual_sum': Decimal('0'),
                'variance_pct_sum': 0.0, 'variance_pct_n': 0,
                'completion_pct_sum': 0.0, 'completion_pct_n': 0,
            })
            g['count'] += 1
            if a['estimated_kg'] is not None:
                g['estimated_sum'] += Decimal(str(a['estimated_kg']))
                g['estimated_n'] += 1
            g['actual_sum'] += Decimal(str(a['actual_total_kg']))
            if a['variance_pct'] is not None:
                g['variance_pct_sum'] += a['variance_pct']
                g['variance_pct_n'] += 1
            if a['activities_total_count'] > 0:
                g['completion_pct_sum'] += (a['activities_completed_count'] / a['activities_total_count']) * 100
                g['completion_pct_n'] += 1

        group_results = []
        for key in sorted(groups.keys()):
            g = groups[key]
            group_results.append({
                'group': key,
                'stocking_count': g['count'],
                'avg_estimated_kg': round(float(g['estimated_sum'] / g['estimated_n']), 2) if g['estimated_n'] else None,
                'avg_actual_kg': round(float(g['actual_sum'] / g['count']), 2) if g['count'] else None,
                'avg_variance_pct': round(g['variance_pct_sum'] / g['variance_pct_n'], 2) if g['variance_pct_n'] else None,
                'avg_activity_completion_pct': round(g['completion_pct_sum'] / g['completion_pct_n'], 2) if g['completion_pct_n'] else None,
            })

        overall_estimated  = [a['estimated_kg'] for a in analyzed if a['estimated_kg'] is not None]
        overall_variance   = [a['variance_pct'] for a in analyzed if a['variance_pct'] is not None]
        overall_completion = [
            (a['activities_completed_count'] / a['activities_total_count']) * 100
            for a in analyzed if a['activities_total_count'] > 0
        ]
        overall = {
            'stocking_count': len(analyzed),
            'avg_estimated_kg': round(sum(overall_estimated) / len(overall_estimated), 2) if overall_estimated else None,
            'avg_actual_kg': round(sum(a['actual_total_kg'] for a in analyzed) / len(analyzed), 2) if analyzed else None,
            'avg_variance_pct': round(sum(overall_variance) / len(overall_variance), 2) if overall_variance else None,
            'avg_activity_completion_pct': round(sum(overall_completion) / len(overall_completion), 2) if overall_completion else None,
        }

        return Response({
            'group_by': group_by,
            'groups': group_results,
            'overall': overall,
            'cycle_trend': _cycle_trend_note(analyzed),
            'disclaimer': FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
        })
