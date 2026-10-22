"""
Reports 4 and 5 of the Reports page: the Fisheries Disaster report and the Crop / Parcel Disaster report.

GET /api/reports/disasters/fisheries/   and   GET /api/reports/disasters/crops/
    date_from / date_to   disaster occurred on or after / on or before this date (YYYY-MM-DD)
    barangay              the fisherfolk's / crop's barangay
    disaster_type         one of the disaster types of that kind
    status                Active | Recovered
    search                name, species / crop, disaster type, reference no.
    format                json (the page preview, default) | pdf | excel      (+ prepared_by / reviewed_by / noted_by for the PDF)

Staff only (Admin and Focal Person). Read-only: these are the logs already kept by Admin > Disaster. The preview, the PDF and
the Excel are all built from one document (reports.documents).
"""
from datetime import datetime

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from fisheries import disaster_reports
from fisheries.models import FisheriesDisasterReport, FisheriesDisasterStockLoss
from production import crop_disaster_logs
from production.models import CropDisasterReport

from .documents import make_document, respond, text


def _parse_date(request, name):
    raw = request.query_params.get(name, '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError({name: ['Use the date format YYYY-MM-DD.']})


def _reference_number(search):
    """The id out of a typed reference no. ('FDR-2026-00012', 'cdr-2026-12' or just '12'), or None."""
    tail = search.upper().replace('FDR-', '').replace('CDR-', '').split('-')[-1]
    return int(tail) if tail.isdigit() else None


class Filters:
    """The filters of one request, and how they read in the report's subtitle."""

    def __init__(self, request, valid_types):
        q = request.query_params
        self.frm = _parse_date(request, 'date_from')
        self.to = _parse_date(request, 'date_to')
        if self.frm and self.to and self.frm > self.to:
            raise ValidationError({'date_to': ['"To" cannot be before "From".']})
        self.barangay = q.get('barangay', '').strip()
        self.disaster_type = q.get('disaster_type', '').strip()
        if self.disaster_type and self.disaster_type not in valid_types:
            raise ValidationError({'disaster_type': ['Not a disaster type.']})
        self.status = q.get('status', '').strip()
        if self.status not in ('', 'Active', 'Recovered'):
            raise ValidationError({'status': ['Use Active or Recovered.']})
        self.search = q.get('search', '').strip()

    def apply_common(self, qs):
        if self.frm:
            qs = qs.filter(date_of_occurrence__gte=self.frm)
        if self.to:
            qs = qs.filter(date_of_occurrence__lte=self.to)
        if self.disaster_type:
            qs = qs.filter(disaster_type=self.disaster_type)
        if self.status:
            qs = qs.filter(status=self.status)
        return qs

    def subtitle(self):
        parts = []
        if self.frm or self.to:
            span = ' '.join(x for x in (f'from {text(self.frm)}' if self.frm else '', f'to {text(self.to)}' if self.to else '') if x)
            parts.append(f'Occurred {span}')
        if self.barangay:
            parts.append(f'Barangay: {self.barangay}')
        if self.disaster_type:
            parts.append(f'Type: {self.disaster_type}')
        if self.status:
            parts.append(f'Status: {self.status}')
        if self.search:
            parts.append(f'Search: "{self.search}"')
        return ' · '.join(parts) or 'All disaster reports'


def _count(rows, index, value):
    return sum(1 for row in rows if row[index] == value)


def _status(report):
    return report.status


def _logged(report):
    return text(timezone.localtime(report.date_reported).date())


def _yes_no(flag):
    return 'Yes' if flag else 'No'


# ─── Fisheries ────────────────────────────────────────────────────────────────

FISHERIES_HEADERS = ['Reference No.', 'Fisherfolk', 'Barangay', 'Stock / Cycle', 'Disaster Type', 'Date of Occurrence',
                     'Volume Lost (kg)', 'Total Loss', 'Status', 'Date Logged']


def fisheries_document(filters):
    qs = filters.apply_common(disaster_reports.report_queryset())
    if filters.barangay:
        qs = qs.filter(Q(fisherfolk__barangay__iexact=filters.barangay) | Q(stocking_record__fisherfolk__barangay__iexact=filters.barangay))
    if filters.search:
        match = (Q(fisherfolk__first_name__icontains=filters.search) | Q(fisherfolk__last_name__icontains=filters.search)
                 | Q(stocking_record__fisherfolk__first_name__icontains=filters.search)
                 | Q(stocking_record__fisherfolk__last_name__icontains=filters.search)
                 | Q(stocking_record__species__species_name__icontains=filters.search)
                 | Q(disaster_type__icontains=filters.search) | Q(disaster_type_other_specify__icontains=filters.search)
                 | Q(pk__in=FisheriesDisasterStockLoss.objects.filter(
                     stocking_record__species__species_name__icontains=filters.search).values('disaster_report_id')))
        ref = _reference_number(filters.search)
        if ref is not None:
            match |= Q(pk=ref)
        qs = qs.filter(match)
    qs = qs.order_by('-date_of_occurrence', '-id')

    rows, volume = [], 0
    for report in qs:
        owner = report.owner_fisherfolk
        lost = report.volume_lost_kg
        volume += lost or 0
        rows.append([
            report.report_number, owner.full_name if owner else '—', owner.barangay if owner else '—',
            disaster_reports.affected_stocks_label(report) or 'General (no stock)',
            disaster_reports.disaster_type_label(report), text(report.date_of_occurrence),
            f'{lost:.2f}' if lost is not None else '—', _yes_no(report.is_total_loss), _status(report), _logged(report),
        ])
    stats = [['Total Reports', len(rows)], ['Active', _count(rows, 8, 'Active')], ['Recovered', _count(rows, 8, 'Recovered')],
             ['Total Losses', _count(rows, 7, 'Yes')], ['Volume Lost (kg)', f'{volume:.2f}']]
    return make_document('Fisheries Disaster Reports', filters.subtitle(), stats,
                         [{'title': 'Disaster Reports', 'headers': FISHERIES_HEADERS, 'rows': rows,
                           'empty': 'No fisheries disaster reports match these filters.'}])


# ─── Crops / parcels ──────────────────────────────────────────────────────────

CROP_HEADERS = ['Reference No.', 'Farmer', 'Barangay', 'Crop', 'Farm Parcel', 'Disaster Type', 'Date of Occurrence',
                'Area Affected (ha)', 'Total Loss', 'Status', 'Date Logged']


def crops_document(filters):
    qs = filters.apply_common(crop_disaster_logs.crop_queryset())
    if filters.barangay:
        qs = qs.filter(Q(monitoring_record__farm_location_barangay__iexact=filters.barangay)
                       | Q(monitoring_record__farm_location_barangay='', monitoring_record__farm_parcel__barangay__iexact=filters.barangay))
    if filters.search:
        s = filters.search
        match = (Q(monitoring_record__farmer__first_name__icontains=s) | Q(monitoring_record__farmer__last_name__icontains=s)
                 | Q(monitoring_record__farm_parcel__farmer__first_name__icontains=s)
                 | Q(monitoring_record__farm_parcel__farmer__last_name__icontains=s)
                 | Q(monitoring_record__farmers_organization__name__icontains=s)
                 | Q(monitoring_record__crop_type__name__icontains=s)
                 | Q(disaster_type__icontains=s) | Q(disaster_type_other_specify__icontains=s))
        ref = _reference_number(s)
        if ref is not None:
            match |= Q(pk=ref)
        qs = qs.filter(match)
    qs = qs.order_by('-date_of_occurrence', '-id')

    rows, area = [], 0
    for report in qs:
        record = report.monitoring_record
        affected = report.area_affected_ha
        area += affected or 0
        parcel = record.farm_parcel.parcel_number if record.farm_parcel_id and record.farm_parcel.parcel_number else '—'
        rows.append([
            crop_disaster_logs.reference_number(report), crop_disaster_logs.owner_name(record) or '—',
            crop_disaster_logs.location(record) or '—', record.crop_type.name, parcel,
            crop_disaster_logs.type_label(report), text(report.date_of_occurrence),
            f'{affected:.2f}' if affected is not None else '—', _yes_no(report.is_total_loss), _status(report),
            _logged(report),
        ])
    stats = [['Total Reports', len(rows)], ['Active', _count(rows, 9, 'Active')], ['Recovered', _count(rows, 9, 'Recovered')],
             ['Total Losses', _count(rows, 8, 'Yes')], ['Area Affected (ha)', f'{area:.2f}']]
    return make_document('Crop / Parcel Disaster Reports', filters.subtitle(), stats,
                         [{'title': 'Disaster Reports', 'headers': CROP_HEADERS, 'rows': rows,
                           'empty': 'No crop disaster reports match these filters.'}])


class _DisasterReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    model = None
    build = None
    stem = ''

    def get(self, request):
        valid = {value for value, _ in self.model.DISASTER_TYPE_CHOICES}
        return respond(type(self).build(Filters(request, valid)), request, self.stem)


class FisheriesDisasterReportsReport(_DisasterReport):
    model = FisheriesDisasterReport
    build = staticmethod(fisheries_document)
    stem = 'fisheries_disaster_reports'


class CropDisasterReportsReport(_DisasterReport):
    model = CropDisasterReport
    build = staticmethod(crops_document)
    stem = 'crop_disaster_reports'
