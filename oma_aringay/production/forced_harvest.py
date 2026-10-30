"""
Forced Harvest of several crops at once: POST /api/production/forced-harvest/ (the parcel's ⋮ menu on Crop Records).

Several crops that are not ready yet (more than 7 days before their expected harvest date), harvested together for one reason, such
as an upcoming typhoon. One HarvestRecord per crop, each saved exactly like a single Record Harvest with a forced reason
(force_harvest_reason, and early_late_reason = "Forced harvest due to early harvest: <reason>"), all or nothing.

    body: { harvest_date: 'YYYY-MM-DD', force_harvest_reason: 'upcoming_typhoon' | ... | 'other',
            force_harvest_detail: '' (needed for 'other'), remarks: '',
            crops: [{ monitoring_record, area_harvested_hectares, quantity_harvested, unit_of_measure,
                      volume_kg (the total kg, only for a unit with no standard weight) }] }

Staff only. A crop that is already harvested or lost, or whose planting date is only an estimate, is refused (as in Record Harvest).
Every Admin account (not the one who recorded it) gets one notification for the whole event.
"""
from datetime import date as _date, timedelta

from django.db import transaction
from django.http import Http404
from django.shortcuts import get_object_or_404
from rest_framework import serializers, status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.locking import assert_not_locked_by_other
from core.notifications import _safe_bulk, build_owner_and_staff_notifications

from .forced_reasons import forced_problem
from .models import FORCE_HARVEST_REASON_LABELS, CropMonitoringRecord, HarvestRecord
from .serializers import HarvestRecordCreateSerializer, HarvestRecordSerializer

MAX_FORCED_CROPS = 100
GROWING = (CropMonitoringRecord.Status.PLANTED, CropMonitoringRecord.Status.NEAR_HARVEST)


def _crop_label(record):
    name = record.crop_type.name if record.crop_type_id else 'Crop'
    return f'{name}{f" ({record.variety_used})" if record.variety_used else ""}'


def queue_forced_harvest_notice(harvest_ids, actor):
    """After a forced harvest commits: ONE notification for the whole event to every active ADMIN account (not the one who recorded
    it, and not the farmer). Names the crops, the farmer, the parcel, the date, the total yield and the reason; it opens the first
    crop. Written only once the transaction commits, never raises into the save."""
    def send():
        from django.contrib.auth import get_user_model
        try:
            saved = list(HarvestRecord.objects.select_related(
                'monitoring_record__crop_type', 'monitoring_record__farmer', 'farm_parcel',
            ).filter(pk__in=harvest_ids).order_by('id'))
            if not saved:
                return
            first = saved[0]
            record = first.monitoring_record
            owner = record.farmer.full_name if record and record.farmer_id else ''
            crops = ', '.join(dict.fromkeys(_crop_label(h.monitoring_record) for h in saved if h.monitoring_record))
            parcel = f'Parcel {first.farm_parcel.parcel_number}' if first.farm_parcel_id and first.farm_parcel.parcel_number else None
            total = sum((h.volume_kg or 0) for h in saved)
            parts = [parcel, first.harvest_start_date.strftime('%b %d, %Y') if first.harvest_start_date else None, f'{total} kg',
                     FORCE_HARVEST_REASON_LABELS.get(first.force_harvest_reason)]
            text = ('recorded a Forced Harvest:', f'{crops}{f" for {owner}" if owner else ""}', ' · '.join(p for p in parts if p))
            admins = get_user_model().objects.filter(is_active=True, role='ADMIN')
            rows = build_owner_and_staff_notifications(None, admins, actor, 'crop', first.monitoring_record_id, text, text)
        except Exception:
            import logging
            logging.getLogger(__name__).exception('forced harvest notification failed (non-fatal): harvests=%s', list(harvest_ids))
            return
        _safe_bulk(rows, f'forced_harvest harvests={list(harvest_ids)}')
    transaction.on_commit(send)


class ForcedHarvestMultiCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        body = request.data
        items = body.get('crops')
        if not isinstance(items, list) or not items:
            raise ValidationError({'crops': 'Choose at least one crop.'})
        if len(items) > MAX_FORCED_CROPS:
            raise ValidationError({'crops': f'At most {MAX_FORCED_CROPS} crops can be force harvested at once.'})
        try:
            ids = [int(item['monitoring_record']) for item in items]
        except (TypeError, KeyError, ValueError):
            raise ValidationError({'crops': 'Each crop needs its record id.'})
        if len(set(ids)) != len(ids):
            raise ValidationError({'crops': 'The same crop is listed twice.'})

        try:
            harvest_date = serializers.DateField().run_validation(body.get('harvest_date'))
        except serializers.ValidationError:
            raise ValidationError({'harvest_date': 'Enter the harvest date.'})
        if harvest_date > _date.today():
            raise ValidationError({'harvest_date': 'Harvest date cannot be in the future.'})
        code = body.get('force_harvest_reason') or ''
        detail = body.get('force_harvest_detail') or ''
        if code not in FORCE_HARVEST_REASON_LABELS:
            raise ValidationError({'force_harvest_reason': 'Choose why the crops are being harvested early.'})
        if code == 'other' and not str(detail).strip():
            raise ValidationError({'force_harvest_detail': 'Describe the reason.'})

        records = {r.id: r for r in CropMonitoringRecord.objects.select_related('crop_type', 'farmer').filter(pk__in=ids)}
        if len(records) != len(ids):
            raise ValidationError({'crops': 'One of the crops could not be found.'})

        validated, errors = [], []
        for item in items:
            record = records[int(item['monitoring_record'])]
            label = _crop_label(record)
            problem = None
            if record.status not in GROWING:
                problem = {'monitoring_record': f'{label} is not growing any more (it is {record.status}), so it cannot be force harvested.'}
            elif record.date_planted_is_estimated:
                problem = {'monitoring_record': f'{label}: the planting date is only an estimate. Confirm the real planting date first.'}
            else:
                problem = forced_problem(code, detail, record, harvest_date)
                if problem:
                    problem = {key: f'{label}: {text}' if key == 'force_harvest_reason' else text for key, text in problem.items()}
            if problem:
                errors.append({'monitoring_record': record.id, 'errors': problem})
                continue
            payload = {
                'monitoring_record': record.id,
                'farm_parcel': record.farm_parcel_id,
                'season': 'Wet' if 6 <= harvest_date.month <= 11 else 'Dry',
                'year': harvest_date.year,
                'crop_name': record.crop_type.name if record.crop_type_id else '',
                'harvest_start_date': harvest_date.isoformat(),
                'area_harvested_hectares': item.get('area_harvested_hectares'),
                'quantity_harvested': item.get('quantity_harvested'),
                'volume_kg': item.get('volume_kg'),
                'unit_of_measure': item.get('unit_of_measure') or 'kg',
                'force_harvest_reason': code,
                'force_harvest_detail': detail,
                'remarks': body.get('remarks') or '',
            }
            # a quantity or a total kg that was not sent is left out (the serializer asks for the one the unit needs)
            payload = {key: value for key, value in payload.items() if value is not None}
            serializer = HarvestRecordCreateSerializer(data=payload)
            if serializer.is_valid():
                validated.append((record, serializer))
            else:
                errors.append({'monitoring_record': record.id, 'errors': serializer.errors})
        if errors:
            first = errors[0]
            problem = next(iter(first['errors'].values()))
            message = problem[0] if isinstance(problem, (list, tuple)) and problem else str(problem)
            label = _crop_label(records[first['monitoring_record']])
            return Response({'detail': message if message.startswith(label) else f'{label}: {message}', 'errors': errors},
                            status=drf_status.HTTP_400_BAD_REQUEST)

        created = []
        with transaction.atomic():
            for record, serializer in validated:
                assert_not_locked_by_other(request.user, 'crop', record.id)
                created.append(serializer.save(recorded_by=request.user))
            ids_saved = [h.pk for h in created]
            queue_forced_harvest_notice(ids_saved, request.user)
            data = HarvestRecordSerializer(
                HarvestRecord.objects.select_related('farm_parcel__farmer', 'monitoring_record').filter(pk__in=ids_saved).order_by('id'), many=True,
            ).data
        return Response(data, status=drf_status.HTTP_201_CREATED)


# One crop of a forced harvest as the details window lists it.
def _event_row(h):
    record = h.monitoring_record
    return {
        'id': h.id,
        'crop': _crop_label(record) if record else h.crop_name,
        'parcel_number': (h.farm_parcel.parcel_number if h.farm_parcel_id else '') or '',
        'date_planted': record.date_planted.isoformat() if record and record.date_planted else None,
        'expected_harvest_date': record.expected_harvest_date.isoformat() if record and record.expected_harvest_date else None,
        'days_early': -h.harvest_variance_days if h.harvest_variance_days is not None else None,
        'area_harvested_hectares': str(h.area_harvested_hectares),
        'quantity_harvested': str(h.quantity_harvested) if h.quantity_harvested is not None else None,
        'unit_of_measure': h.unit_of_measure,
        'volume_kg': str(h.volume_kg),
    }


class ForcedHarvestDetailView(APIView):
    """GET /api/production/forced-harvest/<harvest id>/: the saved forced harvest the red FORCED HARVEST label of a crop opens. It is the
    harvest of that crop together with the other crops of the same farmer saved in the same event (same reason, harvested date and person,
    within a few minutes). Staff, or the farmer the crop belongs to."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        harvest = get_object_or_404(
            HarvestRecord.objects.select_related('monitoring_record__crop_type', 'monitoring_record__farmer', 'farm_parcel', 'recorded_by'),
            pk=pk, force_harvest_reason__gt='',
        )
        record = harvest.monitoring_record
        farmer = record.farmer if record else None
        if request.user.role not in ('ADMIN', 'EVALUATOR'):
            linked = request.user.get_linked_farmer_id() if request.user.role == 'CITIZEN' else None
            if not (farmer and linked and linked == farmer.id):
                raise Http404
        window = timedelta(minutes=5)
        together = HarvestRecord.objects.select_related('monitoring_record__crop_type', 'farm_parcel').filter(
            force_harvest_reason=harvest.force_harvest_reason, harvest_start_date=harvest.harvest_start_date, recorded_by=harvest.recorded_by,
            monitoring_record__farmer=farmer, date_recorded__range=(harvest.date_recorded - window, harvest.date_recorded + window),
        ).order_by('id')
        rows = [_event_row(h) for h in together]
        return Response({
            'id': harvest.id,
            'farmer_name': farmer.full_name if farmer else '',
            'rsbsa_number': farmer.rsbsa_number if farmer else '',
            'harvest_date': harvest.harvest_start_date.isoformat() if harvest.harvest_start_date else None,
            'reason': harvest.force_harvest_reason,
            'reason_label': FORCE_HARVEST_REASON_LABELS.get(harvest.force_harvest_reason, ''),
            'reason_text': harvest.early_late_reason,
            'remarks': harvest.remarks,
            'recorded_by_name': (harvest.recorded_by.get_full_name() or harvest.recorded_by.username) if harvest.recorded_by_id else '',
            'recorded_at': harvest.date_recorded.isoformat(),
            'crops': rows,
            'total_kg': str(sum((h.volume_kg or 0) for h in together)),
        })
