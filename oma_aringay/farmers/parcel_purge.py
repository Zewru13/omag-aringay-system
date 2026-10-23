"""
Purge a farm parcel that was sold or transferred to someone else, and the table of purged parcels.

POST /api/farmers/parcels/<id>/purge/
    body: { reason: 'Sold' | 'Transferred', date: 'YYYY-MM-DD' (optional, today by default; not in the future), note: '' (optional) }
    Refused while any crop on the parcel is still growing (Planted or Near Harvest): harvest or close those records first, so no
    active crop disappears silently. A purged parcel leaves Crop Records, the parcel pickers and Crop Monitoring; its finished crop
    records (Harvested, Total Loss) are kept. Staff only.

GET /api/farmers/parcels/purged/?search=&page=
    The purged parcels, newest first (paged). Staff only.
"""
from django.db import transaction
from django.db.models import Count
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.utils import filter_people_search

from .models import FarmParcel

MAX_NOTE_LENGTH = 500


class PurgedParcelSerializer(serializers.ModelSerializer):
    """One line of the Purged Parcels table."""
    farmer_name = serializers.SerializerMethodField()
    rsbsa_number = serializers.CharField(source='farmer.rsbsa_number', read_only=True)
    purged_by_name = serializers.SerializerMethodField()
    record_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = FarmParcel
        fields = ['id', 'farmer', 'farmer_name', 'rsbsa_number', 'parcel_number', 'barangay', 'area_hectares', 'land_ownership',
                  'commodity_name', 'record_count', 'purge_reason', 'purge_date', 'purge_note', 'purged_at', 'purged_by_name']
        read_only_fields = fields

    def get_farmer_name(self, obj):
        f = obj.farmer
        return ' '.join(part for part in (f.first_name, f.last_name) if part)

    def get_purged_by_name(self, obj):
        user = obj.purged_by
        if not user:
            return ''
        return (user.get_full_name() or user.username) if hasattr(user, 'get_full_name') else str(user)


def _growing_message(parcel):
    """Why the parcel cannot be purged yet ('' when it can): the crops still growing on it."""
    from production.duplicates import ACTIVE_STATUSES
    from production.models import CropMonitoringRecord
    growing = list(
        CropMonitoringRecord.objects.filter(farm_parcel=parcel, status__in=ACTIVE_STATUSES).select_related('crop_type').order_by('id')
    )
    if not growing:
        return ''
    names = ', '.join(sorted({r.crop_type.name for r in growing if r.crop_type_id}) or ['crop'])
    return (f'{len(growing)} crop record{"" if len(growing) == 1 else "s"} ({names}) {"is" if len(growing) == 1 else "are"} still growing on '
            f'this parcel. Harvest them or mark them as lost first, then purge the parcel.')


class FarmParcelPurgeView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, id):
        today = timezone.localdate()
        reason = request.data.get('reason')
        if reason not in FarmParcel.PurgeReason.values:
            raise ValidationError({'reason': 'Choose why the parcel is leaving: Sold or Transferred.'})
        raw_date = request.data.get('date') or None
        date = today
        if raw_date:
            field = serializers.DateField()
            try:
                date = field.run_validation(raw_date)
            except serializers.ValidationError:
                raise ValidationError({'date': 'Enter the date as YYYY-MM-DD.'})
            if date > today:
                raise ValidationError({'date': 'The date cannot be in the future.'})
        raw_note = request.data.get('note')
        note = raw_note.strip() if isinstance(raw_note, str) else ''
        if len(note) > MAX_NOTE_LENGTH:
            raise ValidationError({'note': f'Keep the note under {MAX_NOTE_LENGTH} characters.'})

        with transaction.atomic():
            # `objects` only holds parcels in use, so one already purged is a 404; locked so two purges cannot both pass the check.
            parcel = get_object_or_404(FarmParcel.objects.select_for_update(), pk=id)
            blocked = _growing_message(parcel)
            if blocked:
                raise ValidationError({'detail': blocked})
            parcel.purged_at = timezone.now()
            parcel.purge_reason = reason
            parcel.purge_date = date
            parcel.purge_note = note
            parcel.purged_by = request.user
            parcel.save(update_fields=['purged_at', 'purge_reason', 'purge_date', 'purge_note', 'purged_by'])
        return Response({'id': parcel.id, 'purged_at': parcel.purged_at}, status=status.HTTP_200_OK)


class PurgedParcelListView(generics.ListAPIView):
    serializer_class = PurgedParcelSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get_queryset(self):
        qs = (
            FarmParcel.all_objects.filter(purged_at__isnull=False)
            .select_related('farmer', 'purged_by')
            .annotate(record_count=Count('monitoring_records'))
            .order_by('-purged_at', '-id')
        )
        search = self.request.query_params.get('search')
        if search:
            qs = filter_people_search(
                qs, search,
                name_fields=['farmer__first_name', 'farmer__middle_name', 'farmer__last_name'],
                id_fields=['farmer__rsbsa_number'],
                other_fields=['parcel_number'],
            )
        return qs
