"""
Add several farm parcels to one farmer in one request (the Add Farm Parcels page), each with its own crops and machinery.

POST /api/farmers/<farmer_id>/parcels/bulk/
    body: a list of 1-50 parcels. Each is the parcel's fields (as FarmParcelSerializer takes them, `classifications` included)
          plus  "crops": [FarmCropSerializer fields...]  and  "machinery": [FarmMachinerySerializer fields...].
    201:  [{"id": <parcel id>, "parcel_number": "...", "crop_ids": [<crop id>, ...]}, ...]   (crop ids in the order sent, so the
          PCIC form photos can be uploaded to them afterwards)
    400:  {"detail": "...", "errors": [ {} | {field: [messages], "crops": [{} | {...}], "machinery": [{} | {...}]} , ... ]}
          one entry per parcel sent, so the page can mark the exact row; nothing is saved.

All or nothing: every row is checked first, then everything is saved in one transaction. A parcel number must not repeat within
the request, nor one the farmer already has (parcels without a number never clash). Staff only.
"""
from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator

from .models import FarmCrop, FarmMachinery, FarmParcel, Farmer
from .serializers import FarmCropSerializer, FarmMachinerySerializer, FarmParcelSerializer

MAX_PARCELS = 50
NESTED = ('crops', 'machinery')


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
            machinery_serializers, machinery_errors = _check_nested(row.get('machinery'), FarmMachinerySerializer, 'machinery')
            if machinery_errors:
                problems['machinery'] = machinery_errors
            errors.append(problems)
            checked.append((parcel_serializer, crop_serializers, machinery_serializers))

        if any(errors):
            return Response({'detail': 'Nothing was saved. Fix the marked parcels and try again.', 'errors': errors},
                            status=status.HTTP_400_BAD_REQUEST)

        created = []
        with transaction.atomic():
            for parcel_serializer, crop_serializers, machinery_serializers in checked:
                parcel = parcel_serializer.save(farmer=farmer)
                crop_ids = []
                for serializer in crop_serializers:
                    crop_ids.append(FarmCrop.objects.create(farm_parcel=parcel, **serializer.validated_data).id)
                for serializer in machinery_serializers:
                    FarmMachinery.objects.create(farm_parcel=parcel, **serializer.validated_data)
                created.append({'id': parcel.id, 'parcel_number': parcel.parcel_number, 'crop_ids': crop_ids})
        return Response(created, status=status.HTTP_201_CREATED)
