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

from accounts.permissions import STAFF_ROLES
from core.notifications import notify_staff
from reports.disaster_log_pdf import build_disaster_log_pdf, fmt_datetime, fmt_number, safe_pdf_filename
from reports.pdf_utils import fmt_date

from .models import Fisherfolk, FisheriesDisasterReport

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
    ).prefetch_related('photos', 'stocking_record__production_cycle__units')


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
                                    stock_label(stock) if stock else 'aquaculture equipment',
                                    report.date_of_occurrence.strftime('%b %d, %Y'), volume] if p)
    notify_staff(
        actor=user,
        verb='reported a new disaster:',
        record_type='fisheries_disaster_report',
        record_id=report.pk,
        record_label=f'{report.report_number} · {ff.full_name if ff else ""}'[:255],
        detail=detail[:255],
    )


def find_recent_duplicate(user, owner_fisherfolk_id, stocking_record_id, data):
    """The same log by the same user moments ago (double click, browser/network retry). The caller holds a
    row lock on the owning Fisherfolk, so two simultaneous identical requests cannot both get past this."""
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
    return qs.order_by('-id').first()


def lock_owner(owner_fisherfolk_id):
    """Serialise concurrent logs for one fisherfolk (the duplicate check above relies on it)."""
    if owner_fisherfolk_id:
        Fisherfolk.objects.select_for_update().filter(pk=owner_fisherfolk_id).first()


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


def report_document(report, request=None):
    """The complete log data shown on screen, printed, and written into the PDF."""
    ff = report.owner_fisherfolk
    stock = report.stocking_record if report.stocking_record_id else None
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
        'affected_stock': stock_label(stock),
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
    ff, stock = doc['fisherfolk'], doc['affected_stock']
    sections = [{'title': 'FISHERFOLK', 'rows': [
        ('Name', ff['name']), ('Barangay', ff['barangay']), ('Organization', ff['organization']),
    ]}]
    if stock:
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
        {'title': 'DESCRIPTION OF DAMAGE', 'empty': 'No description recorded.', 'paragraphs': [
            doc['description'],
            doc['production_loss'] and f'Estimated production loss: {doc["production_loss"]}',
            doc['status'] == 'Recovered' and doc['recovery_note'] and f'Recovery note: {doc["recovery_note"]}',
        ]},
    ]
    # The log's own photo rows (same order as on screen), plus an older log's single photo field.
    paths = [p.image.path for p in report.photos.all()] + ([report.photo.path] if report.photo else [])
    return build_disaster_log_pdf(
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
