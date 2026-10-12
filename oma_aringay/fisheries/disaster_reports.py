"""
Fisheries Disaster Logs: the ONE place that turns a saved FisheriesDisasterReport into its document data,
plus the PDF built from that same data.

`report_document()` feeds the Disaster Details view, the browser Print Disaster Log layout (built from the
same JSON) and `build_report_pdf()` - so the screen, the printout and the PDF always show the same saved
values. Viewing, printing and downloading are read-only.

A fisherfolk's own log is submitted to Admin the moment it is saved (see `submit_on_log`), in the same
transaction as the record and its photos.
"""
import logging
from datetime import timedelta

from django.utils import timezone
from reportlab.lib.pagesizes import A4

from accounts.permissions import STAFF_ROLES
from core.notifications import notify_staff
from core.photos import local_photo_paths
from reports.disaster_log_pdf import build_disaster_log_pdf, fmt_datetime, fmt_number, safe_pdf_filename
from reports.pdf_utils import fmt_date

from .models import Fisherfolk, FisheriesDisasterReport, StockingRecord

logger = logging.getLogger(__name__)

SUBMITTED = FisheriesDisasterReport.SubmissionStatus.SUBMITTED
DRAFT = FisheriesDisasterReport.SubmissionStatus.DRAFT
READ_ONLY_MESSAGE = 'This disaster log has been submitted to Admin and can no longer be edited.'
# A repeat of the same log by the same user within this window is a retry/double click, not a new disaster.
DUPLICATE_WINDOW = timedelta(minutes=2)


def report_queryset():
    """Everything a log document reads, in a fixed number of queries."""
    return FisheriesDisasterReport.objects.select_related(
        'fisherfolk__fisherfolk_organization',
        'stocking_record__fisherfolk__fisherfolk_organization',
        'stocking_record__species__category',
        'stocking_record__pond',
        'stocking_record__production_cycle__organization',
        'reported_by', 'submitted_by',
    ).prefetch_related(
        'photos', 'stocking_record__production_cycle__units',
        'stock_losses__stocking_record__species__category', 'stock_losses__stocking_record__pond',
        'stock_losses__stocking_record__production_cycle__organization',
        'stock_losses__stocking_record__production_cycle__units', 'stock_losses__production_unit',
    )


def _user_name(user):
    if not user:
        return None
    return getattr(user, 'full_name', '') or str(user)


def disaster_type_label(report):
    if report.disaster_type == 'Other' and report.disaster_type_other_specify:
        return f'Other — {report.disaster_type_other_specify}'
    return report.get_disaster_type_display()


def equipment_list(report):
    """equipment_damaged is stored as the form's comma-separated selections."""
    return [item.strip() for item in (report.equipment_damaged or '').split(',') if item.strip()]


def stock_label(stock):
    if not stock:
        return None
    parts = [stock.species.species_name if stock.species_id else 'Stock']
    if stock.production_cycle_id:
        parts.append(stock.production_cycle.cycle_name)
    return ' · '.join(parts)


def submission_label(report):
    if report.submission_status == SUBMITTED:
        return 'Submitted to Admin'
    if report.submission_status == DRAFT:
        return 'Not yet submitted'
    reporter = report.reported_by
    if reporter is not None and reporter.role in STAFF_ROLES:
        return 'Logged by office staff'
    return 'Logged'


# ─── Logging (create) ──────────────────────────────────────────────────────────

def submit_on_log(report, user):
    """A fisherfolk's Log Disaster IS the submission: mark it submitted (who/when) and notify every
    Admin/Evaluator. Called inside the create transaction, so a failed save sends nothing."""
    report.submission_status = SUBMITTED
    report.submitted_at = timezone.now()
    report.submitted_by = user
    report.save(update_fields=['submission_status', 'submitted_at', 'submitted_by'])
    ff = report.owner_fisherfolk
    stock = report.stocking_record if report.stocking_record_id else None
    volume = f'{fmt_number(report.volume_lost_kg)} kg lost' if report.volume_lost_kg is not None else None
    detail = ' · '.join(p for p in [disaster_type_label(report),
                                    affected_stocks_label(report) if stock else 'aquaculture equipment',
                                    report.date_of_occurrence.strftime('%b %d, %Y'), volume] if p)
    notify_staff(
        actor=user,
        verb='reported a new disaster:',
        record_type='fisheries_disaster_report',
        record_id=report.pk,
        record_label=f'{report.report_number} · {ff.full_name if ff else ""}'[:255],
        detail=detail[:255],
    )


def _loss_signature(rows):
    return sorted((r[0], r[1], r[2], r[3]) for r in rows)


def find_recent_duplicate(user, owner_fisherfolk_id, stocking_record_id, data, stock_loss_rows=None):
    """The same log by the same user moments ago (double click, browser/network retry). The caller holds a
    row lock on the owning Fisherfolk, so two simultaneous identical requests cannot both get past this.
    stock_loss_rows (multi-stock logs): the planned rows - a log is only "the same" when its saved
    stock/pond losses are identical too, so two different logs never merge just because their (optional)
    description is blank."""
    qs = FisheriesDisasterReport.objects.filter(
        reported_by=user,
        date_reported__gte=timezone.now() - DUPLICATE_WINDOW,
        stocking_record_id=stocking_record_id,
        disaster_type=data.get('disaster_type'),
        disaster_type_other_specify=data.get('disaster_type_other_specify') or '',
        date_of_occurrence=data.get('date_of_occurrence'),
        volume_lost_kg=data.get('volume_lost_kg'),
        equipment_damaged=data.get('equipment_damaged') or '',
        estimated_damage=data.get('estimated_damage') or '',
    )
    if stocking_record_id is None:
        qs = qs.filter(fisherfolk_id=owner_fisherfolk_id)
    if stock_loss_rows is None:
        return qs.order_by('-id').first()
    wanted = _loss_signature((r['stock_id'], r['unit_id'], r['fingerlings_lost'], r['is_total_loss']) for r in stock_loss_rows)
    for candidate in qs.order_by('-id').prefetch_related('stock_losses'):
        saved = _loss_signature((x.stocking_record_id, x.production_unit_id, x.fingerlings_lost, x.is_total_loss)
                                for x in candidate.stock_losses.all())
        if saved == wanted:
            return candidate
    return None


def lock_owner(owner_fisherfolk_id):
    """Serialise concurrent logs for one fisherfolk (the duplicate check above relies on it)."""
    if owner_fisherfolk_id:
        Fisherfolk.objects.select_for_update().filter(pk=owner_fisherfolk_id).first()


# ─── Multi-stock logs: affected stocks + fingerlings lost per pond/cage ─────────

ELIGIBLE_STOCK_STATUSES = (StockingRecord.Status.STOCKED, StockingRecord.Status.NEAR_HARVEST)


def _whole_number(value):
    """A non-negative whole number, or None when blank. Raises ValueError for anything else (negative,
    decimal, text, booleans)."""
    if value is None or value == '':
        return None
    if isinstance(value, bool):
        raise ValueError
    if isinstance(value, int):
        n = value
    elif isinstance(value, str) and value.strip().isdigit():
        n = int(value.strip())
    else:
        raise ValueError
    if n < 0:
        raise ValueError
    return n


def _flag(value):
    if isinstance(value, bool):
        return value
    if value in (None, '', 0, '0', 'false', 'False'):
        return False
    if value in (1, '1', 'true', 'True'):
        return True
    raise ValueError


def plan_stock_losses(owner_fisherfolk_id, raw_rows):
    """Validate the submitted `stock_losses` rows of a multi-stock log BEFORE anything is saved.

    raw_rows: [{stocking_record, production_unit (id or null), fingerlings_lost (whole number >= 0 or
    null = not recorded), is_total_loss (bool)}]. Every stock must belong to `owner_fisherfolk_id` and still
    be active (Stocked / Near Harvest); a stock with ponds/cages needs a unit of ITS OWN cycle on each row,
    one without needs none; a harvested unit cannot lose fingerlings; no stock/unit twice; the count may
    not exceed the unit's (or the stock's) recorded fingerlings. A Total Loss row's count is the stocked
    count (filled in when blank, rejected when different); without a recorded stocked count it must be given.

    Returns {'stocks': [StockingRecord in first-seen order], 'rows': [cleaned rows], 'closes': {stock ids
    that become Total Loss}}. A stock becomes Total Loss only when EVERY not-yet-harvested pond/cage of it is
    marked Total Loss here (or its single whole-stock row is) - Total Loss is tracked per stock, so one
    destroyed pond never closes the others. Raises ValidationError({'stock_losses': [...]})."""
    from rest_framework.exceptions import ValidationError

    from monitoring.models import AquacultureProductionUnit
    from .models import stocking_harvest_status_bulk

    def fail(*messages):
        raise ValidationError({'stock_losses': list(messages)})

    if not isinstance(raw_rows, list) or not raw_rows:
        fail('Select at least one affected stock.')
    cleaned, errors = [], []
    for i, raw in enumerate(raw_rows, start=1):
        if not isinstance(raw, dict):
            fail(f'Row {i} is not valid.')
        try:
            stock_id = int(raw.get('stocking_record'))
            unit_raw = raw.get('production_unit')
            unit_id = None if unit_raw in (None, '') else int(unit_raw)
        except (TypeError, ValueError):
            fail(f'Row {i}: invalid stock or production unit.')
        try:
            lost = _whole_number(raw.get('fingerlings_lost'))
        except ValueError:
            errors.append(f'Row {i}: fingerlings lost must be a whole number of 0 or more.')
            lost = None
        try:
            total = _flag(raw.get('is_total_loss', False))
        except ValueError:
            errors.append(f'Row {i}: invalid Total Loss value.')
            total = False
        cleaned.append({'row': i, 'stock_id': stock_id, 'unit_id': unit_id, 'fingerlings_lost': lost, 'is_total_loss': total})
    if errors:
        fail(*errors)

    stock_ids = list(dict.fromkeys(r['stock_id'] for r in cleaned))
    stocks = {s.id: s for s in StockingRecord.objects.select_related('species', 'production_cycle').filter(pk__in=stock_ids)}
    for sid in stock_ids:
        s = stocks.get(sid)
        # The same message whether the stock does not exist or is someone else's - ids are never confirmed.
        if s is None or s.fisherfolk_id != owner_fisherfolk_id:
            fail(f'Stock #{sid} is not one of this fisherfolk\'s stocks.')
        if s.status not in ELIGIBLE_STOCK_STATUSES:
            fail(f'{stock_label(s)} is {s.status} - a disaster can only be logged on an active stock.')

    cycle_ids = {s.production_cycle_id for s in stocks.values() if s.production_cycle_id}
    units_by_cycle = {}
    for u in AquacultureProductionUnit.objects.filter(production_cycle_id__in=cycle_ids):
        units_by_cycle.setdefault(u.production_cycle_id, {})[u.id] = u
    status_by_stock = stocking_harvest_status_bulk(list(stocks.values()))   # one bulk read for every stock
    harvested = {u['id'] for unit_rows, _ in status_by_stock.values() for u in unit_rows if u['harvested']}

    seen = set()
    for r in cleaned:
        s = stocks[r['stock_id']]
        units = units_by_cycle.get(s.production_cycle_id, {})
        label = stock_label(s)
        if units:
            unit = units.get(r['unit_id'])
            if unit is None:
                errors.append(f'Row {r["row"]}: choose a pond/cage of {label}.' if r['unit_id'] is None
                              else f'Row {r["row"]}: that pond/cage does not belong to {label}.')
                continue
            if unit.id in harvested:
                errors.append(f'Row {r["row"]}: {unit.get_unit_type_display()} {unit.unit_number} of {label} is already harvested.')
                continue
            limit = unit.fingerling_count
        else:
            if r['unit_id'] is not None:
                errors.append(f'Row {r["row"]}: {label} has no ponds/cages to choose from.')
                continue
            limit = s.number_of_fingerlings
        key = (s.id, r['unit_id'])
        if key in seen:
            errors.append(f'Row {r["row"]}: this stock/pond is listed twice.')
            continue
        seen.add(key)
        if r['is_total_loss']:
            # Total Loss = the whole pond/cage (or stock) was lost: its count IS the stocked count, set here
            # (the form fills it in too; never left for the user to type). With no recorded stocked count
            # there is nothing to derive it from, so a count must be given.
            if limit is not None:
                if r['fingerlings_lost'] is None:
                    r['fingerlings_lost'] = limit
                elif r['fingerlings_lost'] != limit:
                    errors.append(f'Row {r["row"]}: a Total Loss means all {limit:,} stocked fingerlings were lost.')
            elif r['fingerlings_lost'] is None:
                errors.append(f'Row {r["row"]}: enter the fingerlings lost for a Total Loss (no stocked count is recorded).')
        if r['fingerlings_lost'] is not None and limit is not None and r['fingerlings_lost'] > limit:
            errors.append(f'Row {r["row"]}: fingerlings lost ({r["fingerlings_lost"]:,}) cannot exceed the {limit:,} stocked.')
        r['stocked'] = limit
    if errors:
        fail(*errors)

    closes = set()
    for sid in stock_ids:
        s = stocks[sid]
        units = units_by_cycle.get(s.production_cycle_id, {})
        marked = {r['unit_id'] for r in cleaned if r['stock_id'] == sid and r['is_total_loss']}
        remaining = set(units) - harvested if units else {None}
        if remaining and remaining <= marked:
            closes.add(sid)
    return {'stocks': [stocks[sid] for sid in stock_ids], 'rows': cleaned, 'closes': closes}


def save_stock_losses(report, plan):
    """Inside the create transaction: the loss rows, then Total Loss on exactly the stocks `plan` closes."""
    from .models import FisheriesDisasterStockLoss
    FisheriesDisasterStockLoss.objects.bulk_create([
        FisheriesDisasterStockLoss(
            disaster_report=report, stocking_record_id=r['stock_id'], production_unit_id=r['unit_id'],
            fingerlings_lost=r['fingerlings_lost'], is_total_loss=r['is_total_loss'],
        )
        for r in plan['rows']
    ])
    for s in StockingRecord.objects.filter(pk__in=plan['closes']).exclude(status=StockingRecord.Status.TOTAL_LOSS):
        s.status = StockingRecord.Status.TOTAL_LOSS
        s.save(update_fields=['status'])


def affected_stocks_label(report):
    """"Tilapia · Grow-out" or, for a multi-stock log, "Tilapia · Grow-out +2 more stocks"."""
    stock = report.stocking_record if report.stocking_record_id else None
    if not stock:
        return None
    others = len({row.stocking_record_id for row in report.stock_losses.all()} - {stock.id})
    return stock_label(stock) + (f' +{others} more stock{"s" if others != 1 else ""}' if others else '')


# ─── Document ──────────────────────────────────────────────────────────────────

def _affected_stock(stock):
    """Only values that exist on the stocking record (and its cycle) - nothing derived or guessed."""
    if not stock:
        return None
    cycle = stock.production_cycle if stock.production_cycle_id else None
    units = [f'{u.get_unit_type_display()} {u.unit_number}' for u in cycle.units.all()] if cycle else []
    phase = stock.culture_phase
    if phase == 'Other' and stock.culture_phase_other_specify:
        phase = f'Other — {stock.culture_phase_other_specify}'
    return {
        'id': stock.id,
        'label': stock_label(stock),
        'species': stock.species.species_name if stock.species_id else None,
        'category': stock.species.category.name if stock.species_id and stock.species.category_id else None,
        'date_stocked': stock.date_stocked,
        'date_stocked_is_estimated': stock.date_stocked_is_estimated,
        'stock_status': stock.status,
        'culture_type': stock.get_culture_type_display() if stock.culture_type else None,
        'culture_phase': phase or None,
        'number_of_fingerlings': stock.number_of_fingerlings,
        'area_hectares': stock.area_hectares,
        'production_cycle': cycle.cycle_name if cycle else None,
        'culture_system': cycle.get_culture_system_display() if cycle else None,
        'production_units': units,
        'pond_name': stock.pond.name if stock.pond_id else None,
        'location': stock.pond_location_barangay or None,
        'organization': cycle.organization.name if cycle and cycle.organization_id else None,
        'expected_harvest_date': stock.expected_harvest_date,
    }


def fingerling_losses(report):
    """The saved per-stock / per-pond fingerling losses of a multi-stock log, grouped by stock in the order
    they were entered, with totals summed here from the saved rows (a row with no count adds nothing).
    [] for older logs and unlinked logs - they have no such rows."""
    groups = {}
    for row in report.stock_losses.all():
        s, u = row.stocking_record, row.production_unit
        g = groups.setdefault(s.id, {'stock': _affected_stock(s), 'rows': [], 'total_lost': 0, 'any_recorded': False})
        stocked = u.fingerling_count if u else s.number_of_fingerlings
        g['rows'].append({
            'production_unit': u.id if u else None,
            'unit_label': f'{u.get_unit_type_display()} {u.unit_number}' if u else 'Whole stock',
            'fingerlings_stocked': stocked,
            'fingerlings_lost': row.fingerlings_lost,
            'is_total_loss': row.is_total_loss,
        })
        if row.fingerlings_lost is not None:
            g['total_lost'] += row.fingerlings_lost
            g['any_recorded'] = True
    out = []
    for g in groups.values():
        g['rows'].sort(key=lambda r: (r['production_unit'] is None, r['unit_label']))
        out.append({**g['stock'], 'rows': g['rows'], 'total_lost': g['total_lost'] if g['any_recorded'] else None})
    return out


def report_document(report, request=None):
    """The complete log data shown on screen, printed, and written into the PDF."""
    ff = report.owner_fisherfolk
    stock = report.stocking_record if report.stocking_record_id else None
    losses = fingerling_losses(report)
    photos = [
        {'id': p.id, 'url': request.build_absolute_uri(p.image.url) if request else p.image.url}
        for p in report.photos.all()
    ]
    legacy_photo = None
    if report.photo:
        legacy_photo = request.build_absolute_uri(report.photo.url) if request else report.photo.url
    return {
        'id': report.id,
        'report_number': report.report_number,
        'kind': 'stock' if stock else 'general',
        'fisherfolk': {
            'id': ff.id if ff else None,
            'name': ff.full_name if ff else None,
            'barangay': ff.barangay if ff else None,
            'municipality': ff.municipality if ff else None,
            'organization': ff.fisherfolk_organization.name if ff and ff.fisherfolk_organization_id else None,
        },
        'affected_stock': _affected_stock(stock),
        # Multi-stock logs: every affected stock with its ponds/cages and fingerlings lost ([] otherwise).
        'fingerling_losses': losses,
        'fingerlings_lost_total': sum(g['total_lost'] for g in losses if g['total_lost'] is not None)
                                  if any(g['total_lost'] is not None for g in losses) else None,
        'date_of_occurrence': report.date_of_occurrence,
        'disaster_type': report.disaster_type,
        'disaster_type_other_specify': report.disaster_type_other_specify or '',
        'disaster_type_label': disaster_type_label(report),
        'area_affected_ha': report.area_affected_ha,
        'volume_lost_kg': report.volume_lost_kg,
        'is_total_loss': report.is_total_loss,
        'equipment_damaged': equipment_list(report),
        'description': report.estimated_damage or '',
        'production_loss': report.production_loss or '',
        'photos': photos,
        'legacy_photo': legacy_photo,
        'status': report.status,
        'recovered_date': report.recovered_date,
        'recovery_note': report.recovery_note or '',
        'reported_by_name': _user_name(report.reported_by),
        'date_reported': report.date_reported,
        'submission_status': report.submission_status,
        'submission_label': submission_label(report),
        'submitted_at': report.submitted_at,
        'submitted_by_name': _user_name(report.submitted_by),
        'pdf_filename': pdf_filename(report),
    }


def report_list_row(report):
    """One row of a disaster-log list (the full document is fetched when a log is opened)."""
    ff = report.owner_fisherfolk
    stock = report.stocking_record if report.stocking_record_id else None
    return {
        'id': report.id,
        'report_number': report.report_number,
        'kind': 'stock' if stock else 'general',
        'fisherfolk_name': ff.full_name if ff else None,
        'fisherfolk_barangay': ff.barangay if ff else None,
        'affected_stock': affected_stocks_label(report),
        'date_of_occurrence': report.date_of_occurrence,
        'disaster_type': report.disaster_type,
        'disaster_type_label': disaster_type_label(report),
        'volume_lost_kg': report.volume_lost_kg,
        'is_total_loss': report.is_total_loss,
        'status': report.status,
        'submission_status': report.submission_status,
        'submission_label': submission_label(report),
        'submitted_at': report.submitted_at,
        'date_reported': report.date_reported,
        'reported_by_name': _user_name(report.reported_by),
        'photo_count': len(report.photos.all()),
        'pdf_filename': pdf_filename(report),
    }


# ─── PDF ───────────────────────────────────────────────────────────────────────

def pdf_filename(report):
    """Fisherfolk_Disaster_Report_<REF NO>_<Fisherfolk_Name>.pdf (ASCII letters, digits, '-' and '_' only)."""
    ff = report.owner_fisherfolk
    return safe_pdf_filename('Fisherfolk_Disaster_Report', report.report_number, ff.full_name if ff else '')


def build_report_pdf(report, doc):
    """PDF bytes for `report`, written from `doc` = report_document(report)."""
    ff, stock, losses = doc['fisherfolk'], doc['affected_stock'], doc['fingerling_losses']
    sections = [{'title': 'FISHERFOLK', 'rows': [
        ('Name', ff['name']), ('Barangay', ff['barangay']), ('Organization', ff['organization']),
    ]}]
    if len(losses) > 1:
        # Several stocks: one compact row per stock (the single-stock layout below stays for one stock).
        sections.append({'title': 'AFFECTED STOCKS', 'table': {
            'head': ['Stock', 'Stocking Date', 'Location', 'Fingerlings Stocked', 'Stock Status'],
            'rows': [[g['label'], fmt_date(g['date_stocked']) + (' (estimated)' if g['date_stocked_is_estimated'] else ''),
                      g['location'] or '—', fmt_number(g['number_of_fingerlings']) or '—', g['stock_status']] for g in losses],
            'widths': [0.32, 0.18, 0.18, 0.16, 0.16],
        }})
    elif stock:
        sections.append({'title': 'AFFECTED STOCK', 'rows': [
            ('Species', stock['species']),
            ('Stocking Date', fmt_date(stock['date_stocked']) + (' (estimated)' if stock['date_stocked_is_estimated'] else '')),
            ('Production Cycle', stock['production_cycle']),
            ('Production Units', ', '.join(stock['production_units'])),
            ('Pond / Cage', stock['pond_name']),
            ('Location', stock['location']),
            ('Organization', stock['organization']),
            ('Culture Type', stock['culture_type']),
            ('Culture Phase', stock['culture_phase']),
            ('Fingerlings Stocked', fmt_number(stock['number_of_fingerlings'])),
            ('Area Stocked', fmt_number(stock['area_hectares'], ' ha')),
            ('Stock Status', stock['stock_status']),
        ]})
    if losses:
        rows, bold = [], set()
        for g in losses:
            for r in g['rows']:
                rows.append([g['label'], r['unit_label'], fmt_number(r['fingerlings_stocked']) or '—',
                             fmt_number(r['fingerlings_lost']) if r['fingerlings_lost'] is not None else 'Not recorded',
                             'Yes' if r['is_total_loss'] else 'No'])
            bold.add(len(rows))
            rows.append([f'Subtotal — {g["label"]}', '', '', fmt_number(g['total_lost']) if g['total_lost'] is not None else '—', ''])
        bold.add(len(rows))
        rows.append(['TOTAL FINGERLINGS LOST', '', '',
                     fmt_number(doc['fingerlings_lost_total']) if doc['fingerlings_lost_total'] is not None else '—', ''])
        sections.append({'title': 'FINGERLINGS LOST PER STOCK AND PRODUCTION UNIT', 'table': {
            'head': ['Stock', 'Production Unit', 'Fingerlings Stocked', 'Fingerlings Lost', 'Total Loss'],
            'rows': rows, 'bold_rows': bold, 'widths': [0.34, 0.18, 0.17, 0.17, 0.14],
        }})
    sections += [
        {'title': 'DISASTER DETAILS', 'rows': [
            ('Date of Occurrence', fmt_date(doc['date_of_occurrence'])),
            ('Disaster Type', doc['disaster_type_label']),
            ('Volume Lost', fmt_number(doc['volume_lost_kg'], ' kg') or 'Not recorded'),
            ('Area Affected', fmt_number(doc['area_affected_ha'], ' ha')),
            ('Total Loss', 'Yes — stock completely destroyed' if doc['is_total_loss'] else None),
            ('Disaster Status', doc['status']),
            ('Recovered On', fmt_date(doc['recovered_date']) if doc['recovered_date'] else None),
        ]},
        {'title': 'EQUIPMENT DAMAGED', 'bullets': doc['equipment_damaged'], 'empty': 'No equipment recorded as damaged.'},
        # Description of Damage is optional on the form: a blank one reads "Not provided." (never an empty box).
        {'title': 'DESCRIPTION OF DAMAGE', 'empty': 'Not provided.', 'paragraphs': [
            doc['description'],
            doc['production_loss'] and f'Estimated production loss: {doc["production_loss"]}',
            doc['status'] == 'Recovered' and doc['recovery_note'] and f'Recovery note: {doc["recovery_note"]}',
        ]},
    ]
    # Every SAVED photo of the log (its own photo rows, same order as on screen, max 10) plus an older log's
    # single photo field, read from storage when the PDF is built - so it works whenever the log is reopened.
    # local_photo_paths copies a photo held in remote storage (Supabase) to a temporary file for the PDF.
    with local_photo_paths([p.image for p in report.photos.all()] + ([report.photo] if report.photo else [])) as paths:
        return _render_pdf(doc, sections, paths)


def _render_pdf(doc, sections, paths):
    return build_disaster_log_pdf(
        pagesize=A4,
        photo_title='PHOTO DOCUMENTATION OF DAMAGE',
        title='FISHERFOLK DISASTER REPORT',
        header_rows=[
            ('Reference No.', doc['report_number']),
            ('Status', doc['submission_label']),
            ('Date/Time Logged', fmt_datetime(doc['date_reported'])),
            ('Logged By', doc['reported_by_name']),
            ('Submitted to Admin', fmt_datetime(doc['submitted_at'])),
            ('Submitted By', doc['submitted_by_name']),
        ],
        sections=sections,
        photo_paths=paths,
        reference=doc['report_number'],
        pdf_title=f'Fisherfolk Disaster Report {doc["report_number"]}',
    )
