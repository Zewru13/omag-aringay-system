"""
Add several farm parcels to one farmer in one request (the Add Farm Parcels page), each with its own crops and machinery.

POST /api/farmers/<farmer_id>/parcels/bulk/
    body: a list of 1-50 parcels. Each is the parcel's fields (as FarmParcelSerializer takes them, `classifications` included)
          plus  "machinery": [FarmMachinerySerializer fields...]  and  "crop_records": [the fields of one Add Crop row, as
          POST /api/production/monitoring/bulk/ takes them, without "farmer" / "farm_parcel" (this parcel and its farmer are used;
          the crop's barangay is the parcel's)]. The older "crops": [FarmCropSerializer fields...] is still read.
    201:  [{"id": <parcel id>, "parcel_number": "...", "crop_ids": [...], "crop_record_ids": [<monitoring record id>, ...]}, ...]
          (ids in the order sent, so the PCIC form photos can be uploaded to the crop records afterwards)
    400:  {"detail": "...", "errors": [ {} | {field: [messages], "crop_records": [{} | {...}], "crops": [...], "machinery": [...]} , ... ]}
          one entry per parcel sent, so the page can mark the exact row; nothing is saved.

A crop recorded here is exactly a crop added on the Add Crop page: it goes through the same CropMonitoringRecordSerializer, so the
same rules apply (variety, crop status and owner, area against the parcel, duplicates, seed / tree quantity...).

The parcel number, land ownership, farm type and cropping schedule are required here (the Add Farm Parcels form asks for all four).

All or nothing: every parcel is checked first, then everything is saved in one transaction (the crop records are checked as they are
saved, so a later crop sees the earlier ones on its parcel, and any problem undoes the whole request). A parcel number must not
repeat within the request, nor one the farmer already has. Staff only.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator

from . import area_rules
from .models import FarmCrop, FarmMachinery, FarmParcel, Farmer
from .serializers import FarmCropSerializer, FarmMachinerySerializer, FarmParcelSerializer
from production.serializers import CropMonitoringRecordSerializer

MAX_PARCELS = 50
NESTED = ('crops', 'machinery', 'crop_records')
# What the Add Farm Parcels form must have for every parcel, and what is said when it is missing.
REQUIRED = {
    'parcel_number': 'Enter the parcel number.',
    'land_ownership': 'Choose the land ownership.',
    'farm_type': 'Choose the farm type.',
    'cropping_schedule': 'Choose the cropping schedule.',
}


def _check_nested(rows, serializer_class, label):
    """(serializers or None, error) for a parcel's crops / machinery list: the error is the list of per-row error dicts."""
    if rows in (None, ''):
        rows = []
    if not isinstance(rows, list):
        return None, [{'non_field_errors': [f'Send the {label} as a list.']}]
    serializers = [serializer_class(data=row if isinstance(row, dict) else {}) for row in rows]
    errors = []
    for row, serializer in zip(rows, serializers):
        if not isinstance(row, dict):
            errors.append({'non_field_errors': ['Each entry must be an object.']})
        else:
            errors.append({} if serializer.is_valid() else {k: [str(m) for m in v] for k, v in serializer.errors.items()})
    return serializers, (errors if any(errors) else None)


class FarmParcelBulkCreateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, farmer_id):
        farmer = get_object_or_404(Farmer, pk=farmer_id)
        rows = request.data
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'Send a list of at least one parcel.'}, status=status.HTTP_400_BAD_REQUEST)
        if len(rows) > MAX_PARCELS:
            return Response({'detail': f'Add at most {MAX_PARCELS} parcels at a time.'}, status=status.HTTP_400_BAD_REQUEST)

        taken = set(FarmParcel.objects.filter(farmer=farmer).exclude(parcel_number='').values_list('parcel_number', flat=True))
        checked, errors = [], []
        for row in rows:
            if not isinstance(row, dict):
                checked.append(None)
                errors.append({'non_field_errors': ['Each parcel must be an object.']})
                continue
            problems = {}
            parcel_serializer = FarmParcelSerializer(data={k: v for k, v in row.items() if k not in NESTED})
            if not parcel_serializer.is_valid():
                problems.update({k: [str(m) for m in v] for k, v in parcel_serializer.errors.items()})
            for field, message in REQUIRED.items():
                value = row.get(field)
                if field not in problems and not (isinstance(value, str) and value.strip()):
                    problems[field] = [message]
            number = (row.get('parcel_number') or '').strip() if isinstance(row.get('parcel_number'), str) else ''
            if number and 'parcel_number' not in problems:
                if number in taken:
                    problems['parcel_number'] = [f'This farmer already has parcel {number}, or it is entered twice here.']
                taken.add(number)
            crop_serializers, crop_errors = _check_nested(row.get('crops'), FarmCropSerializer, 'crops')
            if crop_errors:
                problems['crops'] = crop_errors
            elif sum(1 for c in (row.get('crops') or []) if c.get('is_main_crop')) > 1:
                problems['crops'] = [{'is_main_crop': ['Only one crop can be the main crop.']}]
            elif crop_serializers and 'area_hectares' not in problems and not parcel_serializer.errors:
                # A crop cannot use more land than its parcel has (see farmers.area_rules).
                messages = area_rules.crop_area_problems(
                    parcel_serializer.validated_data['area_hectares'], parcel_serializer.validated_data.get('cropping_schedule', ''),
                    [s.validated_data['area_hectares'] for s in crop_serializers])
                if any(messages):
                    problems['crops'] = [{'area_hectares': [m]} if m else {} for m in messages]
            machinery_serializers, machinery_errors = _check_nested(row.get('machinery'), FarmMachinerySerializer, 'machinery')
            if machinery_errors:
                problems['machinery'] = machinery_errors
            records = row.get('crop_records')
            if records in (None, ''):
                records = []
            if not isinstance(records, list) or not all(isinstance(r, dict) for r in records):
                problems['crop_records'] = [{'non_field_errors': ['Send the crops as a list of crop records.']}]
                records = []
            errors.append(problems)
            checked.append((parcel_serializer, crop_serializers, machinery_serializers, records))

        if any(errors):
            return Response({'detail': 'Nothing was saved. Fix the marked parcels and try again.', 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)

        created, record_errors = [], []
        with transaction.atomic():
            for parcel_serializer, crop_serializers, machinery_serializers, records in checked:
                parcel = parcel_serializer.save(farmer=farmer)
                crop_ids = []
                for serializer in crop_serializers:
                    crop_ids.append(FarmCrop.objects.create(farm_parcel=parcel, **serializer.validated_data).id)
                for serializer in machinery_serializers:
                    FarmMachinery.objects.create(farm_parcel=parcel, **serializer.validated_data)
                # The crops are the Add Crop page's own records: this parcel, its farmer, and its barangay.
                record_ids, row_problems = [], []
                for item in records:
                    serializer = CropMonitoringRecordSerializer(data={
                        **item, 'farmer': farmer.id, 'farm_parcel': parcel.id, 'farm_location_barangay': parcel.barangay})
                    if serializer.is_valid():
                        record_ids.append(serializer.save(recorded_by=request.user).id)
                        row_problems.append({})
                    else:
                        row_problems.append({k: [str(m) for m in v] for k, v in serializer.errors.items()})
                record_errors.append({'crop_records': row_problems} if any(row_problems) else {})
                created.append({'id': parcel.id, 'parcel_number': parcel.parcel_number, 'crop_ids': crop_ids, 'crop_record_ids': record_ids})
            if any(record_errors):
                transaction.set_rollback(True)
        if any(record_errors):
            return Response({'detail': 'Nothing was saved. Fix the marked parcels and try again.', 'errors': record_errors},
                            status=status.HTTP_400_BAD_REQUEST)
        return Response(created, status=status.HTTP_201_CREATED)
