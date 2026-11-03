"""
Report 1 of the Reports page: Registered Farmers, Fisherfolk and Organizations, in bulk or for one record.

GET /api/reports/registered/
    kind             farmers | fisherfolk | farmers_orgs | fisherfolk_orgs   (required)
    id               one record's id: the report of that single farmer / fisherfolk / organization (profile style)
                     (leave it out for the bulk list)
    barangay         bulk only: exactly this barangay
    registered_from  bulk only: registered on or after this date (YYYY-MM-DD)
    registered_to    bulk only: registered on or before this date
    search           bulk only: name, RSBSA / registration number
    gender, is_senior, is_pwd                  bulk, people only: the registration tables' own filters
    is_farm_laborer (true = Farm Laborer, false = Farm Operator), is_icc_ip          farmers only
    fisherfolk_type, is_4ps                    fisherfolk only
    options          1: instead of a report, list up to 25 matching records as {id, label, detail} for the "one record" picker
                     (uses search and barangay)
    individual       auto: with a search that leaves exactly one record, that record's individual report (as if id were sent)
    format           json (the page preview, default) | pdf | excel      (+ prepared_by / reviewed_by (Checked by) / noted_by / approved_by, each with its _role, for the PDF)

Staff only (Admin and Focal Person). The preview, the PDF and the Excel are all built from one document (reports.documents).
"""
from datetime import datetime

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.timezone import localdate
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.utils import day_range_bounds
from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk

from .documents import individual_of, make_document, respond, text, with_row_refs
from .period import period_text
from .pdf_utils import full_name

KINDS = {
    'farmers': ('Registered Farmers', 'registered_farmers'),
    'fisherfolk': ('Registered Fisherfolk', 'registered_fisherfolk'),
    'farmers_orgs': ('Registered Farmers Organizations', 'registered_farmers_organizations'),
    'fisherfolk_orgs': ('Registered Fisherfolk Organizations', 'registered_fisherfolk_organizations'),
}
ONE_TITLES = {
    'farmers': 'Farmer Registration Record',
    'fisherfolk': 'Fisherfolk Registration Record',
    'farmers_orgs': 'Farmers Organization Registration Record',
    'fisherfolk_orgs': 'Fisherfolk Organization Registration Record',
}


def _status(active):
    return 'Active' if active else 'Inactive'


def _date(value):
    if isinstance(value, datetime):
        value = timezone.localtime(value).date() if timezone.is_aware(value) else value.date()
    return text(value)


def _parse_date(request, name):
    raw = request.query_params.get(name, '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError({name: ['Use the date format YYYY-MM-DD.']})


def _true(value):
    return (value or '').strip().lower() in ('true', '1')


def _senior_cutoff():
    """The latest birthdate of a senior citizen (60 or older today, on the Manila calendar)."""
    today = localdate()
    try:
        return today.replace(year=today.year - 60)
    except ValueError:   # 29 February
        return today.replace(year=today.year - 60, day=28)


class Filters:
    """The bulk filters of one request and how they read in the report's subtitle."""

    def __init__(self, request):
        q = request.query_params
        self.barangay = q.get('barangay', '').strip()
        self.frm = _parse_date(request, 'registered_from')
        self.to = _parse_date(request, 'registered_to')
        if self.frm and self.to and self.frm > self.to:
            raise ValidationError({'registered_to': ['"To" cannot be before "From".']})
        self.search = q.get('search', '').strip()
        # The registration tables' own filters (people only; a filter that does not belong to the kind is ignored).
        self.gender = q.get('gender', '').strip()
        self.senior = _true(q.get('is_senior'))
        self.pwd = q.get('is_pwd', '').strip().lower()           # '' | 'true' | 'false'
        self.laborer = q.get('is_farm_laborer', '').strip().lower()
        self.icc_ip = _true(q.get('is_icc_ip'))
        self.fisherfolk_type = q.get('fisherfolk_type', '').strip()
        self.four_ps = _true(q.get('is_4ps'))

    def _people_parts(self, kind):
        parts = []
        if self.gender:
            parts.append(f'Sex: {self.gender}')
        if kind == 'farmers' and self.laborer in ('true', 'false'):
            parts.append('Farm Laborers' if self.laborer == 'true' else 'Farm Operators')
        if kind == 'fisherfolk' and self.fisherfolk_type:
            parts.append(f'Type: {self.fisherfolk_type}')
        if self.senior:
            parts.append('Senior citizens')
        if self.pwd in ('true', 'false'):
            parts.append('PWD' if self.pwd == 'true' else 'Not PWD')
        if kind == 'farmers' and self.icc_ip:
            parts.append('ICC/IP members')
        if kind == 'fisherfolk' and self.four_ps:
            parts.append('4Ps beneficiaries')
        return parts

    def subtitle(self, dates=True, kind=None):
        parts = []
        if self.barangay:
            parts.append(f'Barangay: {self.barangay}')
        parts.extend(self._people_parts(kind))
        if dates and (self.frm or self.to):
            span = ' '.join(x for x in (f'from {text(self.frm)}' if self.frm else '', f'to {text(self.to)}' if self.to else '') if x)
            parts.append(f'Registered {span}')
        if self.search:
            parts.append(f'Search: "{self.search}"')
        return ' · '.join(parts) or 'All records'

    def apply_people(self, qs, number_field, kind=None):
        if self.barangay:
            qs = qs.filter(barangay__iexact=self.barangay)
        if self.gender:
            qs = qs.filter(gender__iexact=self.gender)
        if self.senior:
            qs = qs.filter(birthdate__lte=_senior_cutoff())
        if self.pwd in ('true', 'false'):
            qs = qs.filter(is_pwd=self.pwd == 'true')
        if kind == 'farmers':
            if self.laborer in ('true', 'false'):
                qs = qs.filter(is_farm_laborer=self.laborer == 'true')
            if self.icc_ip:
                qs = qs.filter(is_icc_ip_member=True)
        if kind == 'fisherfolk':
            if self.fisherfolk_type:
                qs = qs.filter(fisherfolk_type__iexact=self.fisherfolk_type)
            if self.four_ps:
                qs = qs.filter(is_4ps_beneficiary=True)
        if self.frm:
            qs = qs.filter(date_registered__gte=day_range_bounds(self.frm.isoformat()))
        if self.to:
            qs = qs.filter(date_registered__lte=day_range_bounds(self.to.isoformat(), end_of_day=True))
        if self.search:
            term = Q()
            for word in self.search.split():
                term &= (Q(first_name__icontains=word) | Q(last_name__icontains=word) | Q(middle_name__icontains=word)
                         | Q(**{f'{number_field}__icontains': word}))
            qs = qs.filter(term)
        return qs

    def apply_orgs(self, qs):
        if self.barangay:
            qs = qs.filter(barangay__iexact=self.barangay)
        if self.frm:
            qs = qs.filter(date_registered__gte=self.frm)
        if self.to:
            qs = qs.filter(date_registered__lte=self.to)
        if self.search:
            qs = qs.filter(Q(name__icontains=self.search) | Q(registration_number__icontains=self.search)
                           | Q(contact_person__icontains=self.search))
        return qs


# ─── Bulk lists ───────────────────────────────────────────────────────────────

def _orgs_of(memberships):
    return '; '.join(m.organization.name for m in memberships if m.is_active) or '—'


def bulk_farmers(filters):
    qs = filters.apply_people(
        Farmer.objects.prefetch_related('farm_parcels', 'farmer_organizations__organization'), 'rsbsa_number', kind='farmers',
    ).order_by('last_name', 'first_name', 'id')
    rows, refs = [], []
    for f in qs:
        parcels = list(f.farm_parcels.all())
        area = sum((p.area_hectares or 0) for p in parcels)
        rows.append([f.rsbsa_number, full_name(f), f.gender, f.barangay, f.contact_number or '—', len(parcels),
                     f'{area:.2f}', _orgs_of(f.farmer_organizations.all()), _date(f.date_registered)])
        refs.append({'id': f.id, 'label': full_name(f)})
    headers = ['RSBSA No.', 'Name', 'Sex', 'Barangay', 'Contact No.', 'Parcels', 'Area (ha)', 'Organization', 'Date Registered']
    return with_row_refs(
        make_document('Registered Farmers', filters.subtitle(kind='farmers'), [['Total Farmers', len(rows)]],
                      [{'title': 'Farmers', 'headers': headers, 'rows': rows, 'empty': 'No farmers match these filters.'}]), refs)


def bulk_fisherfolk(filters):
    qs = filters.apply_people(
        Fisherfolk.objects.prefetch_related('fisherfolk_organizations__organization'), 'rsbsa_number', kind='fisherfolk',
    ).order_by('last_name', 'first_name', 'id')
    rows, refs = [], []
    for f in qs:
        rows.append([f.rsbsa_number or '—', full_name(f), f.gender, f.barangay, f.contact_number or '—', f.fisherfolk_type,
                     _orgs_of(f.fisherfolk_organizations.all()), _date(f.date_registered)])
        refs.append({'id': f.id, 'label': full_name(f)})
    headers = ['RSBSA No.', 'Name', 'Sex', 'Barangay', 'Contact No.', 'Type', 'Organization', 'Date Registered']
    return with_row_refs(
        make_document('Registered Fisherfolk', filters.subtitle(kind='fisherfolk'), [['Total Fisherfolk', len(rows)]],
                      [{'title': 'Fisherfolk', 'headers': headers, 'rows': rows, 'empty': 'No fisherfolk match these filters.'}]), refs)


def _bulk_orgs(model, title, filters):
    qs = filters.apply_orgs(model.objects.prefetch_related('members')).order_by('barangay', 'name', 'id')
    rows, refs = [], []
    for o in qs:
        active = sum(1 for m in o.members.all() if m.is_active)
        rows.append([o.name, o.registration_number or '—', o.barangay, o.contact_person or '—', o.contact_number or '—',
                     active, _date(o.date_registered) or '—'])
        refs.append({'id': o.id, 'label': o.name})
    headers = ['Organization', 'Registration No.', 'Barangay', 'Contact Person', 'Contact No.', 'Active Members', 'Date Registered']
    return with_row_refs(
        make_document(title, filters.subtitle(), [['Total Organizations', len(rows)]],
                      [{'title': 'Organizations', 'headers': headers, 'rows': rows, 'empty': 'No organizations match these filters.'}]), refs)


# ─── One record ───────────────────────────────────────────────────────────────

def _yes(value):
    return 'Yes' if value else 'No'


def one_farmer(pk):
    f = get_object_or_404(Farmer.objects.prefetch_related('farm_parcels', 'farmer_organizations__organization'), pk=pk)
    details = [
        ['RSBSA No.', f.rsbsa_number], ['Name', full_name(f)], ['Sex', f.gender], ['Birthdate', text(f.birthdate)],
        ['Civil Status', f.civil_status], ['Barangay', f.barangay], ['Contact No.', f.contact_number], ['Email', f.email],
        ['Highest Education', f.highest_education], ['PWD', _yes(f.is_pwd)], ['4Ps Beneficiary', _yes(f.is_4ps_beneficiary)],
        ['Senior Citizen', _yes(f.is_senior_citizen)], ['Date Registered', _date(f.date_registered)],
    ]
    parcels = [[p.parcel_number or '—', p.barangay, f'{p.area_hectares:.2f}', p.land_ownership or '—', p.commodity_name or '—']
               for p in f.farm_parcels.all()]
    orgs = [[m.organization.name, m.position, text(m.date_joined), _status(m.is_active)] for m in f.farmer_organizations.all()]
    return make_document(ONE_TITLES['farmers'], full_name(f), [], [
        {'title': 'Farmer Details', 'pairs': details},
        {'title': 'Farm Parcels', 'headers': ['Parcel No.', 'Barangay', 'Area (ha)', 'Ownership', 'Commodity'],
         'rows': parcels, 'empty': 'No farm parcels on record.'},
        {'title': 'Organizations', 'headers': ['Organization', 'Position', 'Date Joined', 'Status'], 'rows': orgs,
         'empty': 'Not a member of any organization.'},
    ])


def one_fisherfolk(pk):
    f = get_object_or_404(Fisherfolk.objects.prefetch_related('fisherfolk_organizations__organization'), pk=pk)
    details = [
        ['RSBSA No.', f.rsbsa_number], ['Name', full_name(f)], ['Sex', f.gender], ['Birthdate', text(f.birthdate)],
        ['Civil Status', f.civil_status], ['Barangay', f.barangay], ['Contact No.', f.contact_number], ['Email', f.email],
        ['Type', f.fisherfolk_type], ['Highest Education', f.highest_education], ['PWD', _yes(f.is_pwd)],
        ['4Ps Beneficiary', _yes(f.is_4ps_beneficiary)], ['Senior Citizen', _yes(f.is_senior_citizen)],
        ['Date Registered', _date(f.date_registered)],
    ]
    orgs = [[m.organization.name, m.position, text(m.date_joined), _status(m.is_active)] for m in f.fisherfolk_organizations.all()]
    return make_document(ONE_TITLES['fisherfolk'], full_name(f), [], [
        {'title': 'Fisherfolk Details', 'pairs': details},
        {'title': 'Organizations', 'headers': ['Organization', 'Position', 'Date Joined', 'Status'], 'rows': orgs,
         'empty': 'Not a member of any organization.'},
    ])


def _one_org(model, member_label, person_field, kind, pk):
    o = get_object_or_404(model.objects.prefetch_related('officers', 'members__' + person_field), pk=pk)
    details = [
        ['Name', o.name], ['Registration No.', o.registration_number], ['Registration Agency', o.registration_agency],
        ['Barangay', o.barangay], ['Address', o.street_address], ['Contact Person', o.contact_person],
        ['Contact No.', o.contact_number], ['Email', o.email_address], ['Date Organized', text(o.date_organized)],
        ['Date Registered', text(o.date_registered)],
        ['Active Members', sum(1 for m in o.members.all() if m.is_active)],
    ]
    officers = [[off.position, off.full_name, text(off.term_start_date), _status(off.is_active)] for off in o.officers.all()]
    members = []
    for m in o.members.all():
        person = getattr(m, person_field)
        members.append([full_name(person), person.rsbsa_number or '—', m.position, text(m.date_joined), _status(m.is_active)])
    return make_document(ONE_TITLES[kind], o.name, [], [
        {'title': 'Organization Details', 'pairs': details},
        {'title': 'Officers', 'headers': ['Position', 'Name', 'Term Start', 'Status'], 'rows': officers, 'empty': 'No officers on record.'},
        {'title': member_label, 'headers': ['Name', 'RSBSA No.', 'Position', 'Date Joined', 'Status'], 'rows': members,
         'empty': 'No members on record.'},
    ])


OPTION_LIMIT = 25


def record_options(kind, filters):
    """Matching records for the picker that chooses one farmer / fisherfolk / organization."""
    if kind == 'farmers':
        qs = filters.apply_people(Farmer.objects.all(), 'rsbsa_number').order_by('last_name', 'first_name', 'id')[:OPTION_LIMIT]
        return [{'id': r.id, 'label': full_name(r), 'detail': f'{r.rsbsa_number} · {r.barangay}'} for r in qs]
    if kind == 'fisherfolk':
        qs = filters.apply_people(Fisherfolk.objects.all(), 'rsbsa_number').order_by('last_name', 'first_name', 'id')[:OPTION_LIMIT]
        return [{'id': r.id, 'label': full_name(r), 'detail': f'{r.rsbsa_number} · {r.barangay}'} for r in qs]
    model = FarmersOrganization if kind == 'farmers_orgs' else FisherfolkOrganization
    qs = filters.apply_orgs(model.objects.all()).order_by('name', 'id')[:OPTION_LIMIT]
    return [{'id': r.id, 'label': r.name, 'detail': f'{r.registration_number or "No registration no."} · {r.barangay}'} for r in qs]


class RegisteredRecordsReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        kind = request.query_params.get('kind', '')
        if kind not in KINDS:
            raise ValidationError({'kind': [f'Use one of: {", ".join(KINDS)}.']})
        if request.query_params.get('options'):
            return Response(record_options(kind, Filters(request)))
        raw_id = request.query_params.get('id', '').strip()
        if raw_id:
            if not raw_id.isdigit():
                raise ValidationError({'id': ['Send the record id.']})
            return self._one(kind, int(raw_id), request)
        filters = Filters(request)
        if kind == 'farmers':
            doc = bulk_farmers(filters)
        elif kind == 'fisherfolk':
            doc = bulk_fisherfolk(filters)
        elif kind == 'farmers_orgs':
            doc = _bulk_orgs(FarmersOrganization, KINDS[kind][0], filters)
        else:
            doc = _bulk_orgs(FisherfolkOrganization, KINDS[kind][0], filters)
        # individual=auto: a search that leaves exactly one record is that record's individual report (never without a search).
        only = individual_of(request, doc['row_refs']) if filters.search else None
        if only:
            return self._one(kind, only['id'], request, individual=only)
        # The printed title is the report's own; the kind (farmers, fisherfolk, ...) and the filters sit under the period.
        doc['heading'] = 'Registration Records Report'
        doc['period'] = period_text(filters.frm, filters.to)
        doc['detail'] = ' · '.join(p for p in (doc['title'], filters.subtitle(dates=False)) if p)
        return respond(doc, request, KINDS[kind][1])

    @staticmethod
    def _one(kind, pk, request, individual=None):
        if kind == 'farmers':
            doc = one_farmer(pk)
        elif kind == 'fisherfolk':
            doc = one_fisherfolk(pk)
        elif kind == 'farmers_orgs':
            doc = _one_org(FarmersOrganization, 'Members', 'farmer', kind, pk)
        else:
            doc = _one_org(FisherfolkOrganization, 'Members', 'fisherfolk', kind, pk)
        if individual:
            doc['individual'] = individual
        return respond(doc, request, ONE_TITLES[kind].lower().replace(' ', '_') + f'_{pk}')
