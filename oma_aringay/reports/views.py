import csv
import io
import os
from decimal import Decimal

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from django.utils import timezone
from reportlab.lib.pagesizes import letter
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator, IsStaffOrFarmer, IsStaffOrFisherfolk, farmer_scope
from core.utils import accumulate_yield_group, day_range_bounds, new_yield_group, possible_factors_text
from farmers.models import Farmer
from fisheries.models import Fisherfolk, FishingTripLog, Pond, StockingRecord, TripSpeciesEntry
from interventions.models import (
    BeneficiaryConfirmationRequest,
    BeneficiaryRecord,
    FisherfolkBeneficiaryConfirmationRequest,
    FisherfolkBeneficiaryRecord,
)
from production.models import (
    BarangayCropSummary,
    CropMonitoringRecord,
    DamageReport,
    HarvestRecord,
    PlantingRecord,
)

from .pdf_utils import (
    BORDER_COLOR,
    DARK_TEXT,
    FONT_BASE,
    FONT_BOLD,
    FONT_ITAL,
    LIGHT_GREEN,
    MUTED_TEXT,
    PRIMARY_GREEN,
    WHITE,
    NumberedCanvas,
    build_keyvalue_grid,
    build_ledger_table,
    build_official_header,
    build_section_heading,
    build_signature_block,
    build_stats_row,
    build_status_badge,
    fmt_currency,
    fmt_date,
    fmt_field,
    full_name,
    get_styles,
)

LOGO_PATH = os.path.join(settings.BASE_DIR, 'static', 'images', 'LOGO_OMAg.jpg')

# Portrait letter, 1-inch (72pt) margins → 468pt usable content width
PAGE_WIDTH  = 468   # 612 - 72 - 72
MARGIN      = 72


# ─── PDF / CSV infrastructure ─────────────────────────────────────────────────

def _today():
    return timezone.localdate()


def _sig_params(request):
    """Extract signature query params from the request."""
    return {
        'prepared_by':   request.query_params.get('prepared_by', '').strip(),
        'position':      request.query_params.get('prepared_role', request.query_params.get('position', '')).strip(),
        'reviewed_by':   request.query_params.get('reviewed_by', '').strip() or None,
        'reviewed_role': request.query_params.get('reviewed_role', '').strip() or None,
        'noted_by':      request.query_params.get('noted_by', '').strip() or None,
        'noted_role':    request.query_params.get('noted_role', '').strip() or None,
    }


def _make_doc(filename_hint=None):
    """Return (buf, doc) for portrait letter with 1-inch margins."""
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN, bottomMargin=MARGIN,
    )
    return buf, doc


def _finish_pdf(buf, filename):
    buf.seek(0)
    response = HttpResponse(buf.read(), content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def build_csv_response(filename, report_title, headers, rows):
    response = HttpResponse(content_type='text/csv')
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    writer = csv.writer(response)
    writer.writerow(['Republic of the Philippines'])
    writer.writerow(['Office of the Municipal Agriculturist — Aringay, La Union'])
    writer.writerow([report_title])
    writer.writerow([f'Date Generated: {_today()}'])
    writer.writerow([])
    writer.writerow(headers)
    writer.writerows(rows)
    return response


def wants_pdf(request):
    return request.query_params.get('format', '').lower() == 'pdf'


def _empty_state(message):
    """LIGHT_GREEN bordered box with centered italic message."""
    S = get_styles()
    tbl = Table(
        [[Paragraph(message, S['EmptyItalic'])]],
        colWidths=[PAGE_WIDTH],
    )
    tbl.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1, BORDER_COLOR),
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_GREEN),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    return tbl


# ─── TASK 1 — Farmer Profile ──────────────────────────────────────────────────

class FarmerProfileReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, farmer_id):
        farmer = get_object_or_404(
            Farmer.objects.prefetch_related(
                'farm_parcels__crops',
                'farm_parcels__machinery',
                'crop_monitoring_records__crop_type',
                'crop_monitoring_records__activity_logs',
                'crop_monitoring_records__harvest_records',
            ),
            pk=farmer_id,
        )
        buf, doc = _make_doc()
        doc.build(self._build_story(farmer, request), canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'farmer_profile_{fmt_field(farmer.rsbsa_number)}_{_today()}.pdf')

    def _build_story(self, farmer, request):  # noqa: C901
        S = get_styles()
        story = []

        # ── Header ────────────────────────────────────────────────────────────
        story += build_official_header(
            LOGO_PATH,
            'Farmer Profile Record',
            f'RSBSA No. {fmt_field(farmer.rsbsa_number)}',
        )

        # ── Section I — Personal Information ──────────────────────────────────
        story += build_section_heading('I', 'PERSONAL INFORMATION')

        pairs = [
            ('Full Name',        full_name(farmer)),
            ('Farmer ID',        f'RSBSA-{farmer.id:06d}'),
            ('RSBSA No.',        fmt_field(farmer.rsbsa_number)),
            ('PhilSys No.',      fmt_field(farmer.philsys_number)),
            ('Barangay',         fmt_field(farmer.barangay)),
            ('Gender',           fmt_field(farmer.gender)),
            ('Birthdate',        fmt_date(farmer.birthdate)),
            ('Civil Status',     fmt_field(farmer.civil_status)),
            ('Highest Education',fmt_field(farmer.highest_education)),
            ('Contact No.',      fmt_field(farmer.contact_number)),
            ('Municipality',     'Aringay'),
            ('Province',         'La Union'),
            ('Date Registered',  fmt_date(farmer.date_registered)),
            ('PWD',              'Yes' if farmer.is_pwd else 'No'),
            ('4Ps Beneficiary',  'Yes' if farmer.is_4ps_beneficiary else 'No'),
            ('Senior Citizen',   'Yes' if farmer.is_senior_citizen else 'No'),
            ('Farm Laborer',     'Yes' if farmer.is_farm_laborer else 'No'),
            ('ICC/IP Member',    f'Yes — {fmt_field(farmer.icc_ip_name)}' if farmer.is_icc_ip_member else 'No'),
            ('Status',           build_status_badge(farmer.is_active)),
            ('', ''),   # pad to even number for 2-column grid
        ]
        story.append(build_keyvalue_grid(pairs, columns=2, page_width=PAGE_WIDTH))
        story.append(Spacer(1, 12))

        # ── Section II — Farm Parcels ─────────────────────────────────────────
        story += build_section_heading('II', 'FARM PARCELS')

        parcels = list(
            farmer.farm_parcels
            .prefetch_related('crops', 'machinery')
            .all()
        )

        if not parcels:
            story.append(_empty_state(
                'No farm parcels have been registered for this farmer.'
            ))
        else:
            parcel_hdr_style = _P(FONT_BOLD, 9, WHITE)
            empty_sub_style  = _P(FONT_ITAL, 8, MUTED_TEXT)

            inner_cmds = [
                ('BACKGROUND', (0, 0), (-1, 0), PRIMARY_GREEN),
                ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
                ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
                ('FONTSIZE', (0, 0), (-1, -1), 8),
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ('TOPPADDING', (0, 0), (-1, -1), 4),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
                ('LEFTPADDING', (0, 0), (-1, -1), 5),
                ('RIGHTPADDING', (0, 0), (-1, -1), 5),
                ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, LIGHT_GREEN]),
            ]

            for idx, parcel in enumerate(parcels):
                if idx > 0:
                    story.append(Spacer(1, 6))
                    story.append(HRFlowable(
                        width='100%', thickness=0.5,
                        color=BORDER_COLOR, spaceAfter=6,
                    ))

                # Parcel header bar
                bar_text = (
                    f'Parcel No. {fmt_field(parcel.parcel_number)}  ·  '
                    f'Area: {fmt_field(parcel.area_hectares)} ha  ·  '
                    f'Ownership: {fmt_field(parcel.land_ownership)}  ·  '
                    f'Status: {fmt_field(parcel.farm_status)}'
                )
                bar = Table([[Paragraph(bar_text, parcel_hdr_style)]], colWidths=[PAGE_WIDTH])
                bar.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), PRIMARY_GREEN),
                    ('TOPPADDING', (0, 0), (-1, -1), 7),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ]))
                story.append(bar)
                story.append(Spacer(1, 6))

                # Sub-tables — 3 panels × 156pt = 468pt
                # A. Crops
                story.append(Paragraph('A. Crops Grown', S['SubLabel']))
                crops = list(parcel.crops.all())
                if crops:
                    crop_rows = []
                    for c in crops:
                        nm = (c.crop_name_other or 'Other') if c.crop_name == 'Other' else c.crop_name
                        crop_rows.append([fmt_field(nm), fmt_field(c.area_hectares)])
                    story.append(build_ledger_table(
                        ['Crop Name', 'Area (ha)'],
                        crop_rows,
                        col_widths=[268, 200],
                    ))
                else:
                    story.append(Paragraph(
                        'No crops have been recorded for this parcel.',
                        S['EmptyItalic'],
                    ))

                # B. Machinery
                story.append(Paragraph('B. Agricultural Machinery', S['SubLabel']))
                machinery = list(parcel.machinery.all())
                if machinery:
                    mach_rows = []
                    for m in machinery:
                        nm = (m.machinery_type_other or 'Other') if m.machinery_type == 'Other' else m.machinery_type
                        mach_rows.append([fmt_field(nm), fmt_field(m.quantity), fmt_field(m.ownership)])
                    story.append(build_ledger_table(
                        ['Type', 'Qty', 'Ownership'],
                        mach_rows,
                        col_widths=[200, 80, 188],
                    ))
                else:
                    story.append(Paragraph(
                        'No machinery have been recorded for this parcel.',
                        S['EmptyItalic'],
                    ))

        story.append(Spacer(1, 12))

        # ── Section III — Crop Monitoring, Activity & Harvest History ─────────
        # Per crop cycle (CropMonitoringRecord), same header-bar-then-sub-tables
        # shape as Section II's per-parcel blocks. Harvests are reached via
        # each record's own harvest_records (the live, current linkage — the
        # older HarvestRecord.farm_parcel path is dead in practice, unpopulated
        # on every real row), so this only ever shows harvests that actually
        # belong to a real monitoring cycle for this farmer.
        story += build_section_heading('III', 'CROP MONITORING, ACTIVITY & HARVEST HISTORY')

        monitoring_records = sorted(
            farmer.crop_monitoring_records.all(),
            key=lambda r: r.date_planted, reverse=True,
        )

        if not monitoring_records:
            story.append(_empty_state(
                'No crop monitoring records have been recorded for this farmer.'
            ))
        else:
            cycle_hdr_style = _P(FONT_BOLD, 9, WHITE)

            for idx, rec in enumerate(monitoring_records):
                if idx > 0:
                    story.append(Spacer(1, 6))
                    story.append(HRFlowable(
                        width='100%', thickness=0.5,
                        color=BORDER_COLOR, spaceAfter=6,
                    ))

                # Cycle header bar
                bar_text = (
                    f'{fmt_field(rec.crop_type.name if rec.crop_type else None)}  ·  '
                    f'{fmt_field(rec.season)} {fmt_field(rec.year)}  ·  '
                    f'Planted: {fmt_date(rec.date_planted)}  ·  '
                    f'Status: {fmt_field(rec.status)}'
                )
                bar = Table([[Paragraph(bar_text, cycle_hdr_style)]], colWidths=[PAGE_WIDTH])
                bar.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), PRIMARY_GREEN),
                    ('TOPPADDING', (0, 0), (-1, -1), 7),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ]))
                story.append(bar)
                story.append(Spacer(1, 6))

                # A. Activity Log
                story.append(Paragraph('A. Activity Log', S['SubLabel']))
                logs = sorted(rec.activity_logs.all(), key=lambda l: l.date_of_activity)
                if logs:
                    log_rows = [
                        [fmt_date(l.date_of_activity), fmt_field(l.activity_type), fmt_field(l.notes)]
                        for l in logs
                    ]
                    story.append(build_ledger_table(
                        ['Date', 'Activity Type', 'Notes'],
                        log_rows,
                        col_widths=[70, 140, 258],
                    ))
                else:
                    story.append(Paragraph(
                        'No activity logs have been recorded for this monitoring record.',
                        S['EmptyItalic'],
                    ))

                # B. Harvest Records
                story.append(Paragraph('B. Harvest Records', S['SubLabel']))
                harvests = sorted(
                    rec.harvest_records.all(),
                    key=lambda h: h.harvest_start_date or h.date_recorded.date(),
                )
                if harvests:
                    harvest_rows = []
                    for h in harvests:
                        period = fmt_date(h.harvest_start_date)
                        if h.harvest_end_date and h.harvest_end_date != h.harvest_start_date:
                            period += f' to {fmt_date(h.harvest_end_date)}'
                        volume = f'{fmt_field(h.volume_kg)} {h.unit_of_measure or "kg"}'
                        harvest_rows.append([period, volume, fmt_field(h.yield_per_hectare_kg)])
                    story.append(build_ledger_table(
                        ['Harvest Period', 'Volume', 'Yield/ha (kg)'],
                        harvest_rows,
                        col_widths=[160, 150, 158],
                    ))
                else:
                    story.append(Paragraph(
                        'No harvest records have been recorded for this monitoring record.',
                        S['EmptyItalic'],
                    ))

        story.append(Spacer(1, 12))

        # ── Section IV — Assistance History ────────────────────────────────────
        story += build_section_heading('IV', 'ASSISTANCE HISTORY')

        asst_records = (
            BeneficiaryRecord.objects
            .filter(farmer=farmer)
            .order_by('-date_given', '-id')
        )

        if not asst_records.exists():
            story.append(Paragraph(
                'No assistance records found for this farmer.',
                S['EmptyItalic'],
            ))
        else:
            # col_widths sum: 100+120+70+45+38+95 = 468pt
            asst_rows = []
            for r in asst_records:
                asst_rows.append([
                    fmt_field(r.assistance_type),
                    # source_agencies is a list now (was a single string) —
                    # join for display; fmt_field's own str(value) would
                    # otherwise render the raw Python list repr.
                    fmt_field(', '.join(r.source_agencies)),
                    fmt_field(r.quantity),
                    fmt_field(r.season),
                    fmt_field(r.year),
                    fmt_date(r.date_given),
                ])
            story.append(build_ledger_table(
                ['Assistance Type', 'Source Agency', 'Quantity', 'Season', 'Year', 'Date Given'],
                asst_rows,
                col_widths=[100, 120, 70, 45, 38, 95],
            ))

        story.append(Spacer(1, 30))

        # ── Section V — Verification ────────────────────────────────────────────
        story += build_section_heading('V', 'VERIFICATION')
        story.append(Spacer(1, 10))

        printed_by = (
            (getattr(request.user, 'full_name', '') or '').strip()
            or getattr(request.user, 'email', 'Unknown')
        )
        story.append(build_signature_block(
            left_label='Prepared by',
            left_role=(getattr(request.user, 'role', '') or '').title() or 'System Administrator',
            printed_by_name=printed_by,
            page_width=PAGE_WIDTH,
        ))
        story.append(Spacer(1, 14))
        story.append(Paragraph(
            'This is an official record generated by the OMAg Aringay Integrated '
            'Agricultural Monitoring and Production Management System.',
            S['Disclaimer'],
        ))

        return story


# ─── TASK 1B — Fisherfolk Profile ─────────────────────────────────────────────
# Fisherfolk counterpart of FarmerProfileReport above — same section shape
# (Personal Info / site inventory / cycle-by-cycle activity+harvest history /
# assistance / verification), same pdf_utils building blocks, adapted to this
# domain's own models (Pond instead of FarmParcel, StockingRecord instead of
# CropMonitoringRecord, FisherfolkBeneficiaryRecord instead of
# BeneficiaryRecord — the two are separate models, not shared).

class FisherfolkProfileReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, fisherfolk_id):
        fisherfolk = get_object_or_404(
            Fisherfolk.objects.prefetch_related(
                'ponds',
                'stocking_records__species',
                'stocking_records__pond',
                'stocking_records__logs',
                'stocking_records__harvests',
            ),
            pk=fisherfolk_id,
        )
        buf, doc = _make_doc()
        doc.build(self._build_story(fisherfolk, request), canvasmaker=NumberedCanvas)
        return _finish_pdf(
            buf,
            f'fisherfolk_profile_{fmt_field(fisherfolk.lgu_registration_number)}_{_today()}.pdf',
        )

    def _build_story(self, fisherfolk, request):  # noqa: C901
        S = get_styles()
        story = []

        # ── Header ────────────────────────────────────────────────────────────
        story += build_official_header(
            LOGO_PATH,
            'Fisherfolk Profile Record',
            f'LGU Registration No. {fmt_field(fisherfolk.lgu_registration_number)}',
        )

        # ── Section I — Personal Information ──────────────────────────────────
        story += build_section_heading('I', 'PERSONAL INFORMATION')

        pairs = [
            ('Full Name',           full_name(fisherfolk)),
            ('Fisherfolk ID',       f'FISHR-{fisherfolk.id:06d}'),
            ('LGU Registration No.',fmt_field(fisherfolk.lgu_registration_number)),
            ('FishR No.',           fmt_field(fisherfolk.fishr_number)),
            ('RSBSA No.',           fmt_field(fisherfolk.rsbsa_number)),
            ('PhilSys No.',         fmt_field(fisherfolk.philsys_number)),
            ('Barangay',            fmt_field(fisherfolk.barangay)),
            ('Gender',               fmt_field(fisherfolk.gender)),
            ('Birthdate',            fmt_date(fisherfolk.birthdate)),
            ('Civil Status',         fmt_field(fisherfolk.civil_status)),
            ('Highest Education',    fmt_field(fisherfolk.highest_education)),
            ('Contact No.',          fmt_field(fisherfolk.contact_number)),
            ('Fisherfolk Type',      fmt_field(fisherfolk.fisherfolk_type)),
            ('Municipality',         'Aringay'),
            ('Province',             'La Union'),
            ('Date Registered',      fmt_date(fisherfolk.date_registered)),
            ('PWD',                  'Yes' if fisherfolk.is_pwd else 'No'),
            ('4Ps Beneficiary',      'Yes' if fisherfolk.is_4ps_beneficiary else 'No'),
            ('Senior Citizen',       'Yes' if fisherfolk.is_senior_citizen else 'No'),
            ('ICC/IP Member',        f'Yes — {fmt_field(fisherfolk.icc_ip_name)}' if fisherfolk.is_icc_ip_member else 'No'),
            ('Has Vessel',           'Yes' if fisherfolk.has_vessel else 'No'),
            ('Status',               build_status_badge(fisherfolk.is_active)),
        ]
        story.append(build_keyvalue_grid(pairs, columns=2, page_width=PAGE_WIDTH))
        story.append(Spacer(1, 12))

        # ── Section II — Ponds ─────────────────────────────────────────────────
        story += build_section_heading('II', 'PONDS')

        ponds = list(fisherfolk.ponds.all())
        if not ponds:
            story.append(_empty_state(
                'No ponds have been registered for this fisherfolk.'
            ))
        else:
            pond_rows = [
                [
                    fmt_field(p.name),
                    fmt_field(p.barangay),
                    fmt_field(p.area_hectares),
                    fmt_field(p.water_source),
                    build_status_badge(p.is_active),
                ]
                for p in ponds
            ]
            story.append(build_ledger_table(
                ['Pond Name', 'Barangay', 'Area (ha)', 'Water Source', 'Status'],
                pond_rows,
                col_widths=[130, 100, 78, 100, 60],
            ))

        story.append(Spacer(1, 12))

        # ── Section III — Stocking, Activity & Harvest History ────────────────
        # Per stocking cycle (StockingRecord), same header-bar-then-sub-tables
        # shape as FarmerProfileReport's crop-cycle section.
        story += build_section_heading('III', 'STOCKING, ACTIVITY & HARVEST HISTORY')

        stocking_records = sorted(
            fisherfolk.stocking_records.all(),
            key=lambda r: r.date_stocked, reverse=True,
        )

        if not stocking_records:
            story.append(_empty_state(
                'No stocking records have been recorded for this fisherfolk.'
            ))
        else:
            cycle_hdr_style = _P(FONT_BOLD, 9, WHITE)

            for idx, rec in enumerate(stocking_records):
                if idx > 0:
                    story.append(Spacer(1, 6))
                    story.append(HRFlowable(
                        width='100%', thickness=0.5,
                        color=BORDER_COLOR, spaceAfter=6,
                    ))

                # Cycle header bar
                bar_text = (
                    f'{fmt_field(rec.species.species_name if rec.species else None)}  ·  '
                    f'Pond: {fmt_field(rec.pond.name if rec.pond else None)}  ·  '
                    f'{fmt_field(rec.season)} {fmt_field(rec.year)}  ·  '
                    f'Stocked: {fmt_date(rec.date_stocked)}  ·  '
                    f'Status: {fmt_field(rec.status)}'
                )
                bar = Table([[Paragraph(bar_text, cycle_hdr_style)]], colWidths=[PAGE_WIDTH])
                bar.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), PRIMARY_GREEN),
                    ('TOPPADDING', (0, 0), (-1, -1), 7),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                    ('LEFTPADDING', (0, 0), (-1, -1), 10),
                    ('RIGHTPADDING', (0, 0), (-1, -1), 10),
                ]))
                story.append(bar)
                story.append(Spacer(1, 6))

                # A. Activity Log
                story.append(Paragraph('A. Activity Log', S['SubLabel']))
                logs = sorted(rec.logs.all(), key=lambda l: l.date_of_activity)
                if logs:
                    log_rows = [
                        [fmt_date(l.date_of_activity), fmt_field(l.activity), fmt_field(l.notes)]
                        for l in logs
                    ]
                    story.append(build_ledger_table(
                        ['Date', 'Activity Type', 'Notes'],
                        log_rows,
                        col_widths=[70, 140, 258],
                    ))
                else:
                    story.append(Paragraph(
                        'No activity logs have been recorded for this stocking record.',
                        S['EmptyItalic'],
                    ))

                # B. Harvest Records
                story.append(Paragraph('B. Harvest Records', S['SubLabel']))
                harvests = sorted(rec.harvests.all(), key=lambda h: h.harvest_date)
                if harvests:
                    harvest_rows = [
                        [
                            fmt_date(h.harvest_date),
                            f'{fmt_field(h.quantity_kg)} kg',
                            fmt_field(h.avg_body_weight_kg),
                        ]
                        for h in harvests
                    ]
                    story.append(build_ledger_table(
                        ['Harvest Date', 'Quantity', 'Avg Body Weight (kg)'],
                        harvest_rows,
                        col_widths=[160, 150, 158],
                    ))
                else:
                    story.append(Paragraph(
                        'No harvest records have been recorded for this stocking record.',
                        S['EmptyItalic'],
                    ))

        story.append(Spacer(1, 12))

        # ── Section IV — Assistance History ────────────────────────────────────
        story += build_section_heading('IV', 'ASSISTANCE HISTORY')

        asst_records = (
            FisherfolkBeneficiaryRecord.objects
            .filter(fisherfolk=fisherfolk)
            .order_by('-date_given', '-id')
        )

        if not asst_records.exists():
            story.append(Paragraph(
                'No assistance records found for this fisherfolk.',
                S['EmptyItalic'],
            ))
        else:
            asst_rows = []
            for r in asst_records:
                asst_rows.append([
                    fmt_field(r.assistance_type),
                    # source_agencies is a list now (was a single string) —
                    # join for display; fmt_field's own str(value) would
                    # otherwise render the raw Python list repr.
                    fmt_field(', '.join(r.source_agencies)),
                    fmt_field(r.quantity),
                    fmt_field(r.season),
                    fmt_field(r.year),
                    fmt_date(r.date_given),
                ])
            story.append(build_ledger_table(
                ['Assistance Type', 'Source Agency', 'Quantity', 'Season', 'Year', 'Date Given'],
                asst_rows,
                col_widths=[100, 120, 70, 45, 38, 95],
            ))

        story.append(Spacer(1, 30))

        # ── Section V — Verification ────────────────────────────────────────────
        story += build_section_heading('V', 'VERIFICATION')
        story.append(Spacer(1, 10))

        printed_by = (
            (getattr(request.user, 'full_name', '') or '').strip()
            or getattr(request.user, 'email', 'Unknown')
        )
        story.append(build_signature_block(
            left_label='Prepared by',
            left_role=(getattr(request.user, 'role', '') or '').title() or 'System Administrator',
            printed_by_name=printed_by,
            page_width=PAGE_WIDTH,
        ))
        story.append(Spacer(1, 14))
        story.append(Paragraph(
            'This is an official record generated by the OMAg Aringay Integrated '
            'Agricultural Monitoring and Production Management System.',
            S['Disclaimer'],
        ))

        return story


# ─── TASK 2 — Farmer Masterlist ───────────────────────────────────────────────

class FarmerMasterlistReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        today   = _today()
        farmers = Farmer.objects.prefetch_related('farm_parcels').order_by('last_name', 'first_name')

        if wants_pdf(request):
            return self._build_pdf(farmers, today)

        csv_headers = [
            'RSBSA Number', 'Full Name', 'Barangay',
            'Land Area (ha)', 'Commodity', 'Farm Status', 'Date Registered',
        ]
        rows = []
        for farmer in farmers:
            parcels = list(farmer.farm_parcels.all())
            if not parcels:
                rows.append([
                    fmt_field(farmer.rsbsa_number), full_name(farmer),
                    fmt_field(farmer.barangay), 'N/A', 'N/A', 'N/A',
                    fmt_date(farmer.date_registered),
                ])
            else:
                for p in parcels:
                    rows.append([
                        fmt_field(farmer.rsbsa_number), full_name(farmer),
                        fmt_field(farmer.barangay), fmt_field(p.area_hectares),
                        fmt_field(p.commodity_name), fmt_field(p.farm_status),
                        fmt_date(farmer.date_registered),
                    ])
        return build_csv_response(
            f'farmer_masterlist_{today}.csv',
            'Farmer Masterlist Report',
            csv_headers, rows,
        )

    def _build_pdf(self, farmers, today):
        buf, doc = _make_doc()
        story = []

        story += build_official_header(
            LOGO_PATH,
            'Farmer Masterlist Report',
            'Office of the Municipal Agriculturist · Aringay, La Union',
        )

        total    = farmers.count()
        active   = farmers.filter(is_active=True).count()
        inactive = total - active
        story.append(build_stats_row([
            ('Total Farmers', total), ('Active', active), ('Inactive', inactive),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # col_widths: 25+75+110+65+65+55+73 = 468pt
        rows = []
        no = 0
        for farmer in farmers:
            parcels = list(farmer.farm_parcels.all())
            if not parcels:
                no += 1
                rows.append([
                    str(no), fmt_field(farmer.rsbsa_number), full_name(farmer),
                    fmt_field(farmer.barangay), 'N/A',
                    build_status_badge(farmer.is_active),
                    fmt_date(farmer.date_registered),
                ])
            else:
                for p in parcels:
                    no += 1
                    rows.append([
                        str(no), fmt_field(farmer.rsbsa_number), full_name(farmer),
                        fmt_field(farmer.barangay), fmt_field(p.commodity_name),
                        build_status_badge(farmer.is_active),
                        fmt_date(farmer.date_registered),
                    ])

        story.append(build_ledger_table(
            ['No.', 'RSBSA No.', 'Full Name', 'Barangay', 'Commodity', 'Status', 'Date Registered'],
            rows,
            col_widths=[25, 75, 110, 65, 65, 55, 73],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by',
            left_role='OMAg Records Officer',
            page_width=PAGE_WIDTH,
        ))

        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'farmer_masterlist_{today}.pdf')


# ─── TASK 3 — Fisherfolk Masterlist ──────────────────────────────────────────

class FisherfolkMasterlistReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        today      = _today()
        fisherfolk = Fisherfolk.objects.all().order_by('last_name', 'first_name')

        if wants_pdf(request):
            return self._build_pdf(fisherfolk, today)

        csv_headers = ['LGU Number', 'Full Name', 'Type', 'Barangay', 'Status', 'Date Registered']
        rows = [
            [
                fmt_field(p.lgu_registration_number),
                fmt_field(p.full_name),
                fmt_field(p.fisherfolk_type),
                fmt_field(p.barangay),
                'Active' if p.is_active else 'Inactive',
                fmt_date(p.date_registered),
            ]
            for p in fisherfolk
        ]
        return build_csv_response(
            f'fisherfolk_masterlist_{today}.csv',
            'Fisherfolk Masterlist Report',
            csv_headers, rows,
        )

    def _build_pdf(self, fisherfolk, today):
        buf, doc = _make_doc()
        story = []

        story += build_official_header(
            LOGO_PATH,
            'Fisherfolk Masterlist Report',
            'Office of the Municipal Agriculturist · Aringay, La Union',
        )

        total       = fisherfolk.count()
        aquaculture = fisherfolk.filter(fisherfolk_type='Aquaculture').count()
        capture     = fisherfolk.filter(fisherfolk_type='Capture').count()
        story.append(build_stats_row([
            ('Total Fisherfolk', total), ('Aquaculture', aquaculture),
            ('Capture', capture),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # col_widths: 25+80+110+68+68+50+67 = 468pt
        rows = []
        for i, p in enumerate(fisherfolk, 1):
            rows.append([
                str(i),
                fmt_field(p.lgu_registration_number),
                fmt_field(p.full_name),
                fmt_field(p.barangay),
                fmt_field(p.fisherfolk_type),
                build_status_badge(p.is_active),
                fmt_date(p.date_registered),
            ])

        story.append(build_ledger_table(
            ['No.', 'LGU Reg. No.', 'Full Name', 'Barangay', 'Fishery Type', 'Status', 'Date Registered'],
            rows,
            col_widths=[25, 80, 110, 68, 68, 50, 67],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by',
            left_role='OMAg Records Officer',
            page_width=PAGE_WIDTH,
        ))

        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'fisherfolk_masterlist_{today}.pdf')


# ─── TASK 5 — Seasonal / Harvest Production Report ───────────────────────────

def _harvest_owner(rec):
    """(name, rsbsa, barangay) of whoever a harvest record belongs to.

    HarvestRecord.farm_parcel is empty on every real row; the live link is the harvest's crop monitoring
    record, which carries its own farmer (or, for an organization's crop, the organization) and location."""
    parcel = rec.farm_parcel
    mon = rec.monitoring_record
    farmer = (parcel.farmer if parcel else None) or (mon.farmer if mon else None)
    org = mon.farmers_organization if mon else None
    if farmer:
        name, rsbsa = full_name(farmer), fmt_field(farmer.rsbsa_number)
    elif org:
        name, rsbsa = org.name, 'N/A'
    else:
        name, rsbsa = 'N/A', 'N/A'
    barangay = (parcel.barangay if parcel else '') or (mon.farm_location_barangay if mon else '') or (org.barangay if org else '')
    return name, rsbsa, fmt_field(barangay)


class HarvestProductionReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.db.models import Q
        today    = _today()
        year     = request.query_params.get('year', '')
        season   = request.query_params.get('season', '')
        barangay = request.query_params.get('barangay', '')

        records = (
            HarvestRecord.objects
            .select_related(
                'farm_parcel', 'farm_parcel__farmer',
                'monitoring_record', 'monitoring_record__farmer', 'monitoring_record__farmers_organization',
            )
            .order_by('-year', 'season', 'crop_name')
        )
        if year:
            records = records.filter(year=year)
        if season:
            records = records.filter(season__iexact=season)
        if barangay:
            records = records.filter(
                Q(farm_parcel__barangay__iexact=barangay) |
                Q(monitoring_record__farm_location_barangay__iexact=barangay) |
                Q(monitoring_record__farmers_organization__barangay__iexact=barangay)
            )

        records = list(records)

        if wants_pdf(request):
            return self._build_pdf(records, year, season, barangay, today, _sig_params(request))

        season_label = season if season else 'All'
        year_label   = year if year else 'All'
        csv_headers = [
            'No.', 'Farmer Name', 'RSBSA', 'Barangay', 'Crop Name',
            'Area (ha)', 'Volume (kg)', 'Volume (bags)', 'Season', 'Year',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            owner_name, owner_rsbsa, owner_barangay = _harvest_owner(rec)
            csv_rows.append([
                i, owner_name,
                owner_rsbsa,
                owner_barangay,
                fmt_field(rec.crop_name),
                fmt_field(rec.area_harvested_hectares),
                fmt_field(rec.volume_kg),
                fmt_field(rec.volume_bags),
                fmt_field(rec.season),
                fmt_field(rec.year),
            ])
        return build_csv_response(
            f'production_report_{season_label}_{year_label}_{today}.csv',
            'Seasonal Production Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, season, barangay, today, sig=None):
        sig = sig or {}
        season_label   = season if season else 'All Seasons'
        year_label     = year if year else 'All Years'
        barangay_label = barangay if barangay else 'All Barangays'
        fn_season      = season.lower() if season else 'all'
        fn_year        = year if year else 'all'

        buf, doc = _make_doc()
        story = []

        story += build_official_header(LOGO_PATH, 'Seasonal Production Report')

        story.append(build_stats_row([
            ('Season', season_label), ('Year', year_label), ('Barangay', barangay_label),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        sum_area    = Decimal('0')
        sum_vol_kg  = Decimal('0')
        sum_vol_bag = Decimal('0')

        rows = []
        for i, rec in enumerate(records, 1):
            area    = rec.area_harvested_hectares or Decimal('0')
            vol_kg  = rec.volume_kg or Decimal('0')
            vol_bag = rec.volume_bags or Decimal('0')
            sum_area    += area
            sum_vol_kg  += vol_kg
            sum_vol_bag += vol_bag
            owner_name, _rsbsa, owner_barangay = _harvest_owner(rec)
            rows.append([
                str(i), owner_name,
                owner_barangay,
                fmt_field(rec.crop_name),
                f'{area:,.2f}', f'{vol_kg:,.2f}', f'{vol_bag:,.2f}',
                fmt_field(rec.season), fmt_field(rec.year),
            ])

        totals_row = [
            'TOTAL', '', '', '',
            f'{sum_area:,.2f}', f'{sum_vol_kg:,.2f}', f'{sum_vol_bag:,.2f}',
            '', '',
        ]
        story.append(build_ledger_table(
            ['No.', 'Farmer Name', 'Barangay', 'Crop', 'Area (ha)', 'Vol (kg)', 'Vol (bags)', 'Season', 'Year'],
            rows + [totals_row],
            col_widths=[20, 90, 60, 60, 43, 50, 48, 42, 35],
            extra_style_cmds=[
                # Totals row (last row = -1) gets PRIMARY_GREEN background
                ('BACKGROUND', (0, -1), (-1, -1), PRIMARY_GREEN),
                ('TEXTCOLOR', (0, -1), (-1, -1), WHITE),
                ('FONTNAME', (0, -1), (-1, -1), FONT_BOLD),
            ],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by'),
            reviewed_role=sig.get('reviewed_role'),
            noted_by=sig.get('noted_by'),
            noted_role=sig.get('noted_role'),
            page_width=PAGE_WIDTH,
        ))

        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'production_report_{fn_season}_{fn_year}_{today}.pdf')


# ─── Private style helpers ────────────────────────────────────────────────────

def _P(font, size, color, alignment=0):
    """Quick ParagraphStyle factory."""
    from reportlab.lib.styles import ParagraphStyle as PS
    return PS('_q', fontName=font, fontSize=size, textColor=color, alignment=alignment, leading=size + 3)


def _bold_right():
    """Bold PRIMARY_GREEN right-aligned total label."""
    from reportlab.lib.enums import TA_RIGHT
    return _P(FONT_BOLD, 9, PRIMARY_GREEN, alignment=2)  # TA_RIGHT = 2


# ─── TASK 6 — Planting Records Report ─────────────────────────────────────────

class PlantingRecordsReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        today    = _today()
        year     = request.query_params.get('year', '')
        season   = request.query_params.get('season', '')
        barangay = request.query_params.get('barangay', '')

        records = PlantingRecord.objects.select_related(
            'farm_parcel', 'farm_parcel__farmer',
        ).order_by('-year', 'season', 'crop_name')

        if year:
            records = records.filter(year=year)
        if season:
            records = records.filter(season__iexact=season)
        if barangay:
            records = records.filter(farm_parcel__barangay__iexact=barangay)

        records = list(records)

        if wants_pdf(request):
            return self._build_pdf(records, year, season, barangay, today)

        season_label = season if season else 'All'
        year_label   = year if year else 'All'
        csv_headers = [
            'No.', 'Farmer Name', 'Barangay', 'Crop Name',
            'Area (ha)', 'Date Planted', 'Season', 'Year',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            csv_rows.append([
                i, full_name(rec.farm_parcel.farmer),
                fmt_field(rec.farm_parcel.barangay),
                fmt_field(rec.crop_name),
                fmt_field(rec.area_planted_hectares),
                fmt_date(rec.date_planted),
                fmt_field(rec.season),
                fmt_field(rec.year),
            ])
        return build_csv_response(
            f'planting_report_{season_label}_{year_label}_{today}.csv',
            'Planting Records Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, season, barangay, today):
        season_label   = season if season else 'All Seasons'
        year_label     = year if year else 'All Years'
        barangay_label = barangay if barangay else 'All Barangays'
        fn_season      = season.lower() if season else 'all'
        fn_year        = year if year else 'all'

        buf, doc = _make_doc()
        story = []

        story += build_official_header(LOGO_PATH, 'Planting Records Report')
        story.append(build_stats_row([
            ('Season', season_label), ('Year', year_label), ('Barangay', barangay_label),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # col_widths: 20+100+60+75+45+60+33+25 = 418... let me sum to 468
        # 20+105+60+78+45+62+35+63 = 468
        headers = ['No.', 'Farmer Name', 'Barangay', 'Crop', 'Area (ha)', 'Date Planted', 'Season', 'Year']
        col_widths = [20, 105, 60, 78, 45, 62, 35, 63]  # sum=468

        rows = []
        for i, rec in enumerate(records, 1):
            rows.append([
                i, full_name(rec.farm_parcel.farmer),
                fmt_field(rec.farm_parcel.barangay),
                fmt_field(rec.crop_name),
                fmt_field(rec.area_planted_hectares),
                fmt_date(rec.date_planted),
                fmt_field(rec.season),
                fmt_field(rec.year),
            ])

        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by', left_role='OMAg Records Officer',
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'planting_report_{fn_season}_{fn_year}_{today}.pdf')


# ─── TASK 7 — Damage Reports Export ───────────────────────────────────────────

class DamageReportsExport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        today    = _today()
        barangay = request.query_params.get('barangay', '')
        season   = request.query_params.get('season', '')
        year     = request.query_params.get('year', '')

        records = DamageReport.objects.order_by('-calamity_date')

        if barangay:
            records = records.filter(barangay__iexact=barangay)
        if season:
            records = records.filter(season__iexact=season)
        if year:
            records = records.filter(year=year)

        records = list(records)

        if wants_pdf(request):
            return self._build_pdf(records, year, season, barangay, today)

        season_label = season if season else 'All'
        year_label   = year if year else 'All'
        csv_headers = [
            'No.', 'Barangay', 'Calamity', 'Date', 'Season', 'Year',
            'Crop Damage', 'Volume (kg)', 'Livestock', 'Head Count', 'Loss (PHP)',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            csv_rows.append([
                i,
                fmt_field(rec.barangay),
                fmt_field(rec.calamity_name),
                fmt_date(rec.calamity_date),
                fmt_field(rec.season),
                fmt_field(rec.year),
                fmt_field(rec.damaged_crops),
                fmt_field(rec.crop_volume_damaged_kg),
                fmt_field(rec.damaged_livestock),
                fmt_field(rec.livestock_head_count_affected),
                fmt_currency(rec.estimated_loss_php) if rec.estimated_loss_php else '—',
            ])
        return build_csv_response(
            f'damage_report_{season_label}_{year_label}_{today}.csv',
            'Calamity Damage Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, season, barangay, today):
        season_label   = season if season else 'All Seasons'
        year_label     = year if year else 'All Years'
        barangay_label = barangay if barangay else 'All Barangays'
        fn_season      = season.lower() if season else 'all'
        fn_year        = year if year else 'all'

        buf, doc = _make_doc()
        story = []

        story += build_official_header(LOGO_PATH, 'Calamity Damage Report')
        story.append(build_stats_row([
            ('Season', season_label), ('Year', year_label), ('Barangay', barangay_label),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # 11 columns summing to 468pt
        headers = [
            'No.', 'Barangay', 'Calamity', 'Date', 'Season', 'Year',
            'Crop Damage', 'Vol (kg)', 'Livestock', 'Hd Cnt', 'Loss (PHP)',
        ]
        col_widths = [20, 55, 70, 52, 28, 28, 55, 38, 47, 35, 40]  # sum=468

        rows = []
        for i, rec in enumerate(records, 1):
            rows.append([
                i,
                fmt_field(rec.barangay),
                fmt_field(rec.calamity_name),
                fmt_date(rec.calamity_date),
                fmt_field(rec.season),
                fmt_field(rec.year),
                fmt_field(rec.damaged_crops),
                fmt_field(rec.crop_volume_damaged_kg),
                fmt_field(rec.damaged_livestock),
                fmt_field(rec.livestock_head_count_affected),
                fmt_currency(rec.estimated_loss_php) if rec.estimated_loss_php else '—',
            ])

        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by', left_role='OMAg Records Officer',
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'damage_report_{fn_season}_{fn_year}_{today}.pdf')


# ─── TASK 8 — Seasonal Variance Report ───────────────────────────────────────

class SeasonalVarianceReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from production.models import CropMonitoringRecord
        today = _today()
        year = request.query_params.get('year', '')
        season = request.query_params.get('season', '')

        qs = CropMonitoringRecord.objects.filter(
            status='Harvested',
            actual_yield_kg__isnull=False,
            estimated_yield_kg__isnull=False,
        ).select_related('crop_type', 'farm_parcel', 'farm_parcel__farmer')

        if year:
            qs = qs.filter(year=year)
        if season:
            qs = qs.filter(season__iexact=season)

        records = list(qs.order_by('season', 'crop_type__name'))

        if wants_pdf(request):
            return self._build_pdf(records, year, season, today)

        csv_headers = [
            'No.', 'Crop', 'Season', 'Year', 'Area (ha)',
            'Estimated Yield (kg)', 'Actual Yield (kg)', 'Variance (kg)', 'Variance (%)',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            csv_rows.append([
                i, fmt_field(rec.crop_type.name), fmt_field(rec.season), fmt_field(rec.year),
                fmt_field(rec.area_planted_ha),
                fmt_field(rec.estimated_yield_kg), fmt_field(rec.actual_yield_kg),
                fmt_field(rec.yield_variance_kg), fmt_field(rec.yield_variance_pct),
            ])
        return build_csv_response(
            f'seasonal_variance_{year or "all"}_{today}.csv',
            'Seasonal Crop Yield Variance Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, season, today):
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Seasonal Crop Yield Variance Report')
        story.append(build_stats_row([
            ('Season', season if season else 'All'),
            ('Year', year if year else 'All'),
            ('Records', len(records)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        # col_widths: 20+80+40+35+45+70+70+60+48 = 468pt
        rows = []
        for i, rec in enumerate(records, 1):
            rows.append([
                str(i), fmt_field(rec.crop_type.name),
                fmt_field(rec.season), fmt_field(rec.year),
                fmt_field(rec.area_planted_ha),
                fmt_field(rec.estimated_yield_kg),
                fmt_field(rec.actual_yield_kg),
                fmt_field(rec.yield_variance_kg),
                fmt_field(rec.yield_variance_pct),
            ])
        story.append(build_ledger_table(
            ['No.', 'Crop', 'Season', 'Year', 'Area (ha)', 'Est. Yield (kg)', 'Act. Yield (kg)', 'Var. (kg)', 'Var. (%)'],
            rows,
            col_widths=[20, 80, 40, 35, 45, 70, 70, 60, 48],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'seasonal_variance_{year or "all"}_{today}.pdf')


# ─── TASK 9 — Farm Visit Report ───────────────────────────────────────────────

class FarmVisitReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from monitoring.models import FarmVisit
        today = _today()
        year = request.query_params.get('year', '')
        barangay = request.query_params.get('barangay', '')

        qs = FarmVisit.objects.select_related('farmer', 'conducted_by').order_by('-visit_date')
        if year:
            qs = qs.filter(visit_date__year=year)
        if barangay:
            qs = qs.filter(farmer__barangay=barangay)

        records = list(qs)

        if wants_pdf(request):
            return self._build_pdf(records, year, barangay, today)

        csv_headers = [
            'No.', 'Farmer', 'Barangay', 'Visit Date', 'Next Visit', 'Purpose', 'Conducted By',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            csv_rows.append([
                i, fmt_field(rec.farmer.full_name), fmt_field(rec.farmer.barangay),
                fmt_date(rec.visit_date), fmt_date(rec.next_visit_date),
                fmt_field(rec.purpose),
                fmt_field(getattr(rec.conducted_by, 'full_name', '') or getattr(rec.conducted_by, 'email', '')),
            ])
        return build_csv_response(
            f'farm_visits_{year or "all"}_{today}.csv',
            'Farm Visit Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, barangay, today):
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Farm Visit Report')
        story.append(build_stats_row([
            ('Year', year if year else 'All'),
            ('Barangay', barangay if barangay else 'All'),
            ('Total Visits', len(records)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        # col_widths: 20+100+65+55+55+100+73 = 468pt
        rows = []
        for i, rec in enumerate(records, 1):
            cb = rec.conducted_by
            cb_name = fmt_field(getattr(cb, 'full_name', '') or getattr(cb, 'email', '')) if cb else '—'
            rows.append([
                str(i), fmt_field(rec.farmer.full_name), fmt_field(rec.farmer.barangay),
                fmt_date(rec.visit_date), fmt_date(rec.next_visit_date),
                fmt_field(rec.purpose), cb_name,
            ])
        story.append(build_ledger_table(
            ['No.', 'Farmer', 'Barangay', 'Visit Date', 'Next Visit', 'Purpose', 'Conducted By'],
            rows,
            col_widths=[20, 100, 65, 55, 55, 100, 73],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'farm_visits_{year or "all"}_{today}.pdf')


# ─── TASK 10 — Seasonal Catch Report ─────────────────────────────────────────

class SeasonalCatchReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        today = _today()
        year = request.query_params.get('year', '')
        barangay = request.query_params.get('barangay', '')

        qs = FishingTripLog.objects.select_related('fisherfolk').order_by('-trip_date')
        if year:
            qs = qs.filter(trip_date__year=year)
        if barangay:
            qs = qs.filter(fisherfolk__barangay=barangay)

        records = list(qs)

        if wants_pdf(request):
            return self._build_pdf(records, year, barangay, today)

        csv_headers = [
            'No.', 'Fisherfolk', 'Barangay', 'Trip Date', 'Return Date',
            'Fishing Ground', 'Gear Used', 'Total Catch (kg)',
        ]
        csv_rows = []
        for i, rec in enumerate(records, 1):
            csv_rows.append([
                i, fmt_field(rec.fisherfolk.full_name), fmt_field(rec.fisherfolk.barangay),
                fmt_date(rec.trip_date), fmt_date(rec.return_date),
                fmt_field(rec.fishing_ground), fmt_field(rec.gear_used),
                fmt_field(rec.total_catch_kg),
            ])
        return build_csv_response(
            f'catch_report_{year or "all"}_{today}.csv',
            'Seasonal Catch Report',
            csv_headers, csv_rows,
        )

    def _build_pdf(self, records, year, barangay, today):
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Seasonal Catch Report')
        total_catch = sum((r.total_catch_kg or Decimal('0')) for r in records)
        story.append(build_stats_row([
            ('Year', year if year else 'All'),
            ('Barangay', barangay if barangay else 'All'),
            ('Total Catch (kg)', f'{total_catch:,.2f}'),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        # col_widths: 20+90+60+50+50+80+68+50 = 468pt
        rows = []
        for i, rec in enumerate(records, 1):
            rows.append([
                str(i), fmt_field(rec.fisherfolk.full_name), fmt_field(rec.fisherfolk.barangay),
                fmt_date(rec.trip_date), fmt_date(rec.return_date),
                fmt_field(rec.fishing_ground), fmt_field(rec.gear_used),
                fmt_field(rec.total_catch_kg),
            ])
        story.append(build_ledger_table(
            ['No.', 'Fisherfolk', 'Barangay', 'Trip Date', 'Return Date', 'Fishing Ground', 'Gear Used', 'Catch (kg)'],
            rows,
            col_widths=[20, 90, 60, 50, 50, 80, 68, 50],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Submitted by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'catch_report_{year or "all"}_{today}.pdf')


# ─── Module 6: Enhanced Monitoring Reports ───────────────────────────────────

class BarangayCropSummaryReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from datetime import date as date_type
        season = request.query_params.get('season')
        year = request.query_params.get('year')
        barangay = request.query_params.get('barangay')
        crop_name = request.query_params.get('crop_name')
        fmt = request.query_params.get('format', 'pdf')

        if not season or not year:
            from rest_framework.response import Response
            return Response({'detail': 'season and year are required.'}, status=400)

        qs = BarangayCropSummary.objects.filter(season=season, year=year).order_by('barangay', 'crop_name')
        if barangay:
            qs = qs.filter(barangay__iexact=barangay)
        if crop_name:
            qs = qs.filter(crop_name__iexact=crop_name)
        records = list(qs)
        today = date_type.today()

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="crop_summary_{season}_{year}.csv"'
            writer = csv.writer(response)
            writer.writerow([
                'No.', 'Barangay', 'Crop', 'Season', 'Year', 'Area (ha)',
                'Farmers', 'Est. Yield (kg)', 'Act. Yield (kg)', 'Var%',
                'Stage', 'Alert', 'Status',
            ])
            for i, rec in enumerate(records, 1):
                var_pct = float(rec.yield_variance_pct) if rec.yield_variance_pct is not None else ''
                writer.writerow([
                    i, rec.barangay, rec.crop_name, rec.season, rec.year,
                    float(rec.area_planted_ha), rec.number_of_farmers,
                    float(rec.estimated_yield_kg) if rec.estimated_yield_kg else '',
                    float(rec.actual_yield_kg) if rec.actual_yield_kg else '',
                    var_pct,
                    rec.current_growth_stage, rec.alert_level, rec.submission_status,
                ])
            return response

        # PDF
        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            leftMargin=72, rightMargin=72, topMargin=72, bottomMargin=72,
        )
        styles = get_styles()
        story = []
        title = f'Barangay Crop Production Summary — {season} Season {year}'
        if barangay:
            title += f' ({barangay})'
        story += build_official_header(LOGO_PATH, title)

        # Stats row
        from django.db.models import Sum, Count
        agg = qs.aggregate(
            total_area=Sum('area_planted_ha'),
            total_est=Sum('estimated_yield_kg'),
            total_act=Sum('actual_yield_kg'),
            barangay_count=Count('barangay', distinct=True),
        )
        story.append(build_stats_row([
            ('Barangays', agg['barangay_count'] or 0),
            ('Records', len(records)),
            ('Total Area (ha)', float(agg['total_area'] or 0)),
            ('Est. Yield (kg)', float(agg['total_est'] or 0)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # Main table: 20+60+65+30+35+55+55+55+35+35+23 = 468
        col_widths = [20, 60, 65, 30, 35, 55, 55, 55, 35, 35, 23]
        headers = [
            'No.', 'Barangay', 'Crop', 'Ssn', 'Year', 'Area\n(ha)',
            'Est Yield\n(kg)', 'Act Yield\n(kg)', 'Var%', 'Stage', 'Alert',
        ]
        rows = []
        for i, rec in enumerate(records, 1):
            var_pct = f'{float(rec.yield_variance_pct):.1f}%' if rec.yield_variance_pct is not None else '—'
            rows.append([
                str(i),
                fmt_field(rec.barangay),
                fmt_field(rec.crop_name),
                rec.season,
                str(rec.year),
                f'{float(rec.area_planted_ha):.4f}',
                f'{float(rec.estimated_yield_kg):,.0f}' if rec.estimated_yield_kg else '—',
                f'{float(rec.actual_yield_kg):,.0f}' if rec.actual_yield_kg else '—',
                var_pct,
                fmt_field(rec.current_growth_stage or '—'),
                fmt_field(rec.alert_level),
            ])
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))

        # Footnote section for observed_problems
        problems = [(rec.barangay, rec.crop_name, rec.observed_problems)
                    for rec in records if rec.observed_problems]
        if problems:
            story.append(Spacer(1, 18))
            story.append(build_section_heading('Observed Problems / Remarks'))
            for barangay_name, cn, problem in problems:
                story.append(Paragraph(
                    f'<b>{barangay_name} — {cn}:</b> {problem}',
                    styles['Normal'],
                ))
                story.append(Spacer(1, 4))

        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'crop_summary_{season}_{year}.pdf')


class CropHistoricalReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from datetime import date as date_type
        crop_name = request.query_params.get('crop_name')
        barangay = request.query_params.get('barangay')
        fmt = request.query_params.get('format', 'pdf')

        if not crop_name:
            from rest_framework.response import Response
            return Response({'detail': 'crop_name is required.'}, status=400)

        qs = BarangayCropSummary.objects.filter(crop_name__iexact=crop_name).order_by('year', 'season')
        if barangay:
            qs = qs.filter(barangay__iexact=barangay)
        records = list(qs)
        today = date_type.today()

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="crop_history_{crop_name}.csv"'
            writer = csv.writer(response)
            writer.writerow([
                'Season', 'Year', 'Barangay', 'Area (ha)',
                'Est. Yield (kg)', 'Act. Yield (kg)', 'Var%', 'Causal Factor',
            ])
            for rec in records:
                var_pct = float(rec.yield_variance_pct) if rec.yield_variance_pct else ''
                writer.writerow([
                    rec.season, rec.year,
                    rec.barangay if barangay else 'All',
                    float(rec.area_planted_ha),
                    float(rec.estimated_yield_kg) if rec.estimated_yield_kg else '',
                    float(rec.actual_yield_kg) if rec.actual_yield_kg else '',
                    var_pct,
                    rec.causal_factor or 'None',
                ])
            return response

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            leftMargin=72, rightMargin=72, topMargin=72, bottomMargin=72,
        )
        styles = get_styles()
        story = []
        scope_label = barangay if barangay else 'Municipality-wide'
        story += build_official_header(LOGO_PATH, f'Crop Historical Report — {crop_name} ({scope_label})')
        story.append(Spacer(1, 8))

        # 40+40+60+75+75+60+118 = 468
        col_widths = [40, 40, 60, 75, 75, 60, 118]
        headers = ['Season', 'Year', 'Area (ha)', 'Est Yield\n(kg)', 'Act Yield\n(kg)', 'Var%', 'Causal Factor']
        rows = []
        for rec in records:
            var_pct = f'{float(rec.yield_variance_pct):.1f}%' if rec.yield_variance_pct is not None else '—'
            rows.append([
                rec.season,
                str(rec.year),
                f'{float(rec.area_planted_ha):.4f}',
                f'{float(rec.estimated_yield_kg):,.0f}' if rec.estimated_yield_kg else '—',
                f'{float(rec.actual_yield_kg):,.0f}' if rec.actual_yield_kg else '—',
                var_pct,
                fmt_field(rec.causal_factor or 'None'),
            ])
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'crop_history_{crop_name.replace(" ", "_")}.pdf')


class FisheriesCatchSummaryReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from datetime import date as date_type
        from django.db.models import Count, Q, Sum

        season = request.query_params.get('season')
        year = request.query_params.get('year')
        barangay = request.query_params.get('barangay')
        fmt = request.query_params.get('format', 'pdf')

        if not season or not year:
            from rest_framework.response import Response
            return Response({'detail': 'season and year are required.'}, status=400)

        if season == 'Wet':
            month_filter = Q(trip_date__month__in=[6, 7, 8, 9, 10, 11])
        else:
            month_filter = Q(trip_date__month__in=[1, 2, 3, 4, 5]) | Q(trip_date__month=12)

        qs = FishingTripLog.objects.filter(month_filter, trip_date__year=year)
        if barangay:
            qs = qs.filter(fisherfolk__barangay=barangay)

        trips = list(qs.select_related('fisherfolk').order_by('trip_date'))
        trip_ids = [t.id for t in trips]

        # By barangay
        by_barangay = list(
            qs.values('fisherfolk__barangay')
            .annotate(
                trip_count=Count('id'),
                total_kg=Sum('total_catch_kg'),
            )
            .order_by('fisherfolk__barangay')
        )

        # By species
        by_species = list(
            TripSpeciesEntry.objects.filter(fishing_trip_id__in=trip_ids)
            .values('species_name')
            .annotate(total_kg=Sum('volume_kg'), trip_count=Count('fishing_trip', distinct=True))
            .order_by('-total_kg')
        )

        today = date_type.today()

        if fmt == 'csv':
            response = HttpResponse(content_type='text/csv')
            response['Content-Disposition'] = f'attachment; filename="catch_summary_{season}_{year}.csv"'
            writer = csv.writer(response)
            writer.writerow(['=== BY BARANGAY ==='])
            writer.writerow(['Barangay', 'Trip Count', 'Total Catch (kg)'])
            for r in by_barangay:
                writer.writerow([
                    r['fisherfolk__barangay'], r['trip_count'],
                    float(r['total_kg'] or 0),
                ])
            writer.writerow([])
            writer.writerow(['=== BY SPECIES ==='])
            writer.writerow(['Species', 'Total Volume (kg)', 'Trip Count'])
            for r in by_species:
                writer.writerow([r['species_name'], float(r['total_kg'] or 0), r['trip_count']])
            writer.writerow([])
            writer.writerow(['=== INDIVIDUAL TRIP LOG ==='])
            writer.writerow([
                'No.', 'Fisherfolk', 'Barangay', 'Trip Date', 'Return Date',
                'Fishing Ground', 'Gear', 'Catch (kg)',
            ])
            for i, t in enumerate(trips, 1):
                writer.writerow([
                    i, t.fisherfolk.full_name, t.fisherfolk.barangay,
                    t.trip_date, t.return_date or '',
                    t.fishing_ground, t.gear_used,
                    float(t.total_catch_kg or 0),
                ])
            return response

        buf = io.BytesIO()
        doc = SimpleDocTemplate(
            buf,
            pagesize=letter,
            leftMargin=72, rightMargin=72, topMargin=72, bottomMargin=72,
        )
        styles = get_styles()
        story = []
        title_suffix = f' — {barangay}' if barangay else ''
        story += build_official_header(
            LOGO_PATH, f'Fisheries Catch Summary — {season} Season {year}{title_suffix}',
        )

        totals = qs.aggregate(
            total_kg=Sum('total_catch_kg'),
            trip_count=Count('id'),
        )
        story.append(build_stats_row([
            ('Trips', totals['trip_count'] or 0),
            ('Total Catch (kg)', float(totals['total_kg'] or 0)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # Section 1: By Barangay
        story.append(build_section_heading('Catch by Barangay'))
        b_rows = []
        for i, r in enumerate(by_barangay, 1):
            b_rows.append([
                str(i),
                fmt_field(r['fisherfolk__barangay']),
                str(r['trip_count']),
                f'{float(r["total_kg"] or 0):,.2f}',
            ])
        story.append(build_ledger_table(
            ['No.', 'Barangay', 'Trips', 'Total Catch (kg)'],
            b_rows,
            col_widths=[40, 160, 120, 148],
        ))
        story.append(Spacer(1, 14))

        # Section 2: By Species — 40+200+120+108=468
        story.append(build_section_heading('Catch by Species'))
        s_rows = []
        for i, r in enumerate(by_species, 1):
            s_rows.append([
                str(i),
                fmt_field(r['species_name']),
                f'{float(r["total_kg"] or 0):,.2f}',
                str(r['trip_count']),
            ])
        story.append(build_ledger_table(
            ['No.', 'Species', 'Total Volume (kg)', 'Trip Count'],
            s_rows,
            col_widths=[40, 200, 120, 108],
        ))
        story.append(Spacer(1, 14))

        # Section 3: Individual Trip Log
        story.append(build_section_heading('Individual Trip Log'))
        t_rows = []
        for i, t in enumerate(trips, 1):
            t_rows.append([
                str(i),
                fmt_field(t.fisherfolk.full_name),
                fmt_field(t.fisherfolk.barangay),
                fmt_date(t.trip_date),
                fmt_date(t.return_date) if t.return_date else '—',
                fmt_field(t.fishing_ground),
                fmt_field(t.gear_used),
                f'{float(t.total_catch_kg or 0):,.2f}',
            ])
        story.append(build_ledger_table(
            ['No.', 'Fisherfolk', 'Barangay', 'Trip Date', 'Return', 'Ground', 'Gear', 'Catch (kg)'],
            t_rows,
            col_widths=[20, 90, 65, 48, 48, 75, 60, 62],
        ))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by', left_role='OMAg Records Officer', page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'catch_summary_{season}_{year}.pdf')

# â”€â”€â”€ Harvested Crop Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class HarvestedCropReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.db.models import Q
        from django.http import JsonResponse
        from production.models import CropMonitoringRecord
        today = _today()

        start_date        = request.query_params.get('start_date', '')
        end_date          = request.query_params.get('end_date', '')
        barangay          = request.query_params.get('barangay', '')
        crop_name         = request.query_params.get('crop_name', '')
        organization       = request.query_params.get('organization', '')
        yield_performance = request.query_params.get('yield_performance', '')
        fmt               = request.query_params.get('format', 'excel')

        qs = CropMonitoringRecord.objects.filter(
            status='Harvested',
        ).select_related(
            'crop_type', 'farmers_organization', 'farmer',
            'farm_parcel', 'farm_parcel__farmer',
        ).only(
            # Only the columns this report reads: fetching whole rows for every harvested crop took ~16 s
            # against ~3 s for these, over the remote database.
            'id', 'status', 'farm_location_barangay', 'area_planted_ha', 'expected_harvest_date',
            'actual_harvest_date', 'estimated_yield_kg', 'actual_yield_kg',
            'crop_type_id', 'farmer_id', 'farm_parcel_id', 'farmers_organization_id',
            'crop_type__id', 'crop_type__name',
            'farmer__id', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name',
            'farm_parcel__id', 'farm_parcel__barangay', 'farm_parcel__farmer_id',
            'farm_parcel__farmer__id', 'farm_parcel__farmer__first_name', 'farm_parcel__farmer__middle_name',
            'farm_parcel__farmer__last_name',
            'farmers_organization__id', 'farmers_organization__name', 'farmers_organization__barangay',
        ).prefetch_related('harvest_records').order_by('crop_type__name', 'id')

        if start_date:
            qs = qs.filter(actual_harvest_date__gte=start_date)
        if end_date:
            qs = qs.filter(actual_harvest_date__lte=end_date)
        if barangay:
            qs = qs.filter(
                Q(farm_parcel__barangay__iexact=barangay) |
                Q(farm_location_barangay__iexact=barangay) |
                Q(farmers_organization__barangay__iexact=barangay)
            )
        if crop_name:
            qs = qs.filter(crop_type__name__icontains=crop_name)
        if organization:
            qs = qs.filter(farmers_organization_id=organization)

        records = list(qs)

        if yield_performance:
            from decimal import Decimal as D
            def _ratio(rec):
                est = rec.estimated_yield_kg
                act = rec.actual_yield_kg
                if not est or not act or est == 0:
                    return None
                return D(str(act)) / D(str(est))
            if yield_performance == 'above':
                records = [r for r in records if (_ratio(r) or D('0')) >= D('1.10')]
            elif yield_performance == 'average':
                records = [r for r in records if D('0.90') <= (_ratio(r) or D('0')) < D('1.10')]
            elif yield_performance == 'below':
                records = [r for r in records if (_ratio(r) is not None) and _ratio(r) < D('0.90')]
        headers = [
            'Barangay', 'Farmer', 'Organization',
            'Crop', 'Area Planted (ha)', 'Area Harvested (ha)',
            'Est. Harvest Date', 'Actual Harvest Date',
            'Quantity Harvested', 'Unit of Measure',
        ]

        def _barangay(rec):
            if rec.farm_parcel and rec.farm_parcel.barangay:
                return fmt_field(rec.farm_parcel.barangay)
            if rec.farm_location_barangay:
                return fmt_field(rec.farm_location_barangay)
            if rec.farmers_organization:
                return fmt_field(rec.farmers_organization.barangay)
            return '—'

        def _farmer(rec):
            if rec.farm_parcel and rec.farm_parcel.farmer:
                return fmt_field(rec.farm_parcel.farmer.full_name)
            if rec.farmer:
                return fmt_field(rec.farmer.full_name)
            if rec.farmers_organization:
                return fmt_field(rec.farmers_organization.name)
            return '—'

        def _assoc(rec):
            return fmt_field(rec.farmers_organization.name) if rec.farmers_organization else '—'

        def _latest_harvest(rec):
            harvests = sorted(
                rec.harvest_records.all(),
                key=lambda h: h.date_recorded,
                reverse=True,
            )
            return harvests[0] if harvests else None

        def row_data(rec):
            harvest = _latest_harvest(rec)
            return [
                _barangay(rec),
                _farmer(rec),
                _assoc(rec),
                fmt_field(rec.crop_type.name),
                fmt_field(rec.area_planted_ha),
                fmt_field(harvest.area_harvested_hectares) if harvest else '—',
                fmt_date(rec.expected_harvest_date) if rec.expected_harvest_date else '—',
                fmt_date(rec.actual_harvest_date) if rec.actual_harvest_date else '—',
                fmt_field(harvest.volume_kg) if harvest else '—',
                fmt_field(harvest.unit_of_measure) if harvest else '—',
            ]

        if fmt == 'json':
            data = []
            for rec in records:
                harvest = _latest_harvest(rec)
                data.append({
                    'barangay': _barangay(rec),
                    'farmer': _farmer(rec),
                    'organization': _assoc(rec),
                    'crop': fmt_field(rec.crop_type.name),
                    'area_planted_ha': str(rec.area_planted_ha) if rec.area_planted_ha else '—',
                    'area_harvested_ha': str(harvest.area_harvested_hectares) if harvest else '—',
                    'expected_harvest_date': str(rec.expected_harvest_date) if rec.expected_harvest_date else '—',
                    'actual_harvest_date': str(rec.actual_harvest_date) if rec.actual_harvest_date else '—',
                    'quantity_harvested': str(harvest.volume_kg) if harvest else '—',
                    'unit_of_measure': harvest.unit_of_measure if harvest else '—',
                })
            return JsonResponse({'count': len(data), 'records': data})

        if fmt == 'pdf':
            return self._build_pdf(records, headers, row_data, today, _sig_params(request))
        return self._build_excel(records, headers, row_data, today)

    def _build_pdf(self, records, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Harvested Crop Report')
        story.append(build_stats_row([
            ('Total Records', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [50, 65, 60, 50, 38, 38, 42, 42, 42, 40]
        rows = [row_data_fn(r) for r in records]
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'harvested_crop_report_{today}.pdf')

    def _build_excel(self, records, headers, row_data_fn, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Harvested Crop Report'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Harvested Crop Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])

        ws.append(headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')

        for rec in records:
            ws.append(row_data_fn(rec))

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="harvested_crop_report_{today}.xlsx"'
        return response


# â”€â”€â”€ Organization List Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class OrganizationListReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from associations.models import FarmersOrganization, FisherfolkOrganization
        today    = _today()
        barangay = request.query_params.get('barangay', '')
        assoc_type = request.query_params.get('type', 'all')
        fmt      = request.query_params.get('format', 'excel')

        headers = ['Organization Name', 'Province', 'Municipality', 'Barangay', 'Contact Person', 'Contact Number']

        records = []
        if assoc_type in ('all', 'farmers'):
            qs = FarmersOrganization.objects.order_by('barangay', 'name')
            if barangay:
                qs = qs.filter(barangay__iexact=barangay)
            for a in qs:
                records.append([a.name, 'La Union', 'Aringay', a.barangay, a.contact_person, a.contact_number])
        if assoc_type in ('all', 'fisherfolk'):
            qs = FisherfolkOrganization.objects.order_by('barangay', 'name')
            if barangay:
                qs = qs.filter(barangay__iexact=barangay)
            for a in qs:
                records.append([a.name, 'La Union', 'Aringay', a.barangay, a.contact_person, a.contact_number])

        if fmt == 'pdf':
            return self._build_pdf(records, headers, today, _sig_params(request))
        return self._build_excel(records, headers, today)

    def _build_pdf(self, records, headers, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Organization List Report')
        story.append(build_stats_row([
            ('Total Organizations', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [120, 55, 60, 60, 100, 73]
        story.append(build_ledger_table(headers, records, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by'),
            reviewed_role=sig.get('reviewed_role'),
            noted_by=sig.get('noted_by'),
            noted_role=sig.get('noted_role'),
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'organization_list_report_{today}.pdf')

    def _build_excel(self, records, headers, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Organization List'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist â€” Aringay, La Union'])
        ws.append(['Organization List Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])
        ws.append(headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for row in records:
            ws.append(row)

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="organization_list_report_{today}.xlsx"'
        return response


# â”€â”€â”€ Crop Options Report â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class CropOptionsReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from production.models import CropType
        today       = _today()
        category_id = request.query_params.get('category_id', '')
        subcat_id   = request.query_params.get('subcategory_id', '')
        fmt         = request.query_params.get('format', 'excel')

        qs = CropType.objects.select_related('category', 'subcategory').order_by('name')
        if category_id:
            qs = qs.filter(category_id=category_id)
        if subcat_id:
            qs = qs.filter(subcategory_id=subcat_id)

        records = list(qs)
        headers = ['Crop Name', 'Category', 'Subcategory', 'Growth Duration (Days)', 'Yield per ha (kg)']

        def row_data(ct):
            return [
                ct.name,
                ct.category.name if ct.category else 'â€”',
                ct.subcategory.name if ct.subcategory else 'â€”',
                ct.days_to_harvest,
                float(ct.yield_per_ha_kg) if ct.yield_per_ha_kg else 'â€”',
            ]

        if fmt == 'pdf':
            return self._build_pdf(records, headers, row_data, today, _sig_params(request))
        return self._build_excel(records, headers, row_data, today)

    def _build_pdf(self, records, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Crop Options Report')
        story.append(build_stats_row([
            ('Total Crops', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [100, 95, 95, 88, 90]
        rows = [row_data_fn(r) for r in records]
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by'),
            reviewed_role=sig.get('reviewed_role'),
            noted_by=sig.get('noted_by'),
            noted_role=sig.get('noted_role'),
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'crop_options_report_{today}.pdf')

    def _build_excel(self, records, headers, row_data_fn, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Crop Options'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist â€” Aringay, La Union'])
        ws.append(['Crop Options Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])
        ws.append(headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for rec in records:
            ws.append(row_data_fn(rec))

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="crop_options_report_{today}.xlsx"'
        return response


# ─── Fisheries Production Report ─────────────────────────────────────────────

class FisheriesProductionReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.http import JsonResponse
        from fisheries.models import FisheriesHarvestRecord

        today        = _today()
        start_date   = request.query_params.get('start_date', '')
        end_date     = request.query_params.get('end_date', '')
        barangay     = request.query_params.get('barangay', '')
        assoc_id     = request.query_params.get('organization', '')
        species_id   = request.query_params.get('species', '')
        culture_type = request.query_params.get('culture_type', '')
        fmt          = request.query_params.get('format', 'excel')

        qs = FisheriesHarvestRecord.objects.select_related(
            'stocking_record',
            'stocking_record__fisherfolk',
            'stocking_record__fisherfolk__fisherfolk_organization',
            'stocking_record__species',
        ).order_by('-harvest_date')

        if start_date:
            qs = qs.filter(harvest_date__gte=start_date)
        if end_date:
            qs = qs.filter(harvest_date__lte=end_date)
        if barangay:
            qs = qs.filter(stocking_record__pond_location_barangay__iexact=barangay)
        if assoc_id:
            qs = qs.filter(stocking_record__fisherfolk__fisherfolk_organization_id=assoc_id)
        if species_id:
            qs = qs.filter(stocking_record__species_id=species_id)
        if culture_type:
            qs = qs.filter(stocking_record__culture_type__iexact=culture_type)

        records = list(qs)

        headers = [
            'BARANGAY', 'FISHERFOLK', 'ORGANIZATION',
            'SPECIES', 'CULTURE TYPE',
            'DATE STOCKED', 'HARVEST DATE',
            'QUANTITY (KG)', 'FINAL?',
        ]

        def _assoc(rec):
            assoc = rec.stocking_record.fisherfolk.fisherfolk_organization if rec.stocking_record.fisherfolk else None
            return assoc.name if assoc else '—'

        def row_data(rec):
            sr  = rec.stocking_record
            ff  = sr.fisherfolk if sr else None
            return [
                fmt_field(sr.pond_location_barangay) if sr else '—',
                fmt_field(ff.full_name) if ff else '—',
                _assoc(rec),
                fmt_field(sr.species.species_name) if (sr and sr.species) else '—',
                fmt_field(sr.culture_type) if sr else '—',
                fmt_date(sr.date_stocked) if (sr and sr.date_stocked) else '—',
                fmt_date(rec.harvest_date) if rec.harvest_date else '—',
                float(rec.quantity_kg) if rec.quantity_kg else 0,
                'Yes' if rec.is_final else 'No',
            ]

        if fmt == 'json':
            data = []
            for rec in records:
                r = row_data(rec)
                data.append({
                    'barangay':     r[0], 'fisherfolk':   r[1], 'organization': r[2],
                    'species':      r[3], 'culture_type': r[4],
                    'date_stocked': r[5], 'harvest_date': r[6],
                    'quantity_kg':  r[7], 'is_final':     r[8],
                })
            return JsonResponse({'count': len(data), 'records': data})

        if fmt == 'pdf':
            return self._build_pdf(records, headers, row_data, today, _sig_params(request))
        return self._build_excel(records, headers, row_data, today)

    def _build_pdf(self, records, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Fisheries Production Report')
        story.append(build_stats_row([
            ('Total Harvest Records', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [55, 65, 55, 55, 40, 45, 45, 48, 30]
        rows = [row_data_fn(r) for r in records]
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'fisheries_production_report_{today}.pdf')

    def _build_excel(self, records, headers, row_data_fn, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Fisheries Production'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Fisheries Production Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])
        ws.append(headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for rec in records:
            ws.append(row_data_fn(rec))

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="fisheries_production_report_{today}.xlsx"'
        return response


# ─── Farmer Crop History Report ──────────────────────────────────────────────

class FarmerCropHistoryReport(APIView):
    # A farmer account gets its own crop history only: the `farmer` filter is forced to them.
    permission_classes = [IsAuthenticated, IsStaffOrFarmer]

    def get(self, request):
        from django.http import JsonResponse
        from production.models import CropMonitoringRecord

        today = _today()

        own_farmer = farmer_scope(request.user)
        farmer_id = str(own_farmer) if own_farmer is not None else request.query_params.get('farmer', '')
        crop_type = request.query_params.get('crop_type', '')
        barangay  = request.query_params.get('barangay', '')
        season    = request.query_params.get('season', '')
        year      = request.query_params.get('year', '')
        fmt       = request.query_params.get('format', 'excel')

        qs = CropMonitoringRecord.objects.select_related(
            'farmer', 'crop_type',
        ).only(
            'id', 'status', 'farm_location_barangay', 'date_planted', 'expected_harvest_date',
            'actual_harvest_date', 'land_status', 'variety_used', 'yield_variance_pct', 'season', 'year',
            'farmer_id', 'crop_type_id',
            'farmer__id', 'farmer__first_name', 'farmer__middle_name', 'farmer__last_name', 'farmer__barangay',
            'crop_type__id', 'crop_type__name',
        ).prefetch_related('activity_logs', 'harvest_records').order_by('-date_planted', 'id')

        if farmer_id:
            qs = qs.filter(farmer_id=farmer_id)
        if crop_type:
            qs = qs.filter(crop_type_id=crop_type)
        if barangay:
            qs = qs.filter(farm_location_barangay__iexact=barangay)
        if season:
            qs = qs.filter(season=season)
        if year:
            qs = qs.filter(year=year)

        records = list(qs)

        def _farmer_name(rec):
            return fmt_field(rec.farmer.full_name) if rec.farmer else '—'

        def _barangay(rec):
            if rec.farm_location_barangay:
                return fmt_field(rec.farm_location_barangay)
            return fmt_field(rec.farmer.barangay) if rec.farmer else '—'

        def _activities(rec):
            return sorted(rec.activity_logs.all(), key=lambda l: l.date_of_activity)

        def _harvests(rec):
            return sorted(
                rec.harvest_records.all(),
                key=lambda h: h.harvest_start_date or h.date_recorded.date(),
            )

        def _timeline_text(rec):
            logs = _activities(rec)
            if not logs:
                return '—'
            return '; '.join(
                f'Act {i + 1}: {l.activity_type} ({fmt_date(l.date_of_activity)})'
                for i, l in enumerate(logs)
            )

        def _harvest_text(rec):
            harvests = _harvests(rec)
            if not harvests:
                return '—'
            parts = []
            for h in harvests:
                d = fmt_date(h.harvest_start_date) if h.harvest_start_date else '—'
                if h.harvest_end_date and h.harvest_end_date != h.harvest_start_date:
                    d += f' to {fmt_date(h.harvest_end_date)}'
                parts.append(f'{d}: {fmt_field(h.volume_kg)} {h.unit_of_measure or "kg"}')
            return '; '.join(parts)

        def row_data(rec):
            logs     = _activities(rec)
            harvests = _harvests(rec)
            return [
                _farmer_name(rec),
                _barangay(rec),
                fmt_field(rec.crop_type.name),
                fmt_field(rec.variety_used) if rec.variety_used else '—',
                fmt_date(rec.date_planted),
                rec.status,
                len(logs),
                fmt_date(logs[0].date_of_activity) if logs else '—',
                fmt_date(logs[-1].date_of_activity) if logs else '—',
                len(harvests),
            ]

        headers = [
            'Farmer', 'Barangay', 'Crop', 'Variety', 'Date Planted', 'Status',
            '# Act', 'First Activity', 'Last Activity', '# Harvests',
        ]

        if fmt == 'json':
            data = []
            for rec in records:
                logs     = _activities(rec)
                harvests = _harvests(rec)
                data.append({
                    'id': rec.id,
                    'farmer': _farmer_name(rec),
                    'barangay': _barangay(rec),
                    'crop_type': fmt_field(rec.crop_type.name),
                    'variety': rec.variety_used or '—',
                    'land_status': rec.land_status or '—',
                    'date_planted': str(rec.date_planted),
                    'expected_harvest_date': str(rec.expected_harvest_date) if rec.expected_harvest_date else None,
                    'actual_harvest_date': str(rec.actual_harvest_date) if rec.actual_harvest_date else None,
                    'status': rec.status,
                    'is_total_loss': rec.status == 'Total Loss',
                    # Variance vs. the crop's own planting-time estimate — only
                    # meaningful once harvested. Reuses the model's stored
                    # yield_variance_pct (computed on save); the grouped
                    # forecasting view shows "In progress"/"Total Loss" when null.
                    'variance_pct': float(rec.yield_variance_pct) if rec.yield_variance_pct is not None else None,
                    'activities': [
                        {
                            'label': f'Act {i + 1}',
                            'activity_type': l.activity_type,
                            'date': str(l.date_of_activity),
                        }
                        for i, l in enumerate(logs)
                    ],
                    'activity_count': len(logs),
                    'first_activity_date': str(logs[0].date_of_activity) if logs else None,
                    'last_activity_date': str(logs[-1].date_of_activity) if logs else None,
                    'harvests': [
                        {
                            'harvest_start_date': str(h.harvest_start_date) if h.harvest_start_date else None,
                            'harvest_end_date': str(h.harvest_end_date) if h.harvest_end_date else None,
                            'volume_kg': str(h.volume_kg),
                            'unit_of_measure': h.unit_of_measure,
                        }
                        for h in harvests
                    ],
                    'harvest_count': len(harvests),
                })

            summary = {
                'total_crops': len(records),
                'total_harvests': sum(len(_harvests(r)) for r in records),
            }
            if farmer_id and records:
                summary['farmer_total_activities']  = sum(len(_activities(r)) for r in records)
                summary['farmer_crops_harvested']   = len([r for r in records if r.status == 'Harvested'])

            return JsonResponse({'count': len(data), 'records': data, 'summary': summary})

        if fmt == 'pdf':
            return self._build_pdf(records, headers, row_data, today, _sig_params(request))
        return self._build_excel(records, headers, row_data, today, _timeline_text, _harvest_text)

    def _build_pdf(self, records, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Farmer Crop History Report')
        story.append(build_stats_row([
            ('Total Crop Records', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [65, 50, 55, 45, 45, 45, 28, 45, 45, 45]
        rows = [row_data_fn(r) for r in records]
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'farmer_crop_history_report_{today}.pdf')

    def _build_excel(self, records, headers, row_data_fn, today, timeline_fn, harvest_fn):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Farmer Crop History'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Farmer Crop History Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])

        full_headers = headers + ['Activity Timeline', 'Harvest Details']
        ws.append(full_headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')

        for rec in records:
            ws.append(row_data_fn(rec) + [timeline_fn(rec), harvest_fn(rec)])

        for col_letter in ('K', 'L'):
            ws.column_dimensions[col_letter].width = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="farmer_crop_history_report_{today}.xlsx"'
        return response


class FisherfolkStockingHistoryReport(APIView):
    """Mirrors FarmerCropHistoryReport above exactly, sourced from
    fisheries StockingRecord instead of CropMonitoringRecord. See
    docs/superpowers/specs/2026-09-19-fisheries-harvest-split-and-history-report-design.md."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.http import JsonResponse
        from fisheries.models import StockingRecord

        today = _today()

        fisherfolk_id = request.query_params.get('fisherfolk', '')
        species       = request.query_params.get('species', '')
        barangay      = request.query_params.get('barangay', '')
        season        = request.query_params.get('season', '')
        year          = request.query_params.get('year', '')
        fmt           = request.query_params.get('format', 'excel')

        qs = StockingRecord.objects.select_related(
            'fisherfolk', 'species',
        ).prefetch_related('logs', 'harvests').order_by('-date_stocked')

        if fisherfolk_id:
            qs = qs.filter(fisherfolk_id=fisherfolk_id)
        if species:
            qs = qs.filter(species_id=species)
        if barangay:
            qs = qs.filter(pond_location_barangay__iexact=barangay)
        if season:
            qs = qs.filter(season=season)
        if year:
            qs = qs.filter(year=year)

        records = list(qs)

        def _fisherfolk_name(rec):
            return fmt_field(rec.fisherfolk.full_name) if rec.fisherfolk else '—'

        def _barangay(rec):
            if rec.pond_location_barangay:
                return fmt_field(rec.pond_location_barangay)
            return fmt_field(rec.fisherfolk.barangay) if rec.fisherfolk else '—'

        def _activities(rec):
            return sorted(rec.logs.all(), key=lambda l: l.date_of_activity)

        def _harvests(rec):
            return sorted(
                rec.harvests.all(),
                key=lambda h: h.harvest_date or h.date_recorded.date(),
            )

        def _timeline_text(rec):
            logs = _activities(rec)
            if not logs:
                return '—'
            return '; '.join(
                f'Act {i + 1}: {l.activity} ({fmt_date(l.date_of_activity)})'
                for i, l in enumerate(logs)
            )

        def _harvest_text(rec):
            harvests = _harvests(rec)
            if not harvests:
                return '—'
            parts = []
            for h in harvests:
                d = fmt_date(h.harvest_date) if h.harvest_date else '—'
                parts.append(f'{d}: {fmt_field(h.quantity_kg)} kg')
            return '; '.join(parts)

        def row_data(rec):
            logs     = _activities(rec)
            harvests = _harvests(rec)
            return [
                _fisherfolk_name(rec),
                _barangay(rec),
                fmt_field(rec.species.species_name),
                fmt_field(rec.culture_type) if rec.culture_type else '—',
                fmt_date(rec.date_stocked),
                rec.status,
                len(logs),
                fmt_date(logs[0].date_of_activity) if logs else '—',
                fmt_date(logs[-1].date_of_activity) if logs else '—',
                len(harvests),
            ]

        headers = [
            'Fisherfolk', 'Barangay', 'Species', 'Culture Type', 'Date Stocked', 'Status',
            '# Act', 'First Activity', 'Last Activity', '# Harvests',
        ]

        if fmt == 'json':
            data = []
            for rec in records:
                logs     = _activities(rec)
                harvests = _harvests(rec)
                data.append({
                    'id': rec.id,
                    'fisherfolk': _fisherfolk_name(rec),
                    'barangay': _barangay(rec),
                    'species': fmt_field(rec.species.species_name),
                    'culture_type': rec.culture_type or '—',
                    'land_status': rec.land_status or '—',
                    'date_stocked': str(rec.date_stocked),
                    'expected_harvest_date': str(rec.expected_harvest_date) if rec.expected_harvest_date else None,
                    'status': rec.status,
                    'is_total_loss': rec.status == 'Total Loss',
                    'activities': [
                        {
                            'label': f'Act {i + 1}',
                            'activity_type': l.activity,
                            'date': str(l.date_of_activity),
                        }
                        for i, l in enumerate(logs)
                    ],
                    'activity_count': len(logs),
                    'first_activity_date': str(logs[0].date_of_activity) if logs else None,
                    'last_activity_date': str(logs[-1].date_of_activity) if logs else None,
                    'harvests': [
                        {
                            'harvest_start_date': str(h.harvest_date) if h.harvest_date else None,
                            'harvest_end_date': None,
                            'volume_kg': str(h.quantity_kg),
                            'unit_of_measure': 'kg',
                        }
                        for h in harvests
                    ],
                    'harvest_count': len(harvests),
                })

            summary = {
                'total_stockings': len(records),
                'total_harvests': sum(len(_harvests(r)) for r in records),
            }
            if fisherfolk_id and records:
                summary['fisherfolk_total_activities']    = sum(len(_activities(r)) for r in records)
                summary['fisherfolk_stockings_harvested'] = len([r for r in records if r.status == 'Harvested'])

            return JsonResponse({'count': len(data), 'records': data, 'summary': summary})

        if fmt == 'pdf':
            return self._build_pdf(records, headers, row_data, today, _sig_params(request))
        return self._build_excel(records, headers, row_data, today, _timeline_text, _harvest_text)

    def _build_pdf(self, records, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Fisherfolk Stocking History Report')
        story.append(build_stats_row([
            ('Total Stocking Records', len(records)),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))
        col_widths = [65, 50, 55, 45, 45, 45, 28, 45, 45, 45]
        rows = [row_data_fn(r) for r in records]
        story.append(build_ledger_table(headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'fisherfolk_stocking_history_report_{today}.pdf')

    def _build_excel(self, records, headers, row_data_fn, today, timeline_fn, harvest_fn):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Fisherfolk Stocking History'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Fisherfolk Stocking History Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])

        full_headers = headers + ['Activity Timeline', 'Harvest Details']
        ws.append(full_headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')

        for rec in records:
            ws.append(row_data_fn(rec) + [timeline_fn(rec), harvest_fn(rec)])

        for col_letter in ('K', 'L'):
            ws.column_dimensions[col_letter].width = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="fisherfolk_stocking_history_report_{today}.xlsx"'
        return response


# ─── Yield Analysis Report (descriptive harvest-performance analysis) ───────
#
# Exports the same descriptive comparison shown on the Forecasting page's
# "Yield Analysis" tab: each harvested crop's actual total vs. its own
# planting-time estimate, plus which scheduled activities were completed.
# Missed high-priority activities are reported as possible contributing
# factors only — this report never states or implies causation.

class YieldAnalysisReport(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.http import JsonResponse
        from production.views import (
            YIELD_ANALYSIS_DISCLAIMER,
            _analyze_crop,
            _stages_by_crop,
            _yield_analysis_queryset,
        )

        today = _today()
        fmt = request.query_params.get('format', 'excel')
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'crop_type'):
            group_by = 'barangay'

        records = list(_yield_analysis_queryset(request))
        stages = _stages_by_crop(records)
        analyzed = [_analyze_crop(rec, stages) for rec in records]

        groups = {}
        for a in analyzed:
            key = a['crop_type'] if group_by == 'crop_type' else a['barangay']
            g = groups.setdefault(key, new_yield_group())
            accumulate_yield_group(g, a)

        agg_headers = [
            group_by.replace('_', ' ').upper(), 'CROPS', 'TOTAL LOSS',
            'AVG EST. (KG)', 'AVG ACTUAL (KG)', 'AVG VARIANCE %', 'AVG COMPLETION %',
        ]
        agg_rows = []
        for key in sorted(groups.keys()):
            g = groups[key]
            agg_rows.append([
                key,
                g['count'],
                g['total_loss_count'],
                round(float(g['estimated_sum'] / g['estimated_n']), 2) if g['estimated_n'] else '—',
                round(float(g['actual_sum'] / g['count']), 2) if g['count'] else '—',
                round(g['variance_pct_sum'] / g['variance_pct_n'], 2) if g['variance_pct_n'] else '—',
                round(g['completion_pct_sum'] / g['completion_pct_n'], 2) if g['completion_pct_n'] else '—',
            ])

        detail_headers = [
            'Crop', 'Farmer', 'Barangay', 'Est. (kg)', 'Actual (kg)',
            'Variance %', 'Activities', 'Possible Factors',
        ]

        def detail_row(a):
            return [
                a['crop_type'],
                a['farmer'],
                a['barangay'],
                a['estimated_kg'] if a['estimated_kg'] is not None else '—',
                a['actual_total_kg'],
                f"{a['variance_pct']:+.2f}%" if a['variance_pct'] is not None else '—',
                f"{a['activities_completed_count']}/{a['activities_total_count']}",
                possible_factors_text(
                    a['variance_pct'], a['missed_high_priority'],
                    a['activities_completed_count'], a['activities_total_count'],
                    domain='crop',
                ),
            ]

        overall_variance   = [a['variance_pct'] for a in analyzed if a['variance_pct'] is not None and not a['is_total_loss']]
        overall_completion = [
            (a['activities_completed_count'] / a['activities_total_count']) * 100
            for a in analyzed if a['activities_total_count'] > 0
        ]
        avg_variance_pct   = round(sum(overall_variance) / len(overall_variance), 2) if overall_variance else None
        avg_completion_pct = round(sum(overall_completion) / len(overall_completion), 2) if overall_completion else None
        overall_total_loss_count = sum(1 for a in analyzed if a['is_total_loss'])

        if fmt == 'json':
            return JsonResponse({
                'count': len(analyzed),
                'records': analyzed,
                'groups': [
                    {
                        'group': row[0], 'harvested_crop_count': row[1], 'total_loss_count': row[2],
                        'avg_estimated_kg': row[3], 'avg_actual_kg': row[4],
                        'avg_variance_pct': row[5], 'avg_activity_completion_pct': row[6],
                    }
                    for row in agg_rows
                ],
                'overall': {
                    'harvested_crop_count': len(analyzed),
                    'total_loss_count': overall_total_loss_count,
                    'avg_variance_pct': avg_variance_pct,
                    'avg_activity_completion_pct': avg_completion_pct,
                },
                'disclaimer': YIELD_ANALYSIS_DISCLAIMER,
            })

        if fmt == 'pdf':
            return self._build_pdf(
                analyzed, agg_headers, agg_rows, detail_headers, detail_row,
                avg_variance_pct, avg_completion_pct, overall_total_loss_count, today, _sig_params(request),
            )
        return self._build_excel(
            analyzed, agg_headers, agg_rows, detail_headers, detail_row,
            avg_variance_pct, avg_completion_pct, overall_total_loss_count, today,
        )

    def _build_pdf(self, analyzed, agg_headers, agg_rows, detail_headers, detail_row_fn,
                    avg_variance_pct, avg_completion_pct, total_loss_count, today, sig=None):
        from production.views import YIELD_ANALYSIS_DISCLAIMER

        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Yield Analysis Report', 'Descriptive Harvest-Performance Analysis')
        story.append(_empty_state(YIELD_ANALYSIS_DISCLAIMER))
        story.append(Spacer(1, 10))
        avg_variance_label = f'{avg_variance_pct:+.2f}%' if avg_variance_pct is not None else 'N/A'
        if total_loss_count:
            avg_variance_label += f' (excl. {total_loss_count} total loss)'
        story.append(build_stats_row([
            ('Harvested Crops', len(analyzed)),
            ('Avg Variance', avg_variance_label),
            ('Avg Activity Completion', f'{avg_completion_pct:.2f}%' if avg_completion_pct is not None else 'N/A'),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))

        story += build_section_heading('I', 'Aggregate Summary')
        agg_col_widths = [100, 42, 50, 74, 74, 64, 64]
        story.append(build_ledger_table(agg_headers, agg_rows, col_widths=agg_col_widths))

        story += build_section_heading('II', 'Per-Crop Detail')
        detail_col_widths = [60, 65, 55, 50, 50, 45, 45, 98]
        detail_rows = [detail_row_fn(a) for a in analyzed]
        story.append(build_ledger_table(detail_headers, detail_rows, col_widths=detail_col_widths))

        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'yield_analysis_report_{today}.pdf')

    def _build_excel(self, analyzed, agg_headers, agg_rows, detail_headers, detail_row_fn,
                      avg_variance_pct, avg_completion_pct, total_loss_count, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from production.views import YIELD_ANALYSIS_DISCLAIMER

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Yield Analysis'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)
        disclaimer_font = Font(italic=True, color='475569', size=9)

        avg_variance_label = f'{avg_variance_pct:+.2f}%' if avg_variance_pct is not None else 'N/A'
        if total_loss_count:
            avg_variance_label += f' (excl. {total_loss_count} total loss)'

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Yield Analysis Report (Descriptive Harvest-Performance Analysis)'])
        ws.append([f'Date Generated: {today}'])
        ws.append([YIELD_ANALYSIS_DISCLAIMER])
        ws['A5'].font = disclaimer_font
        ws.merge_cells('A5:H5')
        ws.append([])
        ws.append([
            f'Harvested Crops: {len(analyzed)}',
            f'Avg Variance: {avg_variance_label}',
            f"Avg Activity Completion: {f'{avg_completion_pct:.2f}%' if avg_completion_pct is not None else 'N/A'}",
        ])
        ws.append([])

        ws.append(['Aggregate Summary'])
        ws.append(agg_headers)
        hdr_row = ws.max_row
        for cell in ws[hdr_row]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for row in agg_rows:
            ws.append(row)
        ws.append([])

        ws.append(['Per-Crop Detail'])
        ws.append(detail_headers)
        hdr_row = ws.max_row
        for cell in ws[hdr_row]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for a in analyzed:
            ws.append(detail_row_fn(a))
        ws.column_dimensions['H'].width = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="yield_analysis_report_{today}.xlsx"'
        return response


class FisheriesYieldAnalysisReport(APIView):
    """Mirrors YieldAnalysisReport above, sourced from fisheries.views'
    stocking-record yield analysis instead of crop monitoring records.
    A fisherfolk citizen may download it too: _fisheries_yield_analysis_queryset() limits a CITIZEN to
    their own stocking records, so their report only contains their own data."""
    permission_classes = [IsAuthenticated, IsStaffOrFisherfolk]

    def get(self, request):
        from django.http import JsonResponse
        from fisheries.views import (
            FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
            _analyze_stocking,
            _cycle_trend_note,
            _fisheries_yield_analysis_queryset,
        )

        today = _today()
        fmt = request.query_params.get('format', 'excel')
        group_by = request.query_params.get('group_by', 'barangay')
        if group_by not in ('barangay', 'species'):
            group_by = 'barangay'

        records = list(_fisheries_yield_analysis_queryset(request))
        analyzed = [_analyze_stocking(rec) for rec in records]

        groups = {}
        for a in analyzed:
            key = a['species'] if group_by == 'species' else a['barangay']
            g = groups.setdefault(key, new_yield_group())
            accumulate_yield_group(g, a)

        agg_headers = [
            group_by.upper(), 'STOCKINGS', 'TOTAL LOSS',
            'AVG EST. (KG)', 'AVG ACTUAL (KG)', 'AVG VARIANCE %', 'AVG COMPLETION %',
        ]
        agg_rows = []
        for key in sorted(groups.keys()):
            g = groups[key]
            agg_rows.append([
                key,
                g['count'],
                g['total_loss_count'],
                round(float(g['estimated_sum'] / g['estimated_n']), 2) if g['estimated_n'] else '—',
                round(float(g['actual_sum'] / g['count']), 2) if g['count'] else '—',
                round(g['variance_pct_sum'] / g['variance_pct_n'], 2) if g['variance_pct_n'] else '—',
                round(g['completion_pct_sum'] / g['completion_pct_n'], 2) if g['completion_pct_n'] else '—',
            ])

        detail_headers = [
            'Species', 'Fisherfolk', 'Barangay', 'Culture Type', 'Cycle #',
            'Est. (kg)', 'Actual (kg)', 'Variance %', 'Activities', 'Possible Factors',
        ]

        def detail_row(a):
            return [
                a['species'],
                a['fisherfolk'],
                a['barangay'],
                a['culture_type'],
                a['production_cycle_no'],
                a['estimated_kg'] if a['estimated_kg'] is not None else '—',
                a['actual_total_kg'],
                f"{a['variance_pct']:+.2f}%" if a['variance_pct'] is not None else '—',
                f"{a['activities_completed_count']}/{a['activities_total_count']}",
                possible_factors_text(
                    a['variance_pct'], a['missed_high_priority'],
                    a['activities_completed_count'], a['activities_total_count'],
                    domain='fisheries',
                ),
            ]

        overall_variance   = [a['variance_pct'] for a in analyzed if a['variance_pct'] is not None and not a['is_total_loss']]
        overall_completion = [
            (a['activities_completed_count'] / a['activities_total_count']) * 100
            for a in analyzed if a['activities_total_count'] > 0
        ]
        avg_variance_pct   = round(sum(overall_variance) / len(overall_variance), 2) if overall_variance else None
        avg_completion_pct = round(sum(overall_completion) / len(overall_completion), 2) if overall_completion else None
        cycle_trend = _cycle_trend_note(analyzed)
        overall_total_loss_count = sum(1 for a in analyzed if a['is_total_loss'])

        if fmt == 'json':
            return JsonResponse({
                'count': len(analyzed),
                'records': analyzed,
                'groups': [
                    {
                        'group': row[0], 'stocking_count': row[1], 'total_loss_count': row[2],
                        'avg_estimated_kg': row[3], 'avg_actual_kg': row[4],
                        'avg_variance_pct': row[5], 'avg_activity_completion_pct': row[6],
                    }
                    for row in agg_rows
                ],
                'overall': {
                    'stocking_count': len(analyzed),
                    'total_loss_count': overall_total_loss_count,
                    'avg_variance_pct': avg_variance_pct,
                    'avg_activity_completion_pct': avg_completion_pct,
                },
                'cycle_trend': cycle_trend,
                'disclaimer': FISHERIES_YIELD_ANALYSIS_DISCLAIMER,
            })

        if fmt == 'pdf':
            return self._build_pdf(
                analyzed, agg_headers, agg_rows, detail_headers, detail_row,
                avg_variance_pct, avg_completion_pct, overall_total_loss_count, cycle_trend, today, _sig_params(request),
            )
        return self._build_excel(
            analyzed, agg_headers, agg_rows, detail_headers, detail_row,
            avg_variance_pct, avg_completion_pct, overall_total_loss_count, cycle_trend, today,
        )

    def _build_pdf(self, analyzed, agg_headers, agg_rows, detail_headers, detail_row_fn,
                    avg_variance_pct, avg_completion_pct, total_loss_count, cycle_trend, today, sig=None):
        from fisheries.views import FISHERIES_YIELD_ANALYSIS_DISCLAIMER

        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'Fisheries Yield Analysis Report', 'Descriptive Harvest-Performance Analysis')
        story.append(_empty_state(FISHERIES_YIELD_ANALYSIS_DISCLAIMER))
        story.append(Spacer(1, 10))
        avg_variance_label = f'{avg_variance_pct:+.2f}%' if avg_variance_pct is not None else 'N/A'
        if total_loss_count:
            avg_variance_label += f' (excl. {total_loss_count} total loss)'
        story.append(build_stats_row([
            ('Stockings', len(analyzed)),
            ('Avg Variance', avg_variance_label),
            ('Avg Activity Completion', f'{avg_completion_pct:.2f}%' if avg_completion_pct is not None else 'N/A'),
            ('Date Generated', str(today)),
        ], page_width=PAGE_WIDTH))

        story += build_section_heading('I', 'Aggregate Summary')
        agg_col_widths = [100, 42, 50, 74, 74, 64, 64]
        story.append(build_ledger_table(agg_headers, agg_rows, col_widths=agg_col_widths))

        if cycle_trend:
            story += build_section_heading('II', 'Cycle Trend (Repeat Stockings)')
            cycle_rows = [[c['cycle'], c['stocking_count'], f"{c['avg_variance_pct']:+.2f}%"] for c in cycle_trend]
            story.append(build_ledger_table(['CYCLE #', 'STOCKINGS', 'AVG VARIANCE %'], cycle_rows, col_widths=[150, 150, 168]))
            section_no = 'III'
        else:
            section_no = 'II'

        story += build_section_heading(section_no, 'Per-Stocking Detail')
        detail_col_widths = [50, 55, 45, 45, 35, 45, 45, 40, 40, 68]
        detail_rows = [detail_row_fn(a) for a in analyzed]
        story.append(build_ledger_table(detail_headers, detail_rows, col_widths=detail_col_widths))

        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'fisheries_yield_analysis_report_{today}.pdf')

    def _build_excel(self, analyzed, agg_headers, agg_rows, detail_headers, detail_row_fn,
                      avg_variance_pct, avg_completion_pct, total_loss_count, cycle_trend, today):
        import openpyxl
        from openpyxl.styles import Font, PatternFill, Alignment
        from fisheries.views import FISHERIES_YIELD_ANALYSIS_DISCLAIMER

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'Fisheries Yield Analysis'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)
        disclaimer_font = Font(italic=True, color='475569', size=9)

        avg_variance_label = f'{avg_variance_pct:+.2f}%' if avg_variance_pct is not None else 'N/A'
        if total_loss_count:
            avg_variance_label += f' (excl. {total_loss_count} total loss)'

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['Fisheries Yield Analysis Report (Descriptive Harvest-Performance Analysis)'])
        ws.append([f'Date Generated: {today}'])
        ws.append([FISHERIES_YIELD_ANALYSIS_DISCLAIMER])
        ws['A5'].font = disclaimer_font
        ws.merge_cells('A5:J5')
        ws.append([])
        ws.append([
            f'Stockings: {len(analyzed)}',
            f'Avg Variance: {avg_variance_label}',
            f"Avg Activity Completion: {f'{avg_completion_pct:.2f}%' if avg_completion_pct is not None else 'N/A'}",
        ])
        ws.append([])

        ws.append(['Aggregate Summary'])
        ws.append(agg_headers)
        hdr_row = ws.max_row
        for cell in ws[hdr_row]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for row in agg_rows:
            ws.append(row)
        ws.append([])

        if cycle_trend:
            ws.append(['Cycle Trend (Repeat Stockings)'])
            ws.append(['CYCLE #', 'STOCKINGS', 'AVG VARIANCE %'])
            hdr_row = ws.max_row
            for cell in ws[hdr_row]:
                cell.fill = hdr_fill
                cell.font = hdr_font
                cell.alignment = Alignment(horizontal='center')
            for c in cycle_trend:
                ws.append([c['cycle'], c['stocking_count'], f"{c['avg_variance_pct']:+.2f}%"])
            ws.append([])

        ws.append(['Per-Stocking Detail'])
        ws.append(detail_headers)
        hdr_row = ws.max_row
        for cell in ws[hdr_row]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')
        for a in analyzed:
            ws.append(detail_row_fn(a))
        ws.column_dimensions['J'].width = 60

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="fisheries_yield_analysis_report_{today}.xlsx"'
        return response


# ─── On-Behalf-Of Confirmations Report ───────────────────────────────────────
# Accountless-beneficiary on-behalf-of confirmation (Piece 3) — printable/
# exportable record of every BeneficiaryConfirmationRequest /
# FisherfolkBeneficiaryConfirmationRequest, reusing pdf_utils.py's building
# blocks exactly, same as every other report here.
#
# MERGED across both domains into ONE report, deliberately NOT split like
# most other reports (HarvestedCropReport vs FisheriesProductionReport,
# FarmerCropHistoryReport vs FisherfolkStockingHistoryReport). Those splits
# exist because each domain's own report needs real domain-specific columns
# (species/culture type vs crop type/variety) and carries real volume. This
# record type has neither: its columns are the same shape in both domains
# (organization / beneficiary / assistance / dates / deciding admin /
# status), and it is inherently low-volume — a compliance reviewer wants ONE
# list to review, not two mostly-empty tabs. A "Type" column distinguishes
# rows instead, matching how the admin dashboard's own approval queue
# (Piece 2, StaffDashboard.jsx) already merges these two models into one
# panel for the identical reason.
#
# Filters use date_from/date_to — auditlog/views.py's own real date-RANGE
# convention (parse_date + __gte/__lte), not the year/season discrete
# filters FisherfolkStockingHistoryReport/FarmerCropHistoryReport use. Those
# two exist for planting/stocking CYCLES, which genuinely align to a
# season/year. This record type is a chronological log of discrete decision
# events (submitted_at/reviewed_at) — much closer in shape to the audit log
# than to a growing cycle — so its real date-range filter is reused here
# instead of forcing year/season onto data that doesn't have a season.


def _photo_thumbnail(photo_field, max_dim=42):
    """
    reportlab Image flowable for an uploaded confirmation photo, sized to
    fit within a max_dim x max_dim box with the source's REAL aspect ratio
    preserved — unlike build_official_header's fixed-size logo Image (a
    known-good 64x64 square asset), an uploaded photo can be any aspect
    ratio, and forcing width=height on a non-square photo would visibly
    distort it. Returns None (renders as 'N/A' via build_ledger_table's own
    fmt_field fallback) when there's no photo, or the file can't actually be
    opened — same defensive try/except precedent build_official_header's
    own logo handling already uses for a missing/corrupt file.
    """
    if not photo_field:
        return None
    try:
        from PIL import Image as PILImage
        path = photo_field.path
        with PILImage.open(path) as im:
            w, h = im.size
        if w >= h:
            draw_w, draw_h = max_dim, max_dim * h / w
        else:
            draw_w, draw_h = max_dim * w / h, max_dim
        return Image(path, width=draw_w, height=draw_h)
    except Exception:
        return None


class BeneficiaryConfirmationReport(APIView):
    """See this module's own comment block above for why this report is
    merged across both domains and uses a date_from/date_to range filter."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        from django.http import JsonResponse

        today = _today()
        date_from     = request.query_params.get('date_from', '')
        date_to       = request.query_params.get('date_to', '')
        status_filter = request.query_params.get('status', '')
        record_type   = request.query_params.get('type', '')  # 'farmer' | 'fisherfolk' | ''
        fmt           = request.query_params.get('format', 'excel')

        farmer_qs = BeneficiaryConfirmationRequest.objects.select_related(
            'beneficiary_record__farmer', 'submitted_by_organization', 'reviewed_by',
        ).prefetch_related('photos').order_by('-submitted_at')
        ff_qs = FisherfolkBeneficiaryConfirmationRequest.objects.select_related(
            'beneficiary_record__fisherfolk', 'submitted_by_organization', 'reviewed_by',
        ).prefetch_related('photos').order_by('-submitted_at')

        # date_from/date_to compare against explicit local-midnight UTC-aware
        # bounds (core.utils.day_range_bounds) rather than using
        # submitted_at__date__gte/lte. That __date lookup compiles to
        # MySQL's CONVERT_TZ(...) under USE_TZ=True + a named TIME_ZONE
        # (Asia/Manila) — found, while live-testing this filter, to
        # silently match ZERO rows on this database: mysql.time_zone_name
        # has no rows loaded (a real, pre-existing environment gap; see
        # auditlog/views.py, which had the identical bug and was fixed the
        # same way). day_range_bounds() sidesteps CONVERT_TZ entirely by
        # comparing plain datetimes.
        if date_from:
            start = day_range_bounds(date_from)
            if start:
                farmer_qs = farmer_qs.filter(submitted_at__gte=start)
                ff_qs = ff_qs.filter(submitted_at__gte=start)
        if date_to:
            end = day_range_bounds(date_to, end_of_day=True)
            if end:
                farmer_qs = farmer_qs.filter(submitted_at__lte=end)
                ff_qs = ff_qs.filter(submitted_at__lte=end)
        if status_filter:
            farmer_qs = farmer_qs.filter(status=status_filter)
            ff_qs = ff_qs.filter(status=status_filter)
        if record_type == 'farmer':
            ff_qs = ff_qs.none()
        elif record_type == 'fisherfolk':
            farmer_qs = farmer_qs.none()

        entries = (
            [{'type': 'Farmers Org', 'req': r, 'beneficiary_name': r.beneficiary_record.farmer.full_name} for r in farmer_qs]
            + [{'type': 'Fisherfolk Org', 'req': r, 'beneficiary_name': r.beneficiary_record.fisherfolk.full_name} for r in ff_qs]
        )
        entries.sort(key=lambda e: e['req'].submitted_at, reverse=True)

        def row_data(e):
            r = e['req']
            return [
                e['type'],
                fmt_field(r.submitted_by_organization.name),
                fmt_field(e['beneficiary_name']),
                fmt_field(r.beneficiary_record.assistance_type),
                fmt_field(r.beneficiary_record.quantity),
                r.submitted_at.strftime('%b %d, %Y'),
                r.reviewed_at.strftime('%b %d, %Y') if r.reviewed_at else '—',
                fmt_field(r.reviewed_by.full_name) if r.reviewed_by else '—',
                r.status,
            ]

        headers = [
            'Type', 'Organization', 'Beneficiary', 'Assistance Type', 'Quantity',
            'Submitted Date', 'Decided Date', 'Decided By', 'Status',
        ]

        if fmt == 'json':
            data = []
            for e in entries:
                r = e['req']
                data.append({
                    'id': r.id,
                    'type': e['type'],
                    'organization': r.submitted_by_organization.name,
                    'beneficiary': e['beneficiary_name'],
                    'assistance_type': r.beneficiary_record.assistance_type or '—',
                    'quantity': r.beneficiary_record.quantity or '—',
                    'submitted_at': str(r.submitted_at.date()),
                    'reviewed_at': str(r.reviewed_at.date()) if r.reviewed_at else None,
                    'reviewed_by': r.reviewed_by.full_name if r.reviewed_by else None,
                    'status': r.status,
                    'rejection_reason': r.rejection_reason,
                    'has_photo': bool(r.first_photo),
                })
            summary = {
                'total': len(entries),
                'pending': sum(1 for e in entries if e['req'].status == 'PENDING'),
                'approved': sum(1 for e in entries if e['req'].status == 'APPROVED'),
                'rejected': sum(1 for e in entries if e['req'].status == 'REJECTED'),
                'with_photo': sum(1 for e in entries if e['req'].first_photo),
            }
            return JsonResponse({'count': len(data), 'records': data, 'summary': summary})

        if fmt == 'pdf':
            return self._build_pdf(entries, headers, row_data, today, _sig_params(request))
        return self._build_excel(entries, headers, row_data, today)

    def _build_pdf(self, entries, headers, row_data_fn, today, sig=None):
        sig = sig or {}
        buf, doc = _make_doc()
        story = []
        story += build_official_header(LOGO_PATH, 'On-Behalf-Of Confirmations Report')
        approved = sum(1 for e in entries if e['req'].status == 'APPROVED')
        rejected = sum(1 for e in entries if e['req'].status == 'REJECTED')
        pending = sum(1 for e in entries if e['req'].status == 'PENDING')
        story.append(build_stats_row([
            ('Total Records', len(entries)),
            ('Approved', approved),
            ('Rejected', rejected),
            ('Pending', pending),
        ], page_width=PAGE_WIDTH))
        story.append(Spacer(1, 14))

        # Photo column appended to the ledger table only here (not part of
        # the shared `headers`/row_data_fn used by json/excel) — a Flowable
        # cell, per build_ledger_table's own documented support for one.
        pdf_headers = headers + ['Photo']
        col_widths = [45, 62, 58, 52, 36, 42, 42, 42, 42, 47]
        rows = []
        for e in entries:
            r = e['req']
            photo_cell = _photo_thumbnail(r.first_photo) if r.status == 'APPROVED' else None
            rows.append(row_data_fn(e) + [photo_cell])
        story.append(build_ledger_table(pdf_headers, rows, col_widths=col_widths))
        story.append(Spacer(1, 30))
        story.append(build_signature_block(
            left_label='Prepared by',
            left_name=sig.get('prepared_by') or None,
            left_role=sig.get('position') or 'OMAg Records Officer',
            reviewed_by=sig.get('reviewed_by') or None,
            reviewed_role=sig.get('reviewed_role') or None,
            noted_by=sig.get('noted_by') or None,
            noted_role=sig.get('noted_role') or None,
            page_width=PAGE_WIDTH,
        ))
        doc.build(story, canvasmaker=NumberedCanvas)
        return _finish_pdf(buf, f'on_behalf_of_confirmations_report_{today}.pdf')

    def _build_excel(self, entries, headers, row_data_fn, today):
        import openpyxl
        from openpyxl.styles import Alignment, Font, PatternFill

        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = 'On-Behalf-Of Confirmations'

        hdr_fill = PatternFill('solid', fgColor='1E4620')
        hdr_font = Font(bold=True, color='FFFFFF', size=10)

        ws.append(['Republic of the Philippines'])
        ws.append(['Office of the Municipal Agriculturist — Aringay, La Union'])
        ws.append(['On-Behalf-Of Confirmations Report'])
        ws.append([f'Date Generated: {today}'])
        ws.append([])

        full_headers = headers + ['Photo Attached', 'Rejection Reason']
        ws.append(full_headers)
        for cell in ws[6]:
            cell.fill = hdr_fill
            cell.font = hdr_font
            cell.alignment = Alignment(horizontal='center')

        for e in entries:
            r = e['req']
            ws.append(row_data_fn(e) + ['Yes' if r.first_photo else 'No', r.rejection_reason or ''])

        ws.column_dimensions['K'].width = 50

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
        response = HttpResponse(
            buf.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )
        response['Content-Disposition'] = f'attachment; filename="on_behalf_of_confirmations_report_{today}.xlsx"'
        return response
