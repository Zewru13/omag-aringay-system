"""The one layout of every downloadable import template.

Row 1 says the yellow row is a sample, row 2 how to fill the file in, row 3 holds the column headings, row 4 is the sample (yellow, with
an Excel comment) and the person types from row 5. The importers find the heading row by its text and skip the sample while it is left
unchanged (see core.utils.read_template_rows)."""
import math
from io import BytesIO

from django.http import HttpResponse
from openpyxl.comments import Comment
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from core.exports import SafeWorkbook

SAMPLE_BANNER = ('SAMPLE FILL-UP ONLY: the yellow row (row 4) is an example. It is not imported if you leave it unchanged. '
                 'Type your own records from row 5 down.')
SAMPLE_COMMENT = ('Sample fill-up only. This row shows how to fill in the template. It is not imported while it is left unchanged. '
                  'Type your own records from row 5 down.')
HEADER_ROW = 3
SAMPLE_ROW = 4
SAMPLE_FILL = 'FFF2CC'
HEADER_FILL = '1E4620'
XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

# the banner and the instructions are wrapped over about this many characters, so they are read without scrolling far sideways
TEXT_WIDTH = 110
DEFAULT_COLUMN_WIDTH = 9
LINE_HEIGHT = 15
MAX_ROW_HEIGHT = 409          # Excel's own limit


def _text_span(sheet, widths):
    """(last column, its total width) of the cell the banner and the instructions are merged into."""
    total, column = 0, 0
    while total < TEXT_WIDTH:
        column += 1
        if column <= len(widths):
            total += widths[column - 1]
        else:
            sheet.column_dimensions[get_column_letter(column)].width = DEFAULT_COLUMN_WIDTH
            total += DEFAULT_COLUMN_WIDTH
    return column, total


def _text_row(sheet, number, text, last_column, width, **style):
    cell = sheet.cell(row=number, column=1, value=text)
    cell.alignment = Alignment(wrap_text=True, vertical='top')
    for name, value in style.items():
        setattr(cell, name, value)
    if last_column > 1:
        sheet.merge_cells(start_row=number, start_column=1, end_row=number, end_column=last_column)
    # Excel does not grow a merged cell to fit its text, so the height is worked out here. A column's width counts its widest digits, and
    # ordinary text is narrower, so this leaves a little room to spare.
    lines = max(2, math.ceil(len(text) / width))
    sheet.row_dimensions[number].height = min(MAX_ROW_HEIGHT, LINE_HEIGHT * lines)


def lay_out_import_sheet(sheet, headers, widths, sample_row, note):
    """Writes the banner, the instructions, the headings and the sample onto an empty sheet."""
    for column, width in enumerate(widths, 1):
        sheet.column_dimensions[get_column_letter(column)].width = width
    last_column, width = _text_span(sheet, widths)
    _text_row(sheet, 1, SAMPLE_BANNER, last_column, width,
              font=Font(bold=True, color='9C0006'), fill=PatternFill('solid', start_color=SAMPLE_FILL, end_color=SAMPLE_FILL))
    _text_row(sheet, 2, note, last_column, width)
    for column, header in enumerate(headers, 1):
        cell = sheet.cell(row=HEADER_ROW, column=column, value=header)
        cell.fill = PatternFill('solid', start_color=HEADER_FILL, end_color=HEADER_FILL)
        cell.font = Font(color='FFFFFF', bold=True)
    for column in range(1, len(headers) + 1):
        value = sample_row[column - 1] if column <= len(sample_row) else None
        cell = sheet.cell(row=SAMPLE_ROW, column=column, value=None if value == '' else value)
        cell.fill = PatternFill('solid', start_color=SAMPLE_FILL, end_color=SAMPLE_FILL)
        cell.font = Font(italic=True, color='595959')
    comment = Comment(SAMPLE_COMMENT, 'OMAg Aringay')
    comment.width, comment.height = 260, 90
    sheet.cell(row=SAMPLE_ROW, column=1).comment = comment


def workbook_response(book, filename):
    buffer = BytesIO()
    book.save(buffer)
    response = HttpResponse(buffer.getvalue(), content_type=XLSX_TYPE)
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def import_template_response(filename, headers, widths, sample_row, note, sheet_title='Import'):
    book = SafeWorkbook()
    sheet = book.active
    sheet.title = sheet_title
    lay_out_import_sheet(sheet, headers, widths, sample_row, note)
    return workbook_response(book, filename)
