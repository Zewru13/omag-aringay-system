"""
Report 6 of the Reports page: Organization Assistance - the assistance an organization distributed to its members, for one
organization or for all of them.

GET /api/reports/organization-assistance/
    kind             farmers | fisherfolk                                  (required: which organizations)
    id               one organization's id: that organization's distributions plus every recipient (leave it out for all)
    date_from/to     assistance given on or after / on or before this date (YYYY-MM-DD)
    assistance_type  one of that kind's assistance types
    source_agency    assistance from this agency
    status           confirmed | awaiting | follow_up   (the distribution's overall status)
    search           organization name (all-organizations report only)
    format           json (the page preview, default) | pdf | excel      (+ prepared_by / reviewed_by / noted_by for the PDF)

One row per distribution (the records one distribution submit created, shown as one unit - interventions.distributions).
Only distributions an organization ran are included (records with `distributed_by_organization`); assistance staff logged for a
single person is not organization assistance. Entries removed before the recipient confirmed are never shown. Staff only.
"""
from datetime import datetime

from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from associations.models import FarmersOrganization, FisherfolkOrganization
from interventions.distributions import group_id, summary_status
from interventions.models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

from .documents import make_document, respond, text

KINDS = {
    'farmers': dict(record=BeneficiaryRecord, org=FarmersOrganization, person='farmer', title='Farmers Organization Assistance',
                    stem='farmers_organization_assistance', people='Members'),
    'fisherfolk': dict(record=FisherfolkBeneficiaryRecord, org=FisherfolkOrganization, person='fisherfolk',
                       title='Fisherfolk Organization Assistance', stem='fisherfolk_organization_assistance', people='Members'),
}
STATUS_FILTERS = {'confirmed': 'Confirmed', 'awaiting': 'Awaiting confirmation', 'follow_up': 'Needs follow-up'}
HEADERS = ['Organization', 'Date Given', 'Assistance', 'Source Agency', 'Quantity', 'Members', 'Confirmed', 'Status']
RECIPIENT_HEADERS = ['Member', 'Assistance', 'Date Given', 'Status', 'Date Confirmed']


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
    elif record.assistance_type == 'Training' and getattr(record, 'training_duration_days', None):
        days = record.training_duration_days
        detail = f'{days} day{"s" if days != 1 else ""}'
    return f'{record.assistance_type or "Assistance"} — {detail}' if detail else (record.assistance_type or 'Assistance')


def _records(kind, request, org_id):
    cfg = KINDS[kind]
    qs = cfg['record'].objects.filter(distributed_by_organization__isnull=False).select_related(
        cfg['person'], 'distributed_by_organization').order_by('-date_given', '-id')
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
        if kind_type not in cfg['record'].AssistanceType.values:
            raise ValidationError({'assistance_type': ['Not an assistance type.']})
        qs = qs.filter(assistance_type=kind_type)
    search = request.query_params.get('search', '').strip()
    if search and not org_id:
        qs = qs.filter(distributed_by_organization__name__icontains=search)
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


def build_document(kind, request):
    cfg = KINDS[kind]
    raw_id = request.query_params.get('id', '').strip()
    org = None
    if raw_id:
        if not raw_id.isdigit():
            raise ValidationError({'id': ['Send the organization id.']})
        org = get_object_or_404(cfg['org'], pk=int(raw_id))
    status_filter = request.query_params.get('status', '').strip()
    if status_filter and status_filter not in STATUS_FILTERS:
        raise ValidationError({'status': [f'Use one of: {", ".join(STATUS_FILTERS)}.']})

    records, frm, to = _records(kind, request, org.id if org else None)
    distributions = _distributions(records)
    if status_filter:
        distributions = [d for d in distributions if _status_key(d['status']) == status_filter]

    rows = [[d['organization'].name, text(d['date_given']), d['label'], ', '.join(d['agencies']) or '—', d['quantity'] or '—',
             len(d['members']), d['confirmed'], d['status']] for d in distributions]
    reached = sum(len(d['members']) for d in distributions)
    stats = [['Distributions', len(distributions)], [f'{cfg["people"]} Reached', reached],
             ['Confirmed', sum(d['confirmed'] for d in distributions)],
             ['Needs Follow-up', sum(1 for d in distributions if d['status'] == STATUS_FILTERS['follow_up'])]]
    if not org:
        stats.insert(0, ['Organizations', len({d['organization'].id for d in distributions})])

    parts = []
    if frm or to:
        span = ' '.join(x for x in (f'from {text(frm)}' if frm else '', f'to {text(to)}' if to else '') if x)
        parts.append(f'Given {span}')
    for param, label in (('assistance_type', 'Assistance'), ('source_agency', 'Agency')):
        if request.query_params.get(param, '').strip():
            parts.append(f'{label}: {request.query_params[param].strip()}')
    if status_filter:
        parts.append(f'Status: {STATUS_FILTERS[status_filter]}')
    if request.query_params.get('search', '').strip() and not org:
        parts.append(f'Organization: "{request.query_params["search"].strip()}"')
    filters = ' · '.join(parts)

    sections = [{'title': 'Distributions', 'headers': HEADERS, 'rows': rows,
                 'empty': 'No organization assistance matches these filters.'}]
    if org:
        recipients = []
        for d in distributions:
            for record in sorted(d['members'], key=lambda r: (getattr(r, cfg['person']).full_name.lower(), r.id)):
                recipients.append([getattr(record, cfg['person']).full_name, d['label'], text(record.date_given),
                                   record.get_status_display(), text(timezone.localtime(record.confirmed_at).date()) if record.confirmed_at else '—'])
        sections.append({'title': 'Recipients', 'headers': RECIPIENT_HEADERS, 'rows': recipients, 'empty': 'No recipients.'})
        title, subtitle = f'{cfg["title"]} Report', ' · '.join(p for p in (org.name, filters) if p)
    else:
        title, subtitle = cfg['title'], filters or 'All organizations'
    return make_document(title, subtitle, stats, sections), (f'{cfg["stem"]}_{org.id}' if org else cfg['stem'])


class OrganizationAssistanceReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        kind = request.query_params.get('kind', '')
        if kind not in KINDS:
            raise ValidationError({'kind': [f'Use one of: {", ".join(KINDS)}.']})
        doc, stem = build_document(kind, request)
        return respond(doc, request, stem)
