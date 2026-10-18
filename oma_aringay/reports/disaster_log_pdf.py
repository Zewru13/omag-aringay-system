"""
Disaster Log PDF layout shared by the Farmer (crop) and Fisheries disaster logs.

Each domain module builds a plain description of its saved record - the header rows, the sections and the
photo file paths - and `build_disaster_log_pdf()` turns it into the official PDF (same letterhead, footer
and page numbering as every other OMAg document). Read-only: nothing here touches the database.
"""
import io
import logging
import os
import re
import unicodedata
from xml.sax.saxutils import escape

from django.conf import settings
from django.utils import timezone
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.constants import SYSTEM_TITLE

from .pdf_utils import (
    BORDER_COLOR, MUTED_TEXT, NumberedCanvas, build_keyvalue_grid, build_official_header, build_section_heading,
    get_styles,
)

logger = logging.getLogger(__name__)

LOGO_PATH = os.path.join(settings.BASE_DIR, 'static', 'images', 'LOGO_OMAg.jpg')
PAGE_WIDTH = 468   # letter portrait, 1-inch margins (same as the reports app)
ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']


def fmt_datetime(value):
    if not value:
        return None
    return timezone.localtime(value).strftime('%B %d, %Y %I:%M %p')


def fmt_number(value, suffix=''):
    """1,234.5 - thousands separators, no trailing decimal zeros (12.5000 ha -> 12.5 ha)."""
    if value is None:
        return None
    text = f'{value:,f}' if not isinstance(value, int) else f'{value:,}'
    if '.' in text:
        text = text.rstrip('0').rstrip('.')
    return f'{text}{suffix}'


def safe_pdf_filename(*parts):
    """Join the parts with '_' using only ASCII letters, digits, '-' and '_'; always ends in .pdf."""
    raw = '_'.join(p for p in parts if p)
    ascii_only = unicodedata.normalize('NFKD', raw).encode('ascii', 'ignore').decode('ascii')
    safe = re.sub(r'[^A-Za-z0-9-]+', '_', ascii_only).strip('_')
    return f'{safe or "Disaster_Log"}.pdf'


def _photo_flowable(path, max_w, max_h):
    """The photo scaled into max_w x max_h with its real aspect ratio (never stretched); None if unreadable."""
    try:
        from PIL import Image as PILImage
        with PILImage.open(path) as im:
            w, h = im.size
        scale = min(max_w / w, max_h / h)
        return Image(path, width=w * scale, height=h * scale)
    except Exception:
        logger.warning('Disaster log PDF: skipped unreadable photo %s', path)
        return None


def _photo_rows(paths, page_width=PAGE_WIDTH):
    """Two photos per row, one small table per row so the page can break between any two rows (a long set
    continues on the next pages at the same readable size - never shrunk to fit one page)."""
    cell_w, cell_h = (page_width - 12) / 2, 200
    flowables = [f for f in (_photo_flowable(p, cell_w - 8, cell_h - 8) for p in paths) if f]
    rows = []
    for i in range(0, len(flowables), 2):
        pair = flowables[i:i + 2] + ([''] if len(flowables[i:i + 2]) == 1 else [])
        tbl = Table([pair], colWidths=[cell_w + 6, cell_w + 6], rowHeights=[cell_h])
        tbl.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('BOX', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
            ('INNERGRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ]))
        rows.append(tbl)
    return rows


def build_disaster_log_pdf(*, title, header_rows, sections, photo_paths, reference, pdf_title,
                           pagesize=letter, photo_title='PHOTO DOCUMENTATION'):
    """PDF bytes. header_rows = [(label, value)]; sections = [{'title', 'rows'|'table'|'bullets'|'paragraphs',
    'empty'}] (empty values are left out); photo_paths = files to embed (no section when there are none).
    pagesize / photo_title: optional (the Farmer log keeps the defaults: letter, "PHOTO DOCUMENTATION").
    Raises on failure - callers turn that into a clear error, so a blank/half PDF is never returned."""
    page_width = pagesize[0] - 144   # 1-inch side margins
    S = get_styles()
    body = ParagraphStyle('DLBody', parent=S['KVValue'], fontSize=9, leading=13)
    note = ParagraphStyle('DLNote', parent=S['KVValue'], fontSize=8, leading=11, textColor=MUTED_TEXT)

    def para(text, style=body):
        return Paragraph(escape(str(text)).replace('\n', '<br/>'), style)

    def grid(pairs):
        # Values are user-entered text: escaped into Paragraphs so '&' / '<' can never break the PDF markup.
        return build_keyvalue_grid(
            [(label, para(value, S['KVValue'])) for label, value in pairs if value not in (None, '')],
            page_width=page_width,
        )

    story = build_official_header(LOGO_PATH, title, SYSTEM_TITLE)
    story.append(grid(header_rows))

    def section(numeral, heading, *content):
        # A heading is never left alone at the bottom of a page: it moves with (the start of) its content.
        story.append(KeepTogether(build_section_heading(numeral, heading) + list(content)))

    numerals = iter(ROMAN)
    for sec in sections:
        if sec.get('rows') is not None:
            rows = [(k, v) for k, v in sec['rows'] if v not in (None, '')]
            if rows:
                section(next(numerals), sec['title'], grid(rows))
        elif sec.get('table') is not None:
            # {'head': [...], 'rows': [[...]], 'bold_rows': {row indexes}, 'widths': [fractions]} - a data
            # table (e.g. fingerlings lost per pond); every cell is escaped text, so user values stay safe.
            t = sec['table']
            if not t['rows']:
                continue
            cell = ParagraphStyle('DLCell', parent=body, fontSize=8, leading=10)
            head_style = ParagraphStyle('DLHead', parent=cell, fontName='Helvetica-Bold')
            data = [[Paragraph(escape(str(h)), head_style) for h in t['head']]]
            data += [[Paragraph(escape('' if v is None else str(v)), head_style if i in t.get('bold_rows', ()) else cell)
                      for v in row] for i, row in enumerate(t['rows'])]
            widths = [page_width * w for w in t['widths']] if t.get('widths') else None
            tbl = Table(data, colWidths=widths, repeatRows=1)
            tbl.setStyle(TableStyle([
                ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#f1f5f9')),
            ]))
            section(next(numerals), sec['title'], tbl)
        elif sec.get('bullets') is not None:
            content = (Paragraph('<br/>'.join(f'&bull; {escape(str(b))}' for b in sec['bullets']), body)
                       if sec['bullets'] else para(sec.get('empty', 'None recorded.'), note))
            section(next(numerals), sec['title'], content)
        else:
            texts = [t for t in sec.get('paragraphs', []) if t]
            content = []
            for t in texts:
                content += [para(t), Spacer(1, 4)]
            section(next(numerals), sec['title'], *(content or [para(sec.get('empty', 'None recorded.'), note)]))

    photo_rows = _photo_rows(photo_paths, page_width) if photo_paths else []
    if photo_rows:
        section(next(numerals), f'{photo_title} ({len(photo_paths)})', photo_rows[0])
        story.extend(photo_rows[1:])

    story.append(Spacer(1, 18))
    story.append(para(f'Generated {fmt_datetime(timezone.now())} from the saved disaster log {reference}.', note))

    buf = io.BytesIO()
    pdf = SimpleDocTemplate(buf, pagesize=pagesize, leftMargin=72, rightMargin=72, topMargin=72, bottomMargin=72,
                            title=pdf_title, author='OMAg Aringay')
    pdf.build(story, canvasmaker=NumberedCanvas)
    data = buf.getvalue()
    if not data.startswith(b'%PDF'):
        raise ValueError('PDF generation produced no document.')
    return data
