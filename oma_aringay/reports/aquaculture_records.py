"""
Aquaculture Records report of the Reports page: the production cycles the Aquaculture Records page lists, as a printable report.

GET /api/reports/aquaculture-records/
    search           the fisherfolk's name (any order) or RSBSA / FishR number, the species, or the pond/cage barangay
    ownership        Tenant | Lease | Owner | none (a cycle with no ownership saved)
    cycle            the production cycle's name
    species          a species id                         fisherfolk   a fisherfolk id            organization   an organization id
    barangay         the fisherfolk's registered barangay (the Barangay column)
    pond_location    the barangay the ponds/cages are in (the Pond/Cage Location column)
    culture_type     Pond | Cage | Pen ...                pcic         insured | not_insured
    stocked_from/to  date stocked on or after / on or before (YYYY-MM-DD)
    format           json (the page preview, default) | pdf      (no Excel for this report)      (+ prepared_by / reviewed_by / noted_by / approved_by, each with its _role, for the PDF)

The records are the Aquaculture Records page's own (fisheries.views.stocking_list_queryset, every status), read through the same
serializer, so a row here says what the page says. Nothing is stored for the report. Staff only.
"""
from datetime import date, datetime

from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from associations.models import FisherfolkOrganization
from fisheries.models import Fisherfolk, SpeciesOption
from fisheries.serializers import StockingRecordSerializer
from fisheries.views import stocking_list_queryset
from monitoring.models import AquacultureProductionCycle

from .documents import make_document, respond, text
from .period import period_text

TITLE = 'Aquaculture Records'
HEADERS = ['Ownership', 'Cycle', 'Species', 'Fisherfolk', 'Barangay', 'Pond/Cage Location', 'Culture Type', 'Cooperative', 'Date Stocked', 'PCIC Insured']
# Every status, so a record is never left out of the report that lists them all (the same scope as the page).
ALL_STATUSES = 'Stocked,Near Harvest,Harvested,Total Loss'
OWNERSHIPS = [value for value, _ in AquacultureProductionCycle.OWNERSHIP_CHOICES]
PCIC_CHOICES = {'insured': 'Insured', 'not_insured': 'Not insured'}
DASH = '—'


def _day(request, name):
    raw = request.query_params.get(name, '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError({name: ['Use the date format YYYY-MM-DD.']})


def _id(request, name):
    raw = request.query_params.get(name, '').strip()
    if raw and not raw.isdigit():
        raise ValidationError({name: ['Send the id.']})
    return raw


def _given(request, name):
    return request.query_params.get(name, '').strip()


def _ownership_text(rec):
    ownership = rec.get('ownership') if rec.get('ownership') in OWNERSHIPS else 'Not specified'
    owner = (rec.get('owner_name') or '').strip()
    return f'{ownership} — Owner: {owner}' if ownership == 'Tenant' and owner else ownership


def _cycle_text(rec):
    name = rec.get('production_cycle_name')
    number = f'#{rec["production_cycle_no"]}' if rec.get('production_cycle_no') else ''
    return f'{name} {number}'.strip() if name else (number or DASH)


def _dash(value):
    return value if value not in (None, '') else DASH


def _row(rec):
    return [
        _ownership_text(rec), _cycle_text(rec), _dash(rec.get('species_name')), _dash(rec.get('fisherfolk_name')),
        _dash(rec.get('fisherfolk_barangay')), _dash(rec.get('pond_location_barangay')), _dash(rec.get('culture_type')),
        _dash(rec.get('organization_name')), text(date.fromisoformat(str(rec['date_stocked'])[:10])) if rec.get('date_stocked') else DASH,
        'Yes' if rec.get('has_pcic_insurance') else 'No',
    ]


def _name_of(model, pk, attr):
    obj = model.objects.filter(pk=pk).first()
    return getattr(obj, attr) if obj else f'#{pk}'


def build_document(request):
    ownership = _given(request, 'ownership')
    if ownership and ownership != 'none' and ownership not in OWNERSHIPS:
        raise ValidationError({'ownership': [f'Use one of: {", ".join(OWNERSHIPS + ["none"])}.']})
    pcic = _given(request, 'pcic')
    if pcic and pcic not in PCIC_CHOICES:
        raise ValidationError({'pcic': [f'Use one of: {", ".join(PCIC_CHOICES)}.']})
    species, fisherfolk, organization = _id(request, 'species'), _id(request, 'fisherfolk'), _id(request, 'organization')
    frm, to = _day(request, 'stocked_from'), _day(request, 'stocked_to')
    if frm and to and frm > to:
        raise ValidationError({'stocked_to': ['"To" cannot be before "From".']})

    # The page's own filter names: the registered barangay travels as fisherfolk_barangay (plain `barangay` is the pond's place there).
    wanted = {
        'status': ALL_STATUSES, 'search': _given(request, 'search'), 'ownership': ownership, 'cycle': _given(request, 'cycle'),
        'species': species, 'fisherfolk': fisherfolk, 'organization': organization, 'fisherfolk_barangay': _given(request, 'barangay'),
        'pond_location': _given(request, 'pond_location'), 'culture_type': _given(request, 'culture_type'), 'pcic': pcic,
        'stocked_from': frm.isoformat() if frm else '', 'stocked_to': to.isoformat() if to else '',
    }
    params = {key: value for key, value in wanted.items() if value}
    records = list(stocking_list_queryset(request.user, params))
    data = StockingRecordSerializer(records, many=True, context={'request': request}).data
    rows = [_row(rec) for rec in data]
    insured = sum(1 for rec in data if rec.get('has_pcic_insurance'))

    parts = []
    if ownership:
        parts.append(f'Ownership: {"Not specified" if ownership == "none" else ownership}')
    if wanted['cycle']:
        parts.append(f'Cycle: {wanted["cycle"]}')
    if species:
        parts.append(f'Species: {_name_of(SpeciesOption, species, "species_name")}')
    if fisherfolk:
        parts.append(f'Fisherfolk: {_name_of(Fisherfolk, fisherfolk, "full_name")}')
    if wanted['fisherfolk_barangay']:
        parts.append(f'Barangay: {wanted["fisherfolk_barangay"]}')
    if wanted['pond_location']:
        parts.append(f'Pond/cage location: {wanted["pond_location"]}')
    if wanted['culture_type']:
        parts.append(f'Culture type: {wanted["culture_type"]}')
    if organization:
        parts.append(f'Cooperative: {_name_of(FisherfolkOrganization, organization, "name")}')
    if pcic:
        parts.append(f'PCIC: {PCIC_CHOICES[pcic]}')
    if wanted['search']:
        parts.append(f'Search: "{wanted["search"]}"')
    filters = ' · '.join(parts) or 'All production cycles'

    stats = [['Production Cycles', len(rows)], ['PCIC Insured', insured], ['Not Insured', len(rows) - insured]]
    sections = [{'title': TITLE, 'headers': HEADERS, 'rows': rows, 'empty': 'No aquaculture records match these filters.'}]
    doc = make_document(TITLE, filters, stats, sections, heading='Aquaculture Records Report', period=period_text(frm, to), detail=filters)
    return doc, 'aquaculture_records'


class AquacultureRecordsReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        if request.query_params.get('format', '').lower() in ('excel', 'xlsx'):
            raise ValidationError({'format': ['This report is not offered as an Excel file. Use pdf or json.']})
        doc, stem = build_document(request)
        return respond(doc, request, stem)
