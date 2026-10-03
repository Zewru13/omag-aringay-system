"""
Farmer Disaster Logs (Admin > Disaster > Farmer Disaster): the existing CropDisasterReport records - no new
model - turned into one document used by the details view, the browser print layout and the PDF.
Read-only: logs are still created through the existing /production/monitoring/<id>/disasters/ endpoint.
"""
from reports.disaster_log_pdf import build_disaster_log_pdf, fmt_datetime, fmt_number, safe_pdf_filename
from reports.pdf_utils import fmt_date

from .models import CropDisasterReport


def crop_queryset():
    return CropDisasterReport.objects.select_related(
        'monitoring_record__farmer', 'monitoring_record__farm_parcel__farmer',
        'monitoring_record__farmers_organization', 'monitoring_record__crop_type',
        'reported_by', 'recovered_by',
    )


def reference_number(report):
    year = report.date_reported.year if report.date_reported else ''
    return f'CDR-{year}-{report.pk:05d}'


def _user_name(user):
    return (getattr(user, 'full_name', '') or str(user)) if user else None


def _farmer(record):
    if record.farmer_id:
        return record.farmer
    if record.farm_parcel_id and record.farm_parcel.farmer_id:
        return record.farm_parcel.farmer
    return None


def owner_name(record):
    farmer = _farmer(record)
    if farmer:
        return farmer.full_name
    return record.farmers_organization.name if record.farmers_organization_id else None


def type_label(report):
    if report.disaster_type == 'Other' and report.disaster_type_other_specify:
        return f'Other — {report.disaster_type_other_specify}'
    return report.get_disaster_type_display()


def location(record):
    if record.farm_location_barangay:
        return record.farm_location_barangay
    return record.farm_parcel.barangay if record.farm_parcel_id else None


def pdf_filename(report):
    return safe_pdf_filename('Farmer_Disaster_Report', reference_number(report), owner_name(report.monitoring_record) or '')


def list_row(report):
    rec = report.monitoring_record
    return {
        'id': report.id,
        'report_number': reference_number(report),
        'farmer_name': owner_name(rec),
        'crop': rec.crop_type.name if rec.crop_type_id else None,
        'location': location(rec),
        'date_of_occurrence': report.date_of_occurrence,
        'disaster_type': report.disaster_type,
        'disaster_type_label': type_label(report),
        'area_affected_ha': report.area_affected_ha,
        'is_total_loss': report.is_total_loss,
        'status': report.status,
        'date_reported': report.date_reported,
        'reported_by_name': _user_name(report.reported_by),
        'pdf_filename': pdf_filename(report),
    }


def document(report, request=None):
    rec = report.monitoring_record
    farmer = _farmer(rec)
    photo = None
    if report.photo:
        photo = request.build_absolute_uri(report.photo.url) if request else report.photo.url
    return {
        **list_row(report),
        'farmer': {
            'name': owner_name(rec),
            'barangay': farmer.barangay if farmer else None,
            'organization': rec.farmers_organization.name if rec.farmers_organization_id else None,
        },
        'crop_record': {
            'id': rec.id,
            'crop': rec.crop_type.name if rec.crop_type_id else None,
            'variety': rec.variety_used or None,
            'season': f'{rec.season} {rec.year}' if rec.season else None,
            'date_planted': rec.date_planted,
            'date_planted_is_estimated': rec.date_planted_is_estimated,
            'area_planted_ha': rec.area_planted_ha,
            'location': location(rec),
            'growth_stage': rec.current_growth_stage or None,
            'record_status': rec.status,
            'expected_harvest_date': rec.expected_harvest_date,
        },
        'severity': report.severity or None,
        'description': report.estimated_damage or '',
        'production_loss': report.production_loss or '',
        'photo': photo,
        'recovered_date': report.recovered_date,
        'recovery_note': report.recovery_note or '',
    }


def build_pdf(report, doc):
    crop, farmer = doc['crop_record'], doc['farmer']
    return build_disaster_log_pdf(
        title='FARMER DISASTER REPORT',
        header_rows=[
            ('Reference No.', doc['report_number']),
            ('Disaster Status', doc['status']),
            ('Date/Time Logged', fmt_datetime(doc['date_reported'])),
            ('Logged By', doc['reported_by_name']),
        ],
        sections=[
            {'title': 'FARMER', 'rows': [('Name', farmer['name']), ('Barangay', farmer['barangay']), ('Organization', farmer['organization'])]},
            {'title': 'AFFECTED CROP', 'rows': [
                ('Crop', crop['crop']), ('Variety', crop['variety']), ('Season', crop['season']),
                ('Date Planted', fmt_date(crop['date_planted']) + (' (estimated)' if crop['date_planted_is_estimated'] else '')),
                ('Area Planted', fmt_number(crop['area_planted_ha'], ' ha')), ('Location', crop['location']),
                ('Growth Stage', crop['growth_stage']), ('Crop Status', crop['record_status']),
            ]},
            {'title': 'DISASTER DETAILS', 'rows': [
                ('Date of Occurrence', fmt_date(doc['date_of_occurrence'])),
                ('Disaster Type', doc['disaster_type_label']),
                ('Area Affected', fmt_number(doc['area_affected_ha'], ' ha')),
                ('Severity', doc['severity']),
                ('Total Loss', 'Yes — crop completely destroyed' if doc['is_total_loss'] else None),
                ('Recovered On', fmt_date(doc['recovered_date']) if doc['recovered_date'] else None),
            ]},
            {'title': 'DESCRIPTION OF DAMAGE', 'empty': 'No description recorded.', 'paragraphs': [
                doc['description'],
                doc['production_loss'] and f'Estimated production loss: {doc["production_loss"]}',
                doc['status'] == 'Recovered' and doc['recovery_note'] and f'Recovery note: {doc["recovery_note"]}',
            ]},
        ],
        photo_paths=[report.photo.path] if report.photo else [],
        reference=doc['report_number'],
        pdf_title=f'Farmer Disaster Report {doc["report_number"]}',
    )
