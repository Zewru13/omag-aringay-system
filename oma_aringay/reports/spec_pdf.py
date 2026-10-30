"""
POST /api/reports/spec-pdf/ - the Download Report of the list reports the browser builds and prints (Crop Records, Crop Monitoring,
Aquaculture Monitoring and Capture Monitoring). The page sends the very document it prints; this lays the same document out as the
official PDF (the letterhead and footer of the disaster logs), so Print and Download always show the same report.

Staff only. Read-only: nothing is saved, and nothing the page sends is trusted as markup (every cell is escaped text).

Body: { title, reference, landscape, pageSize, footerLabel, header: [[label, value]], signatures: [label],
        sections: [{ title, rows: [[label, value]] } | { title, table: { head: [...], rows: [[...]], bold_rows: [i] } }] }
"""
import logging
from datetime import date

from django.http import HttpResponse
from django.utils import timezone
from reportlab.lib.pagesizes import A4, landscape, letter
from rest_framework import status
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator

from .disaster_log_pdf import build_disaster_log_pdf, fmt_datetime, safe_pdf_filename

logger = logging.getLogger(__name__)

MAX_ROWS = 5000
MAX_COLUMNS = 20
MAX_SECTIONS = 10
MAX_TEXT = 300


def _text(value):
    return '' if value is None else str(value)[:MAX_TEXT]


def _pairs(value, where):
    if not isinstance(value, list) or not all(isinstance(p, (list, tuple)) and len(p) == 2 for p in value):
        raise ValidationError({where: 'Send a list of [label, value] pairs.'})
    return [(_text(k), _text(v)) for k, v in value]


def _header(pairs, reference, landscape):
    """The header grid is two pairs to a row, and the shared grid pads an odd last pair with "N/A": the report number always joins the header
    (the print shows it in its footer), and the page orientation fills the last place when the count is still odd."""
    rows = pairs + [('Report no.', reference)]
    if len(rows) % 2:
        rows.append(('Page', 'Landscape' if landscape else 'Portrait'))
    return rows


def _table(raw, where):
    if not isinstance(raw, dict) or not isinstance(raw.get('head'), list) or not isinstance(raw.get('rows'), list):
        raise ValidationError({where: 'Send a table as { head, rows }.'})
    head = [_text(h) for h in raw['head']]
    if not head or len(head) > MAX_COLUMNS:
        raise ValidationError({where: f'A table has 1 to {MAX_COLUMNS} columns.'})
    if len(raw['rows']) > MAX_ROWS:
        raise ValidationError({where: f'A report holds at most {MAX_ROWS} rows. Narrow the filters.'})
    rows = []
    for row in raw['rows']:
        if not isinstance(row, (list, tuple)) or len(row) != len(head):
            raise ValidationError({where: 'Every row needs one cell for each column.'})
        rows.append([_text(c) for c in row])
    bold = {i for i in (raw.get('bold_rows') or []) if isinstance(i, int)}
    return {'head': head, 'rows': rows, 'bold_rows': bold, 'widths': _widths(head, rows)}


def _widths(head, rows):
    """Column widths as fractions of the page: by how long each column's text is, none too narrow or too wide."""
    weights = []
    for i, h in enumerate(head):
        longest = max([len(h)] + [len(r[i]) for r in rows[:200]])
        weights.append(min(max(longest, 4), 28) ** 0.8)
    total = sum(weights)
    return [w / total for w in weights]


def read_spec(data):
    if not isinstance(data, dict):
        raise ValidationError({'detail': 'Send the report document.'})
    title = _text(data.get('title')).strip()
    if not title:
        raise ValidationError({'title': 'The report needs a title.'})
    raw_sections = data.get('sections')
    if not isinstance(raw_sections, list) or len(raw_sections) > MAX_SECTIONS:
        raise ValidationError({'sections': f'Send 1 to {MAX_SECTIONS} sections.'})
    sections = []
    for i, sec in enumerate(raw_sections):
        if not isinstance(sec, dict):
            raise ValidationError({'sections': 'Each section is an object.'})
        where = f'sections[{i}]'
        heading = _text(sec.get('title')) or 'Records'
        if sec.get('table') is not None:
            sections.append({'title': heading, 'table': _table(sec['table'], where), 'split': True})
        else:
            sections.append({'title': heading, 'rows': _pairs(sec.get('rows') or [], where)})
    signatures = [_text(s) for s in (data.get('signatures') or []) if isinstance(s, str)][:4]
    reference = _text(data.get('reference')) or date.today().isoformat()
    is_landscape = bool(data.get('landscape'))
    return {
        'title': title.upper(),
        'reference': reference,
        'header': _header(_pairs(data.get('header') or [], 'header'), reference, is_landscape),
        'sections': sections,
        'signatures': signatures,
        'landscape': is_landscape,
        'page': A4 if data.get('pageSize') == 'A4' else letter,
    }


class SpecPdfView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        spec = read_spec(request.data)
        pagesize = landscape(spec['page']) if spec['landscape'] else spec['page']
        note = f'Generated {fmt_datetime(timezone.now())} from the records shown on screen, report {spec["reference"]}.'
        try:
            pdf = build_disaster_log_pdf(
                title=spec['title'], header_rows=spec['header'], sections=spec['sections'], photo_paths=[], reference=spec['reference'],
                pdf_title=f"{spec['title']} {spec['reference']}", pagesize=pagesize, signatures=spec['signatures'], generated_note=note,
            )
        except Exception:
            logger.exception('List report PDF failed for %s', spec['reference'])
            return Response({'detail': 'The PDF could not be generated. Please try again.'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        response = HttpResponse(pdf, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{safe_pdf_filename(spec["title"], spec["reference"])}"'
        response['Cache-Control'] = 'no-store'
        return response
