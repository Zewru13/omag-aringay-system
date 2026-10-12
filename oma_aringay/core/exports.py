"""Safe spreadsheet output.

Names, notes and other text in these records are typed by people, and a spreadsheet will RUN text that starts with =, +, -
or @ as a formula (for example =HYPERLINK(...) that sends the reader somewhere, or a command Excel is asked to launch).
Everything the system exports goes through here so that such text always stays text."""
import csv

from openpyxl import Workbook

_FORMULA_STARTS = ('=', '+', '-', '@', '\t', '\r')


class SafeWorkbook(Workbook):
    """An openpyxl Workbook that never saves text as a formula. (openpyxl reads any string starting with "=" as a
    formula; a cell stored as a string is shown as typed and is never evaluated.) The system writes no formulas of its own."""

    def save(self, filename):
        for sheet in self.worksheets:
            for row in sheet.iter_rows():
                for cell in row:
                    if cell.data_type == 'f':
                        cell.data_type = 's'
        super().save(filename)


def csv_safe_cell(value):
    """The value unchanged unless it is text that a spreadsheet would run; then it gets a leading apostrophe. Plain
    numbers written as text (-5, +639171234567) are left alone."""
    if isinstance(value, str) and value.startswith(_FORMULA_STARTS):
        try:
            float(value)
        except ValueError:
            return "'" + value
    return value


class _SafeCsvWriter:
    def __init__(self, target, *args, **kwargs):
        self._writer = csv.writer(target, *args, **kwargs)

    def writerow(self, row):
        return self._writer.writerow([csv_safe_cell(value) for value in row])

    def writerows(self, rows):
        for row in rows:
            self.writerow(row)


def safe_csv_writer(target, *args, **kwargs):
    """csv.writer that defuses formula-like text in every cell."""
    return _SafeCsvWriter(target, *args, **kwargs)
