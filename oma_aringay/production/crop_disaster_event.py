"""
The report of ONE disaster event logged on several crops at once (Log Disaster, staff): the CropDisasterReport records it created -
no new model - turned into one document used by the screen shown right after saving, the browser print layout and the PDF.
Read-only: nothing here changes a report.
"""
from decimal import Decimal

from core.photos import local_photo_paths
from reports.disaster_log_pdf import build_disaster_log_pdf, fmt_datetime, fmt_number, safe_pdf_filename
from reports.pdf_utils import fmt_date

from .crop_disaster_logs import crop_queryset, location, owner_name, type_label

MAX_REPORTS = 1000


def event_queryset(ids):
    return crop_queryset().filter(pk__in=ids).order_by('id')


def reference_number(first):
    year = first.date_reported.year if first.date_reported else ''
    return f'CDE-{year}-{first.pk:05d}'


def _parcel_label(record):
    parcel = record.farm_parcel
    if not parcel:
        return 'No parcel on file'
    return f'Parcel {parcel.parcel_number}' if parcel.parcel_number else f'Parcel #{parcel.pk}'


def document(reports, request=None):
    """`reports`: the event's CropDisasterReport rows (at least one). The event's own fields (type, date, description, photos) are the
    first report's: Log Disaster saves the same ones on every crop."""
    first = reports[0]
    rows = []
    for r in reports:
        rec = r.monitoring_record
        rows.append({
            'report_id': r.id,
            'farmer_name': owner_name(rec) or '',
            'barangay': location(rec) or '',
            'parcel': _parcel_label(rec),
            'parcel_key': f'p{rec.farm_parcel_id}' if rec.farm_parcel_id else f'f{rec.farmer_id}',
            'crop': rec.crop_type.name if rec.crop_type_id else '',
            'variety': rec.variety_used or '',
            'area_planted_ha': rec.area_planted_ha,
            'area_affected_ha': r.area_affected_ha,
            'is_total_loss': r.is_total_loss,
        })
    rows.sort(key=lambda x: (x['farmer_name'].lower(), x['parcel'], x['crop'].lower(), x['report_id']))
    photos = [request.build_absolute_uri(p.image.url) if request else p.image.url for p in first.photos.all()]
    zero = Decimal(0)
    return {
        'reference': reference_number(first),
        'disaster_type': first.disaster_type,
        'disaster_type_label': type_label(first),
        'date_of_occurrence': first.date_of_occurrence,
        'date_reported': first.date_reported,
        'reported_by_name': (getattr(first.reported_by, 'full_name', '') or str(first.reported_by)) if first.reported_by_id else None,
        'description': first.estimated_damage or '',
        'production_loss': first.production_loss or '',
        'totals': {
            'crops': len(rows),
            'parcels': len({r['parcel_key'] for r in rows}),
            'farmers': len({r.monitoring_record.farmer_id for r in reports}),
            'area_planted_ha': sum((r['area_planted_ha'] or zero for r in rows), zero),
            'area_affected_ha': sum((r['area_affected_ha'] or zero for r in rows), zero),
            'total_loss': sum(1 for r in rows if r['is_total_loss']),
        },
        'rows': rows,
        'photos': photos,
        'pdf_filename': safe_pdf_filename('Crop_Disaster_Report', reference_number(first)),
    }


def build_pdf(reports, doc):
    first = reports[0]
    totals = doc['totals']
    table_rows = [
        [r['farmer_name'], r['barangay'], r['parcel'], r['crop'], fmt_number(r['area_planted_ha']) or '—',
         fmt_number(r['area_affected_ha']) or '—', 'Yes' if r['is_total_loss'] else 'No']
        for r in doc['rows']
    ]
    table_rows.append(['TOTAL', '', f'{totals["parcels"]} parcels', f'{totals["crops"]} crops', fmt_number(totals['area_planted_ha']) or '—',
                       fmt_number(totals['area_affected_ha']) or '—', str(totals['total_loss'])])
    with local_photo_paths([p.image for p in first.photos.all()]) as photo_paths:
        return build_disaster_log_pdf(
            title='CROP DISASTER REPORT',
            header_rows=[
                ('Reference No.', doc['reference']),
                ('Date/Time Logged', fmt_datetime(doc['date_reported'])),
                ('Logged By', doc['reported_by_name']),
            ],
            sections=[
                {'title': 'DISASTER DETAILS', 'rows': [
                    ('Date of Occurrence', fmt_date(doc['date_of_occurrence'])),
                    ('Disaster Type', doc['disaster_type_label']),
                    ('Farmers Affected', str(totals['farmers'])),
                    ('Parcels Affected', str(totals['parcels'])),
                    ('Crops Affected', str(totals['crops'])),
                    ('Total Area Affected', fmt_number(totals['area_affected_ha'], ' ha')),
                    ('Crops Lost (Total Loss)', str(totals['total_loss']) if totals['total_loss'] else None),
                ]},
                {'title': 'DESCRIPTION OF DAMAGE', 'empty': 'No description recorded.', 'paragraphs': [
                    doc['description'],
                    doc['production_loss'] and f'Estimated production loss: {doc["production_loss"]}',
                ]},
                {'title': 'AFFECTED PARCELS AND CROPS', 'table': {
                    'head': ['Farmer', 'Barangay', 'Parcel', 'Crop', 'Planted (ha)', 'Affected (ha)', 'Total Loss'],
                    'rows': table_rows,
                    'bold_rows': {len(table_rows) - 1},
                    'widths': [0.19, 0.13, 0.2, 0.15, 0.1, 0.1, 0.13],
                }},
            ],
            photo_paths=photo_paths,
            reference=doc['reference'],
            pdf_title=f'Crop Disaster Report {doc["reference"]}',
        )
