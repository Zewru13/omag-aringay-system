"""
Report 6 of the Reports page: Organization Assistance - the assistance an organization distributed to its members, for one
organization or for all of them, with the name of every member who received it; and the assistance given straight to individual
farmers or fisherfolk (no organization).

GET /api/reports/organization-assistance/
    kind             farmers | fisherfolk | individual_farmers | individual_fisherfolk   (required)
                     farmers / fisherfolk: the organizations' distributions (one row each) and, under them, a Recipients table with one
                     row per member who received something. individual_*: one Recipients table of the assistance given directly to
                     people (records with no distributing organization), so nobody is listed under an organization they did not use.
    id               (farmers / fisherfolk only) one organization's id: that organization's distributions plus every recipient (leave it out for all)
    date_from/to     assistance given on or after / on or before this date (YYYY-MM-DD)
    assistance_type  one of that kind's assistance types
    source_agency    assistance from this agency
    status           confirmed | awaiting | follow_up   (the distribution's overall status; for individual_* the entry's own status)
    search           organization name (all-organizations report only); for individual_*: the recipient's name
    individual       auto: with a search that leaves exactly one organization, that organization's own report (as if id were sent)
    format           json (the page preview, default) | pdf | excel      (+ prepared_by / reviewed_by (Checked by) / noted_by / approved_by, each with its _role, for the PDF)

One row per distribution (the records one distribution submit created, shown as one unit - interventions.distributions).
Only distributions an organization ran are included in the organization reports (records with `distributed_by_organization`);
assistance staff logged for a single person is the individual reports' (no `distributed_by_organization`). Entries removed before the
recipient confirmed are never shown. Staff only.
"""
from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from associations.models import FarmersOrganization, FisherfolkOrganization
from core.utils import build_name_search_q, build_text_search_q
from interventions.distributions import group_id, summary_status
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord
from interventions.types import domain_of, valid_type_names

from .documents import individual_of, make_document, respond, text, with_row_refs
from .period import period_text

KINDS = {
    'farmers': dict(record=BeneficiaryRecord, org=FarmersOrganization, person='farmer', person_label='Farmer', individual=False,
                    title='Farmers Cooperative Assistance', stem='farmers_organization_assistance', people='Members'),
    'fisherfolk': dict(record=FisherfolkBeneficiaryRecord, org=FisherfolkOrganization, person='fisherfolk', person_label='Fisherfolk',
                       individual=False, title='Fisherfolk Cooperative Assistance', stem='fisherfolk_organization_assistance', people='Members'),
    'individual_farmers': dict(record=BeneficiaryRecord, org=None, person='farmer', person_label='Farmer', individual=True,
                               title='Individual Farmers Assistance', stem='individual_farmers_assistance',
                               scope='Assistance given directly to farmers, not through a cooperative'),
    'individual_fisherfolk': dict(record=FisherfolkBeneficiaryRecord, org=None, person='fisherfolk', person_label='Fisherfolk', individual=True,
                                  title='Individual Fisherfolk Assistance', stem='individual_fisherfolk_assistance',
                                  scope='Assistance given directly to fisherfolk, not through a cooperative'),
}
STATUS_FILTERS = {'confirmed': 'Confirmed', 'awaiting': 'Awaiting confirmation', 'follow_up': 'Needs follow-up'}
HEADERS = ['Cooperative', 'Date Given', 'Assistance', 'Source Agency', 'Quantity', 'Members', 'Confirmed', 'Status']
PERSON_HEADERS = ['Recipient', 'Recipient Type', 'Barangay', 'Assistance', 'Source Agency', 'Date Given', 'Quantity', 'Status', 'Date Confirmed']
RECIPIENT_HEADERS = ['Cooperative'] + PERSON_HEADERS


def _parse_date(request, name):
    raw = request.query_params.get(name, '').strip()
    if not raw:
        return None
    try:
        return datetime.strptime(raw, '%Y-%m-%d').date()
    except ValueError:
        raise ValidationError({name: ['Use the date format YYYY-MM-DD.']})


def assistance_label(record):
    """"Seeds — Hybrid rice" / "Training — 2 days": the type plus the one detail the record carries for it."""
    detail = ''
    if record.assistance_type == 'Seeds':
        detail = getattr(record, 'seed_type', '')
    elif record.assistance_type == 'Fertilizer':
        detail = getattr(record, 'fertilizer_type', '')
    elif record.assistance_type == 'Equipment':
        detail = getattr(record, 'equipment_type', '')
    elif record.assistance_type in ('Feed', 'Fishing Gear', 'Fingerlings/Seeds'):
        detail = getattr(record, 'item_type', '')
    elif record.assistance_type == 'Training':
        days = getattr(record, 'training_duration_days', None)
        length = f'{days} day{"s" if days != 1 else ""}' if days else ''
        kind = getattr(record, 'training_type', '')
        detail = f'{kind} ({length})' if kind and length else (kind or length)
    return f'{record.assistance_type or "Assistance"} — {detail}' if detail else (record.assistance_type or 'Assistance')


def _records(kind, request, org_id):
    cfg = KINDS[kind]
    qs = cfg['record'].objects.select_related(cfg['person'], 'distributed_by_organization').order_by('-date_given', '-id')
    if cfg['individual']:
        qs = qs.filter(distributed_by_organization__isnull=True)    # given straight to the person, never through an organization
    else:
        qs = qs.filter(distributed_by_organization__isnull=False)
        if org_id:
            qs = qs.filter(distributed_by_organization_id=org_id)
    frm, to = _parse_date(request, 'date_from'), _parse_date(request, 'date_to')
    if frm and to and frm > to:
        raise ValidationError({'date_to': ['"To" cannot be before "From".']})
    if frm:
        qs = qs.filter(date_given__gte=frm)
    if to:
        qs = qs.filter(date_given__lte=to)
    kind_type = request.query_params.get('assistance_type', '').strip()
    if kind_type:
        # a built-in type, one added in Assistance Settings, or one that was added and later deleted but is still on some record
        if kind_type not in valid_type_names(domain_of(cfg['record'])) and not cfg['record'].objects.filter(assistance_type=kind_type).exists():
            raise ValidationError({'assistance_type': ['Not an assistance type.']})
        qs = qs.filter(assistance_type=kind_type)
    search = request.query_params.get('search', '').strip()
    if search and cfg['individual']:
        person = cfg['person']
        qs = qs.filter(build_name_search_q(search, [f'{person}__first_name', f'{person}__middle_name', f'{person}__last_name']))
    elif search and not org_id:
        qs = qs.filter(build_text_search_q(search, ['distributed_by_organization__name']))
    records = list(qs)
    agency = request.query_params.get('source_agency', '').strip()
    if agency:
        records = [r for r in records if agency in (r.source_agencies or [])]
    return records, frm, to


def _distributions(records):
    """Group `records` into distributions: {id, organization, date_given, label, agencies, quantity, members: [records]}."""
    groups = {}
    for record in records:
        gid = group_id(record)
        group = groups.setdefault(gid, dict(
            id=gid, organization=record.distributed_by_organization, date_given=record.date_given,
            label=assistance_label(record), agencies=list(record.source_agencies or []), quantity=record.quantity, members=[]))
        group['members'].append(record)
    result = []
    for group in groups.values():
        counts = {status: 0 for status in DistributionStatus.values}
        for record in group['members']:
            counts[record.status] = counts.get(record.status, 0) + 1
        group['counts'] = counts
        group['confirmed'] = counts[DistributionStatus.CONFIRMED]
        group['status'] = summary_status({DistributionStatus(k): v for k, v in counts.items()})
        result.append(group)
    result.sort(key=lambda g: (g['date_given'], g['organization'].name), reverse=True)
    return result


def _status_key(label):
    return next(key for key, value in STATUS_FILTERS.items() if value == label)


def _recipient_row(cfg, record, with_organization):
    """One person who received assistance: who, what kind of person, where they live, what they got, from whom, when, how much, and whether
    it was confirmed. Organization reports put the distributing organization first."""
    person = getattr(record, cfg['person'])
    row = [person.full_name, cfg['person_label'], person.barangay or '—', assistance_label(record), ', '.join(record.source_agencies or []) or '—',
           text(record.date_given), record.quantity or '—', record.get_status_display(),
           text(timezone.localtime(record.confirmed_at).date()) if record.confirmed_at else '—']
    return [record.distributed_by_organization.name] + row if with_organization else row


def _record_status(record):
    """The overall-status label (Confirmed / Awaiting confirmation / Needs follow-up) of one record on its own."""
    return summary_status({status: int(status == record.status) for status in DistributionStatus})


def _status_filter(request):
    value = request.query_params.get('status', '').strip()
    if value and value not in STATUS_FILTERS:
        raise ValidationError({'status': [f'Use one of: {", ".join(STATUS_FILTERS)}.']})
    return value


def _filter_text(request, frm, to, status_filter, search_label=None):
    """The filters in words: ('Given from … to …' or '', every part joined with ' · ' in a list)."""
    parts = []
    date_part = ''
    if frm or to:
        span = ' '.join(x for x in (f'from {text(frm)}' if frm else '', f'to {text(to)}' if to else '') if x)
        date_part = f'Given {span}'
        parts.append(date_part)
    for param, label in (('assistance_type', 'Assistance'), ('source_agency', 'Agency')):
        if request.query_params.get(param, '').strip():
            parts.append(f'{label}: {request.query_params[param].strip()}')
    if status_filter:
        parts.append(f'Status: {STATUS_FILTERS[status_filter]}')
    if search_label and request.query_params.get('search', '').strip():
        parts.append(f'{search_label}: "{request.query_params["search"].strip()}"')
    return date_part, parts


def build_individual_document(kind, request):
    """The assistance given straight to individual farmers or fisherfolk: one row per entry, newest first."""
    cfg = KINDS[kind]
    status_filter = _status_filter(request)
    records, frm, to = _records(kind, request, None)
    if status_filter:
        records = [r for r in records if _status_key(_record_status(r)) == status_filter]
    records.sort(key=lambda r: (getattr(r, cfg['person']).full_name.lower(), r.id))
    records.sort(key=lambda r: r.date_given, reverse=True)

    person_key = cfg['person'] + '_id'
    stats = [['Recipients', len({getattr(r, person_key) for r in records})], ['Assistance Records', len(records)],
             ['Confirmed', sum(1 for r in records if r.status == DistributionStatus.CONFIRMED)],
             ['Needs Follow-up', sum(1 for r in records if r.status == DistributionStatus.NOT_RECEIVED)]]
    date_part, parts = _filter_text(request, frm, to, status_filter, 'Recipient')
    rows = [_recipient_row(cfg, r, False) for r in records]
    sections = [{'title': 'Recipients', 'headers': PERSON_HEADERS, 'rows': rows, 'empty': 'No assistance given directly matches these filters.'}]
    other = ' · '.join(p for p in parts if p != date_part)
    doc = make_document(cfg['title'], ' · '.join(parts) or cfg['scope'], stats, sections, heading='Individual Assistance Report',
                        period=period_text(frm, to), detail=' · '.join(p for p in (cfg['title'], other) if p))
    return doc, cfg['stem']


def build_document(kind, request):
    cfg = KINDS[kind]
    if cfg['individual']:
        return build_individual_document(kind, request)
    raw_id = request.query_params.get('id', '').strip()
    org = None
    if raw_id:
        if not raw_id.isdigit():
            raise ValidationError({'id': ['Send the cooperative id.']})
        org = get_object_or_404(cfg['org'], pk=int(raw_id))
    status_filter = _status_filter(request)

    def load(org_id):
        records, frm, to = _records(kind, request, org_id)
        found = _distributions(records)
        if status_filter:
            found = [d for d in found if _status_key(d['status']) == status_filter]
        return found, frm, to

    distributions, frm, to = load(org.id if org else None)
    refs = [{'id': d['organization'].id, 'label': d['organization'].name} for d in distributions]
    # individual=auto: a search that leaves exactly one organization is that organization's own report (never without a search).
    individual = None
    if not org and request.query_params.get('search', '').strip():
        individual = individual_of(request, refs)
        if individual:
            org = get_object_or_404(cfg['org'], pk=individual['id'])
            distributions, frm, to = load(org.id)

    rows = [[d['organization'].name, text(d['date_given']), d['label'], ', '.join(d['agencies']) or '—', d['quantity'] or '—',
             len(d['members']), d['confirmed'], d['status']] for d in distributions]
    person_key = cfg['person'] + '_id'
    reached = len({getattr(r, person_key) for d in distributions for r in d['members']})   # people, not entries: someone helped twice counts once
    stats = [['Distributions', len(distributions)], [f'{cfg["people"]} Reached', reached],
             ['Confirmed', sum(d['confirmed'] for d in distributions)],
             ['Needs Follow-up', sum(1 for d in distributions if d['status'] == STATUS_FILTERS['follow_up'])]]
    if not org:
        stats.insert(0, ['Cooperatives', len({d['organization'].id for d in distributions})])

    date_part, parts = _filter_text(request, frm, to, status_filter, None if org else 'Cooperative')
    filters = ' · '.join(parts)

    # Under the distributions, the people who received them: every recipient by name, in the order of the distributions above.
    recipients = [_recipient_row(cfg, record, True) for d in distributions
                  for record in sorted(d['members'], key=lambda r: (getattr(r, cfg['person']).full_name.lower(), r.id))]
    sections = [{'title': 'Distributions', 'headers': HEADERS, 'rows': rows,
                 'empty': 'No cooperative assistance matches these filters.'},
                {'title': 'Recipients', 'headers': RECIPIENT_HEADERS, 'rows': recipients, 'empty': 'No recipients.'}]
    if org:
        title, subtitle = f'{cfg["title"]} Report', ' · '.join(p for p in (org.name, filters) if p)
    else:
        title, subtitle = cfg['title'], filters or 'All cooperatives'
    # The PDF's line under the period: the kind of assistance report and the filters other than the dates (the period says those).
    other = ' · '.join(p for p in parts if p != date_part)
    detail = ' · '.join(p for p in ((f'{cfg["title"]}', org.name if org else '', other or ('' if org else 'All cooperatives'))) if p)
    doc = make_document(title, subtitle, stats, sections, heading='Cooperative Assistance Report', period=period_text(frm, to), detail=detail)
    if individual:
        doc['individual'] = individual
    elif not org:
        with_row_refs(doc, refs)
    return doc, (f'{cfg["stem"]}_{org.id}' if org else cfg['stem'])


class OrganizationAssistanceReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        kind = request.query_params.get('kind', '')
        if kind not in KINDS:
            raise ValidationError({'kind': [f'Use one of: {", ".join(KINDS)}.']})
        doc, stem = build_document(kind, request)
        return respond(doc, request, stem)
