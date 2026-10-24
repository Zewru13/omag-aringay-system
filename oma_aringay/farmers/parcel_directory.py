"""
The farm parcels of the Crop Records page: the list (filters + sort) and the same list grouped.

    GET /api/farmers/parcels/directory/?search=&farmer=&barangay=&land_ownership=&ordering=&page=
    GET /api/farmers/parcels/directory/groups/?group_by=farmer|barangay|ownership&<the same filters>&ordering=&page=

`ordering`: name (the default: farmer A-Z), crops (most crops first), crops_asc (fewest first), area (largest first), number (parcel number).
A group is one farmer, one barangay or one land ownership; it carries how many parcels it holds, their total area and how many crop
records sit on them. Opening a group is the ordinary list scoped to it (?farmer=, ?barangay=, ?land_ownership=) with the same filters, so
counts and rows always agree. Groups follow the same ordering (alphabetical, or by crops / area), ten groups a page. Staff only.
"""
from django.db.models import Count, F, IntegerField, OuterRef, Q, Subquery, Sum, Value
from django.db.models.functions import Coalesce
from rest_framework.exceptions import ValidationError
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.utils import filter_people_search

from .models import FarmParcel

NAME_ORDER = ('farmer__last_name', 'farmer__first_name', 'farmer_id', 'id')
ORDERINGS = {
    'name': NAME_ORDER,
    'crops': ('-crop_count',) + NAME_ORDER,
    'crops_asc': ('crop_count',) + NAME_ORDER,
    'area': ('-area_hectares',) + NAME_ORDER,
    'number': ('parcel_number', 'id'),
}
GROUPS = ('farmer', 'barangay', 'ownership')


def _crop_count():
    """How many crop records sit on the parcel. Total Loss records are left out of the crop list under a parcel (as on Crop Monitoring),
    so out of the count. A subquery, so summing it over a group never multiplies the parcel's area."""
    from production.models import CropMonitoringRecord
    records = (
        CropMonitoringRecord.objects.filter(farm_parcel=OuterRef('pk')).exclude(status='Total Loss')
        .order_by().values('farm_parcel').annotate(total=Count('pk')).values('total')
    )
    return Coalesce(Subquery(records, output_field=IntegerField()), Value(0))


def directory_filters(params):
    """The parcels that match the page's filters, with their crop_count (not ordered)."""
    qs = FarmParcel.objects.select_related('farmer').annotate(crop_count=_crop_count())
    if params.get('farmer'):
        qs = qs.filter(farmer_id=params['farmer'])
    if params.get('barangay'):
        qs = qs.filter(barangay__iexact=params['barangay'])
    if params.get('land_ownership'):
        qs = qs.filter(land_ownership__iexact=params['land_ownership'])
    search = params.get('search')
    if search:
        qs = filter_people_search(
            qs, search,
            name_fields=['farmer__first_name', 'farmer__middle_name', 'farmer__last_name'],
            id_fields=['farmer__rsbsa_number'],
            other_fields=['parcel_number'],
        )
    return qs


def directory_queryset(params):
    ordering = params.get('ordering') or 'name'
    if ordering not in ORDERINGS:
        raise ValidationError({'ordering': f'Use one of: {", ".join(ORDERINGS)}.'})
    return directory_filters(params).order_by(*ORDERINGS[ordering])


class FarmParcelDirectoryGroupsView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        group_by = request.query_params.get('group_by')
        if group_by not in GROUPS:
            raise ValidationError({'group_by': f'Use group_by={", group_by=".join(GROUPS)}.'})
        ordering = request.query_params.get('ordering') or 'name'
        if ordering not in ORDERINGS:
            raise ValidationError({'ordering': f'Use one of: {", ".join(ORDERINGS)}.'})
        qs = directory_filters(request.query_params).order_by()
        totals = dict(parcels=Count('id'), area=Sum('area_hectares'), crops=Sum('crop_count'))
        if group_by == 'farmer':
            rows = qs.values('farmer_id', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name', 'farmer__barangay').annotate(**totals)
            name_order = ('farmer__last_name', 'farmer__first_name', 'farmer_id')
        elif group_by == 'barangay':
            rows = qs.values('barangay').annotate(**totals)
            name_order = ('barangay',)
        else:
            rows = qs.values('land_ownership').annotate(**totals)
            name_order = ('land_ownership',)
        # Alphabetical unless the page asks for the groups with the most crops (or the most land) first.
        lead = {'crops': ('-crops',), 'crops_asc': ('crops',), 'area': ('-area',)}.get(ordering, ())
        rows = rows.order_by(*lead, *name_order)
        paginator = PageNumberPagination()
        page = paginator.paginate_queryset(rows, request, view=self)
        return paginator.get_paginated_response([self._shape(group_by, row) for row in page])

    @staticmethod
    def _shape(group_by, row):
        shared = {'parcels': row['parcels'], 'area_hectares': float(row['area'] or 0), 'crops': row['crops'] or 0}
        if group_by == 'farmer':
            name = ' '.join(n for n in (row['farmer__first_name'], row['farmer__middle_name'], row['farmer__last_name']) if n)
            return {'key': f"f{row['farmer_id']}", 'id': row['farmer_id'], 'name': name, 'barangay': row['farmer__barangay'] or '', **shared}
        if group_by == 'barangay':
            return {'key': f"b{row['barangay']}", 'id': row['barangay'], 'name': row['barangay'] or 'No barangay', 'barangay': '', **shared}
        return {'key': f"o{row['land_ownership']}", 'id': row['land_ownership'], 'name': row['land_ownership'] or 'No ownership', 'barangay': '', **shared}
