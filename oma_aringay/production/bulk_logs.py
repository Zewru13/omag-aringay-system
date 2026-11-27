"""One activity logged on many crops at once: POST /api/production/monitoring/bulk-logs/.

A farmer who did the same thing on many crops in a day should not log it crop by crop. The log is saved on every crop named, each
exactly like a log made on that crop's own Log Activity window: the same checks (CropActivityLogSerializer, with that crop as the
record), and the same late rule (the log is tied to the activity's earliest overdue step on THAT crop, and is late when its date is
past that step's deadline).

    body: { record_ids: [crop ids], activity_type, activity_type_other_specify, date_of_activity, plant_condition, notes,
            fertilizer_type, quantity_applied, quantity_unit, pest_disease_name, severity }

What cannot be shared between crops is left out on purpose: the area affected by a pest or disease (each crop has its own area, so
Pest Control / Disease Control is answered with the severity) and Disaster Remedy (it belongs to one crop's disaster report).

A farmer account for its OWN crops, or a farmers' cooperative for the crops of its members who have no activated account
(associations.member_logging); a crop of anyone else is answered as "not found", as if it did not exist, and the office does not log on
many crops at once. All or nothing: if any crop cannot take the log, nothing is saved and the answer names that crop. At most 100 crops at a time.

GET /api/production/monitoring/member-crops/ lists the crops a cooperative may pick: only what is needed to tell them apart.
"""
from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from rest_framework import status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import is_farmer_citizen, scope_to_farmer
from associations.member_logging import is_cooperative_for, loggable_member_ids
from core.locking import assert_not_locked_by_other

from .forced_harvest import _crop_label
from .models import CropActivityLog, CropActivityStage, CropMonitoringRecord
from .schedule_rules import done_date, is_scheduled_stage, is_setup_stage, step_status
from .serializers import CropActivityLogSerializer

MAX_BULK_LOG_CROPS = 100
GROWING = (CropMonitoringRecord.Status.PLANTED, CropMonitoringRecord.Status.NEAR_HARVEST)
# The fields of the form that every crop takes the same.
SHARED_FIELDS = (
    'activity_type', 'activity_type_other_specify', 'date_of_activity', 'plant_condition', 'notes',
    'fertilizer_type', 'quantity_applied', 'quantity_unit', 'pest_disease_name', 'severity',
)


class MayLogOnManyCrops(BasePermission):
    """A citizen account linked to a farmer, or to a farmers' cooperative (for members who cannot log for themselves)."""

    def has_permission(self, request, view):
        return is_farmer_citizen(request.user) or is_cooperative_for(request.user, 'FARMER')


class IsFarmersCooperative(BasePermission):
    def has_permission(self, request, view):
        return is_cooperative_for(request.user, 'FARMER')


def _member_crops(member_ids):
    """The crops of these members; those of a removed parcel have left Crop Monitoring and are left out here too."""
    return CropMonitoringRecord.objects.filter(farmer_id__in=member_ids).filter(
        Q(farm_parcel__isnull=True) | Q(farm_parcel__purged_at__isnull=True))


def _reachable_crops(user):
    """The crops this account may log on. A farmer: their own. A cooperative: its members' who have no activated account."""
    if is_cooperative_for(user, 'FARMER'):
        return _member_crops(loggable_member_ids(user, 'FARMER'))
    return scope_to_farmer(CropMonitoringRecord.objects.all(), user, 'farmer_id')


def overdue_target_day(record, activity_type, today):
    """The day of the activity's earliest OVERDUE step on this crop's schedule (what the Log Activity window sends as target_day), or
    None. The same rule as the suggestions: a step is overdue once its window has passed with no log for it."""
    if not record.date_planted or record.date_planted_is_estimated or record.status == CropMonitoringRecord.Status.TOTAL_LOSS:
        return None
    stages = [s for s in CropActivityStage.objects.filter(crop_type_id=record.crop_type_id, stage_name=activity_type)
              if is_scheduled_stage(s)]
    if not stages:
        return None
    logs = [(l.activity_type, l.date_of_activity, l.target_day) for l in CropActivityLog.objects.filter(monitoring_record=record)]
    days_elapsed = (today - record.date_planted).days
    overdue = []
    for stage in stages:
        setup = is_setup_stage(stage)
        for day in (stage.application_days or [stage.day_after_planting]):
            due = record.date_planted + timedelta(days=day)
            done = done_date(stage.stage_name, day, due, stage.window_days, logs, setup) is not None
            if step_status(day, days_elapsed, stage.window_days, done, setup) == 'overdue':
                overdue.append(day)
    return min(overdue) if overdue else None


def is_late(record, target_day, date_of_activity):
    """The same rule as a single log: late when its date is past the tied step's deadline (planting + day + window, 3 days when the
    step has no window of its own)."""
    if target_day is None or not date_of_activity or not record.date_planted:
        return False
    stage = CropActivityStage.objects.filter(crop_type_id=record.crop_type_id, day_after_planting=target_day).first()
    window = stage.window_days if stage else 3
    return date_of_activity > record.date_planted + timedelta(days=target_day + window)


def _first_message(errors):
    problem = next(iter(errors.values()))
    return str(problem[0] if isinstance(problem, (list, tuple)) and problem else problem)


class CropActivityBulkLogView(APIView):
    permission_classes = [IsAuthenticated, MayLogOnManyCrops]

    def post(self, request):
        body = request.data
        raw_ids = body.get('record_ids')
        if not isinstance(raw_ids, list) or not raw_ids:
            raise ValidationError({'record_ids': 'Choose at least one crop.'})
        if len(raw_ids) > MAX_BULK_LOG_CROPS:
            raise ValidationError({'record_ids': f'At most {MAX_BULK_LOG_CROPS} crops can be logged at once.'})
        try:
            ids = [int(i) for i in raw_ids]
        except (TypeError, ValueError):
            raise ValidationError({'record_ids': 'Each crop needs its record id.'})
        if len(set(ids)) != len(ids):
            raise ValidationError({'record_ids': 'The same crop is listed twice.'})
        activity_type = (body.get('activity_type') or '').strip()
        if activity_type == 'Disaster Remedy':
            raise ValidationError({'activity_type': 'Disaster Remedy is logged on the crop itself, because it belongs to that crop\'s disaster report.'})

        # Any id this account may not log on is simply missing from this lookup.
        records = {r.id: r for r in _reachable_crops(request.user).select_related('crop_type', 'farmer').filter(pk__in=ids)}
        if len(records) != len(ids):
            raise ValidationError({'record_ids': 'One of the crops could not be found.'})

        data = {key: body[key] for key in SHARED_FIELDS if key in body and body[key] not in (None, '')}
        cooperative = is_cooperative_for(request.user, 'FARMER')

        def label_of(record):
            # A cooperative logs for several people, so a message also says whose crop it is.
            return f'{record.farmer.full_name}, {_crop_label(record)}' if cooperative else _crop_label(record)

        validated, errors = [], []
        for record_id in ids:
            record = records[record_id]
            label = label_of(record)
            if record.status not in GROWING:
                errors.append({'monitoring_record': record.id,
                               'errors': {'monitoring_record': [f'{label} is not growing any more (it is {record.status}), so an activity cannot be logged on it.']}})
                continue
            serializer = CropActivityLogSerializer(data=data, context={'request': request, 'monitoring_record': record})
            if serializer.is_valid():
                validated.append((record, serializer))
            else:
                errors.append({'monitoring_record': record.id, 'errors': serializer.errors})
        if errors:
            first = errors[0]
            message = _first_message(first['errors'])
            label = label_of(records[first['monitoring_record']])
            return Response({'detail': message if message.startswith(label) else f'{label}: {message}', 'errors': errors},
                            status=drf_status.HTTP_400_BAD_REQUEST)

        from datetime import date
        today = date.today()
        created = []
        with transaction.atomic():
            for record, serializer in validated:
                assert_not_locked_by_other(request.user, 'crop', record.id)
                activity_date = serializer.validated_data.get('date_of_activity')
                target_day = overdue_target_day(record, serializer.validated_data.get('activity_type'), today)
                created.append(serializer.save(
                    monitoring_record=record, recorded_by=request.user, target_day=target_day,
                    is_late=is_late(record, target_day, activity_date),
                ))
        return Response({'logged': len(created), 'ids': [log.id for log in created]}, status=drf_status.HTTP_201_CREATED)


class MemberCropListView(APIView):
    """The growing crops a farmers' cooperative may log on for its members without an activated account."""
    permission_classes = [IsAuthenticated, IsFarmersCooperative]

    def get(self, request):
        members = loggable_member_ids(request.user, 'FARMER')
        crops = _member_crops(members).filter(status__in=GROWING).select_related('crop_type', 'farmer', 'farm_parcel').order_by(
            'farmer__last_name', 'farmer__first_name', '-date_planted', '-id')
        return Response({'member_count': len(members), 'records': [{
            'id': crop.id,
            'member_id': crop.farmer_id,
            'member_name': crop.farmer.full_name,
            'crop_type_name': crop.crop_type.name if crop.crop_type else '',
            'variety_used': crop.variety_used,
            'farm_location_barangay': crop.farm_location_barangay,
            'farm_parcel_number': crop.farm_parcel.parcel_number if crop.farm_parcel else '',
            'area_planted_ha': str(crop.area_planted_ha) if crop.area_planted_ha is not None else None,
            'date_planted': crop.date_planted,
            'expected_harvest_date': crop.expected_harvest_date,
            'status': crop.status,
        } for crop in crops]})
