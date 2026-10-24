"""
OMAg Aringay — Shared PDF design system.

Every PDF in the system imports from this module so all five
downloadable documents belong to one consistent official record family.
"""
from datetime import date as date_type, datetime
from xml.sax.saxutils import escape
from decimal import Decimal

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.pdfgen import canvas as pdf_canvas

from core.constants import SYSTEM_TITLE
from reportlab.platypus import (
    HRFlowable,
    Image,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

# ─── Color tokens ─────────────────────────────────────────────────────────────

PRIMARY_GREEN    = colors.HexColor('#15803d')
DARK_TEXT        = colors.HexColor('#0f172a')
MUTED_TEXT       = colors.HexColor('#475569')
LIGHT_GREEN      = colors.HexColor('#f0fdf4')
BORDER_COLOR     = colors.HexColor('#cbd5e1')   # crisp, visible thin rules
WHITE            = colors.white
BLACK            = colors.black

STATUS_GREEN_BG  = colors.HexColor('#f0fdf4')
STATUS_GREEN_TX  = colors.HexColor('#15803d')
STATUS_RED_BG    = colors.HexColor('#fef2f2')
STATUS_RED_TX    = colors.HexColor('#b91c1c')

FONT_BASE = 'Helvetica'
FONT_BOLD = 'Helvetica-Bold'
FONT_ITAL = 'Helvetica-Oblique'

# ─── Data-formatting helpers ──────────────────────────────────────────────────

def fmt_field(value):
    """Return 'N/A' for None or blank; otherwise str(value)."""
    if value is None or str(value).strip() == '':
        return 'N/A'
    return str(value)


def pdf_text(value):
    """`value` made safe to give to a Paragraph. A Paragraph reads <tags> and &entities; in its text, so a name or note
    typed with "<" or "&" would be hidden, restyled, or (<img>) make the report try to open a file. Escaping shows
    the text exactly as it was typed. Blank becomes 'N/A', like fmt_field."""
    return escape(fmt_field(value))


def fmt_date(value):
    """Convert date/datetime/ISO-string to 'Month DD, YYYY', or 'N/A'."""
    if value is None:
        return 'N/A'
    if isinstance(value, (date_type, datetime)):
        return value.strftime('%B %d, %Y')
    try:
        return datetime.strptime(str(value), '%Y-%m-%d').strftime('%B %d, %Y')
    except Exception:
        return str(value)


def fmt_currency(value):
    """Return '₱X,XXX.XX', or 'N/A' if None."""
    if value is None:
        return 'N/A'
    try:
        return f'₱{Decimal(str(value)):,.2f}'
    except Exception:
        return str(value)


def full_name(person):
    """Build 'Prefix First Middle Last', skipping empty parts."""
    parts = [
        getattr(person, 'prefix', '') or '',
        getattr(person, 'first_name', '') or '',
        getattr(person, 'middle_name', '') or '',
        getattr(person, 'last_name', '') or '',
    ]
    return ' '.join(p for p in parts if p.strip()) or 'N/A'


# ─── Paragraph styles ─────────────────────────────────────────────────────────

def get_styles():
    """Return a dict of named ParagraphStyle objects."""
    base = getSampleStyleSheet()
    S = {}

    # Official header
    S['GovLine1'] = ParagraphStyle(
        'GovLine1', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=9, textColor=DARK_TEXT,
        alignment=TA_CENTER, spaceAfter=1, leading=13,
    )
    S['GovOfficeLine'] = ParagraphStyle(
        'GovOfficeLine', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=11, textColor=PRIMARY_GREEN,
        alignment=TA_CENTER, spaceAfter=2, leading=15,
    )
    S['DocTitle'] = ParagraphStyle(
        'DocTitle', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=15, textColor=DARK_TEXT,
        alignment=TA_CENTER, spaceAfter=3, leading=19,
    )
    S['DocSubtitle'] = ParagraphStyle(
        'DocSubtitle', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=9, textColor=MUTED_TEXT,
        alignment=TA_CENTER, spaceAfter=2, leading=13,
    )
    S['DateStamp'] = ParagraphStyle(
        'DateStamp', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8, textColor=MUTED_TEXT,
        alignment=TA_CENTER,
    )

    # Section heading
    S['SectionHead'] = ParagraphStyle(
        'SectionHead', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=10, textColor=PRIMARY_GREEN,
        spaceAfter=0, spaceBefore=0, leading=14,
    )

    # Key-value grid
    S['KVLabel'] = ParagraphStyle(
        'KVLabel', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=8.5, textColor=MUTED_TEXT, leading=12,
    )
    S['KVValue'] = ParagraphStyle(
        'KVValue', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8.5, textColor=DARK_TEXT, leading=12,
    )

    # Ledger table
    S['LedgerHeader'] = ParagraphStyle(
        'LedgerHeader', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=8, textColor=WHITE,
        alignment=TA_CENTER, leading=11,
    )
    S['LedgerCell'] = ParagraphStyle(
        'LedgerCell', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8, textColor=DARK_TEXT, leading=11,
    )

    # Sub-labels (A. Crops Grown etc.)
    S['SubLabel'] = ParagraphStyle(
        'SubLabel', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=8.5, textColor=PRIMARY_GREEN,
        spaceAfter=3, spaceBefore=6, leading=12,
    )

    # Empty-state italic
    S['EmptyItalic'] = ParagraphStyle(
        'EmptyItalic', parent=base['Normal'],
        fontName=FONT_ITAL, fontSize=8, textColor=MUTED_TEXT,
        alignment=TA_CENTER, leading=12,
    )

    # Signature block
    S['SigLabel'] = ParagraphStyle(
        'SigLabel', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=8.5, textColor=MUTED_TEXT, leading=12,
    )
    S['SigName'] = ParagraphStyle(
        'SigName', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=8.5, textColor=DARK_TEXT, leading=12,
    )
    S['SigSub'] = ParagraphStyle(
        'SigSub', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8, textColor=MUTED_TEXT, leading=11,
    )

    # Stats box
    S['StatCell'] = ParagraphStyle(
        'StatCell', parent=base['Normal'],
        fontName=FONT_BOLD, fontSize=9, textColor=PRIMARY_GREEN,
        alignment=TA_CENTER, leading=13,
    )

    # Misc
    S['NormalSmall'] = ParagraphStyle(
        'NormalSmall', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8, textColor=DARK_TEXT, leading=11,
    )
    S['Disclaimer'] = ParagraphStyle(
        'Disclaimer', parent=base['Normal'],
        fontName=FONT_ITAL, fontSize=7, textColor=MUTED_TEXT,
        alignment=TA_CENTER, leading=10,
    )
    # Kept for backwards compat
    S['FieldLabel'] = S['KVLabel']
    S['FieldValue'] = S['KVValue']
    S['SectionHeader'] = S['SectionHead']
    S['TableCellCenter'] = ParagraphStyle(
        'TableCellCenter', parent=base['Normal'],
        fontName=FONT_BASE, fontSize=8, textColor=DARK_TEXT,
        alignment=TA_CENTER, leading=11,
    )

    return S


# ─── 0B — Official document header ───────────────────────────────────────────

def build_official_header(logo_path, document_title, document_subtitle=None, logo_width=None):
    """
    Centered government letterhead used on every PDF.

    Layout (all centered):
      [LOGO 64×64]
      Republic of the Philippines
      Province of La Union
      Municipality of Aringay
      OFFICE OF THE MUNICIPAL AGRICULTURIST  ← bold green
      ─────────────────────────────────────  ← 0.75pt BORDER_COLOR rule
      <document_title>  (bold 15pt DARK_TEXT)
      <document_subtitle>  (if provided)
      [Date Generated: Month DD, YYYY]  ← bordered stamp box

    The logo is 64×64 for every document. `logo_width` (the individual disaster logs pass 80, exactly 25% more) draws it that wide
    with the height taken from the logo's own proportions, so it is never stretched.
    """
    S = get_styles()
    today_str = date_type.today().strftime('%B %d, %Y')
    flowables = []

    # Logo centered via single-cell Table
    logo_w, logo_h = 64, 64
    if logo_width:
        try:
            from reportlab.lib.utils import ImageReader
            px_w, px_h = ImageReader(logo_path).getSize()
            logo_w, logo_h = logo_width, logo_width * px_h / px_w
        except Exception:
            logo_w, logo_h = logo_width, logo_width
    try:
        img = Image(logo_path, width=logo_w, height=logo_h)
    except Exception:
        img = Spacer(1, logo_h)
    logo_tbl = Table([[img]])
    logo_tbl.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'CENTER'),
        ('TOPPADDING', (0, 0), (0, 0), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 6),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 0),
    ]))
    logo_tbl.hAlign = 'CENTER'
    flowables.append(logo_tbl)

    # Government text stack
    flowables.append(Paragraph('Republic of the Philippines', S['GovLine1']))
    flowables.append(Paragraph('Province of La Union', S['GovLine1']))
    flowables.append(Paragraph('Municipality of Aringay', S['GovLine1']))
    flowables.append(Paragraph('OFFICE OF THE MUNICIPAL AGRICULTURIST', S['GovOfficeLine']))
    flowables.append(Spacer(1, 6))
    flowables.append(HRFlowable(width='100%', thickness=0.75, color=BORDER_COLOR, spaceAfter=6))

    # Document title and subtitle
    flowables.append(Paragraph(escape(str(document_title)), S['DocTitle']))
    if document_subtitle:
        flowables.append(Paragraph(escape(str(document_subtitle)), S['DocSubtitle']))

    # Date stamp box — small bordered box, centered
    date_data = [[Paragraph(f'Date Generated: {today_str}', S['DateStamp'])]]
    date_tbl = Table(date_data)
    date_tbl.setStyle(TableStyle([
        ('BOX', (0, 0), (0, 0), 1, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (0, 0), 4),
        ('BOTTOMPADDING', (0, 0), (0, 0), 4),
        ('LEFTPADDING', (0, 0), (0, 0), 8),
        ('RIGHTPADDING', (0, 0), (0, 0), 8),
    ]))
    date_tbl.hAlign = 'CENTER'
    flowables.append(Spacer(1, 6))
    flowables.append(date_tbl)
    flowables.append(Spacer(1, 14))

    return flowables


# ─── 0C — Section heading ────────────────────────────────────────────────────

def build_section_heading(roman_numeral, title):
    """
    Returns a list of Flowables:
      Spacer(14) / "SECTION I — TITLE" (bold green) / 1pt green underline / Spacer(6)
    Used only in multi-section documents (Farmer Profile, Beneficiary Masterlist).
    """
    S = get_styles()
    return [
        Spacer(1, 14),
        Paragraph(f'SECTION {escape(str(roman_numeral))} — {escape(str(title))}', S['SectionHead']),
        HRFlowable(width='100%', thickness=1, color=PRIMARY_GREEN, spaceAfter=0),
        Spacer(1, 6),
    ]


# ─── 0D — Key-value grid ─────────────────────────────────────────────────────

def _kv_cell(value, style):
    """Wrap a value in a Paragraph unless it is already a Flowable."""
    from reportlab.platypus.flowables import Flowable
    if isinstance(value, Flowable):
        return value
    return Paragraph(pdf_text(value), style)


def build_keyvalue_grid(pairs, columns=2, page_width=468):
    """
    Lay out (label, value) pairs as a balanced grid.
    columns=2 → 4-column Table: Label | Value | Label | Value
    Widths sum exactly to page_width.
    Values are passed through fmt_field() unless already a Flowable.
    """
    S = get_styles()

    # Pad to a multiple of columns
    working = list(pairs)
    while len(working) % columns:
        working.append(('', ''))

    label_w = 88  # pt per label column
    value_w = (page_width // columns) - label_w   # e.g. 234-88=146 for 2-col

    table_rows = []
    for i in range(0, len(working), columns):
        row = []
        for j in range(columns):
            label, value = working[i + j]
            row.append(Paragraph(pdf_text(label), S['KVLabel']) if label else Paragraph('', S['KVLabel']))
            row.append(_kv_cell(value, S['KVValue']))
        table_rows.append(row)

    col_widths = [label_w, value_w] * columns

    tbl = Table(table_rows, colWidths=col_widths)

    style_cmds = [
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    # Label columns: even column indices (0, 2, 4 …)
    for j in range(columns):
        lc = j * 2
        style_cmds += [
            ('FONTNAME', (lc, 0), (lc, -1), FONT_BOLD),
            ('TEXTCOLOR', (lc, 0), (lc, -1), MUTED_TEXT),
            ('FONTSIZE', (lc, 0), (lc, -1), 8.5),
        ]
    # Value columns: odd column indices (1, 3, 5 …)
    for j in range(columns):
        vc = j * 2 + 1
        style_cmds += [
            ('FONTNAME', (vc, 0), (vc, -1), FONT_BASE),
            ('TEXTCOLOR', (vc, 0), (vc, -1), DARK_TEXT),
            ('FONTSIZE', (vc, 0), (vc, -1), 8.5),
        ]

    tbl.setStyle(TableStyle(style_cmds))
    return tbl


# ─── 0E — Ledger table ───────────────────────────────────────────────────────

def build_ledger_table(headers, rows, col_widths, extra_style_cmds=None):
    """
    Build a ledger-style data table.
    - headers: list of column label strings
    - rows: list of lists; each cell is a string or a Flowable (e.g. status badge)
    - col_widths: must sum exactly to usable page width
    - extra_style_cmds: additional TableStyle commands appended after defaults
    """
    S = get_styles()

    header_row = [Paragraph(escape(str(h)), S['LedgerHeader']) for h in headers]
    data_rows = []
    for row in rows:
        cells = []
        for cell in row:
            from reportlab.platypus.flowables import Flowable
            if isinstance(cell, Flowable):
                cells.append(cell)
            else:
                cells.append(Paragraph(pdf_text(cell), S['LedgerCell']))
        data_rows.append(cells)

    tbl = Table([header_row] + data_rows, colWidths=col_widths, repeatRows=1)

    cmds = [
        # Header row
        ('BACKGROUND', (0, 0), (-1, 0), PRIMARY_GREEN),
        ('TEXTCOLOR', (0, 0), (-1, 0), WHITE),
        ('FONTNAME', (0, 0), (-1, 0), FONT_BOLD),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        # Alternating data rows
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [WHITE, LIGHT_GREEN]),
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]
    if extra_style_cmds:
        cmds.extend(extra_style_cmds)

    tbl.setStyle(TableStyle(cmds))
    return tbl


# ─── 0F — Helper: stats row ──────────────────────────────────────────────────

def build_stats_row(stat_items, page_width=468):
    """Single-row table with LIGHT_GREEN background, bold PRIMARY_GREEN text."""
    S = get_styles()
    n = len(stat_items)
    col_w = page_width / n
    data = [[Paragraph(f'{escape(str(label))}: {escape(str(value))}', S['StatCell']) for label, value in stat_items]]
    tbl = Table(data, colWidths=[col_w] * n)
    tbl.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), LIGHT_GREEN),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return tbl


# ─── 0G — Status badge ───────────────────────────────────────────────────────

def build_status_badge(is_active):
    """
    Compact colored badge Table:
      ACTIVE  → STATUS_GREEN_BG / STATUS_GREEN_TX
      INACTIVE → STATUS_RED_BG  / STATUS_RED_TX
    """
    if is_active:
        text, tc, bg = 'ACTIVE', STATUS_GREEN_TX, STATUS_GREEN_BG
    else:
        text, tc, bg = 'INACTIVE', STATUS_RED_TX, STATUS_RED_BG

    style = ParagraphStyle(
        '_badge', fontName=FONT_BOLD, fontSize=8,
        textColor=tc, alignment=TA_CENTER,
    )
    badge = Table([[Paragraph(text, style)]])
    badge.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (0, 0), bg),
        ('BOX', (0, 0), (0, 0), 0.5, tc),
        ('TOPPADDING', (0, 0), (0, 0), 3),
        ('BOTTOMPADDING', (0, 0), (0, 0), 3),
        ('LEFTPADDING', (0, 0), (0, 0), 6),
        ('RIGHTPADDING', (0, 0), (0, 0), 6),
    ]))
    return badge


# ─── 0H — Signature / verification block ─────────────────────────────────────

def _sig_line():
    """140pt horizontal rule used as a signature line."""
    t = Table([['']], colWidths=[140])
    t.setStyle(TableStyle([
        ('LINEBELOW', (0, 0), (0, 0), 0.5, BLACK),
        ('TOPPADDING', (0, 0), (0, 0), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 2),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 0),
    ]))
    return t


def build_signature_block(
    left_label='Prepared by',
    left_role='System Administrator',
    left_name=None,
    printed_by_name=None,
    reviewed_by=None,
    reviewed_role=None,
    noted_by=None,
    noted_role=None,
    page_width=468,
):
    """
    Signature table with 2 or 3 signatories.
    If reviewed_by is provided → 3-col (prepared | reviewed | noted/MA).
    Otherwise → 2-col (prepared | noted/MA).
    """
    S = get_styles()

    def _sig_col(label, name, role, sub=None):
        col = [
            Paragraph(f'{escape(str(label))}:', S['SigLabel']),
            Spacer(1, 18),
            _sig_line(),
            Spacer(1, 3),
        ]
        if name:
            col.append(Paragraph(escape(name.upper()), S['SigName']))
        if role:
            col.append(Paragraph(escape(role), S['SigSub']))
        if sub:
            col.append(Paragraph(escape(sub), S['SigSub']))
        return col

    col_prepared = _sig_col(
        left_label,
        left_name,
        left_role,
        f'Printed by: {printed_by_name}' if printed_by_name else None,
    )

    # Rightmost column: noted_by or Municipal Agriculturist
    if noted_by:
        col_right = _sig_col('Noted by', noted_by, noted_role or 'Municipal Agriculturist')
    else:
        col_right = [
            Paragraph('Certified by:', S['SigLabel']),
            Spacer(1, 18),
            _sig_line(),
            Spacer(1, 3),
            Paragraph('MUNICIPAL AGRICULTURIST', S['SigName']),
            Paragraph('Municipality of Aringay, La Union', S['SigSub']),
        ]

    if reviewed_by:
        col_w = int((page_width - 30) / 3)
        col_reviewed = _sig_col('Reviewed by', reviewed_by, reviewed_role or '')
        sig_tbl = Table(
            [[col_prepared, '', col_reviewed, '', col_right]],
            colWidths=[col_w, 10, col_w, 10, col_w],
        )
    else:
        spacer_w = page_width - 200 - 200
        sig_tbl = Table([[col_prepared, '', col_right]], colWidths=[200, spacer_w, 200])

    sig_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    return sig_tbl


# ─── 0I — Page footer + NumberedCanvas ───────────────────────────────────────

_DISCLAIMER = f'This is an official record generated by the {SYSTEM_TITLE}.'


def _draw_page_footer(c, page_num, page_count, disclaimer=None):
    """
    Draw the official footer on the current canvas page:
      - 0.5pt PRIMARY_GREEN rule above the footer zone
      - centered italic disclaimer text
      - 'Page X of Y' at bottom-right
    """
    page_width, _ = c._pagesize
    left  = 36
    right = page_width - 36

    c.saveState()
    c.setStrokeColor(PRIMARY_GREEN)
    c.setLineWidth(0.5)
    c.line(left, 22, right, 22)

    c.setFont(FONT_ITAL, 7)
    c.setFillColor(MUTED_TEXT)
    mid = page_width / 2
    c.drawCentredString(mid, 10, disclaimer or _DISCLAIMER)

    c.setFont(FONT_BASE, 7)
    c.drawRightString(right, 10, f'Page {page_num} of {page_count}')
    c.restoreState()


class NumberedCanvas(pdf_canvas.Canvas):
    """
    Canvas subclass that defers footer drawing until save() so that
    the total page count is known. Pass as canvasmaker= to doc.build().
    """

    # The footer line; a subclass can say something else (the individual disaster logs do, see reports.disaster_log_pdf).
    disclaimer = None

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        page_count = len(self._saved_page_states)
        for i, state in enumerate(self._saved_page_states, 1):
            self.__dict__.update(state)
            _draw_page_footer(self, i, page_count, self.disclaimer)
            super().showPage()
        super().save()