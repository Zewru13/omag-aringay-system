"""The Excel template for the RSBSA registry import (Farmers and Fisherfolk pages).

The registry import is an UPDATE of records that already exist, matched by `rsbsa_no`; it reads the 23-column RSBSA/BFAR export
(farmers.rsbsa_import.EXPECTED_HEADERS_V2) and refuses any other header row. The template's first sheet has the layout of every import
template (core.import_templates), and the reader skips its sample fill-up; the second sheet explains each column."""
from openpyxl.styles import Font, PatternFill
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from core.exports import SafeWorkbook
from core.import_templates import HEADER_FILL, lay_out_import_sheet, workbook_response

from .rsbsa_import import EXPECTED_HEADERS_V2, RSBSA_SAMPLE_ROW

SHEET_NOTE = (
    'How to fill this in: this import updates farmers and fisherfolk who are already registered, matched by rsbsa_no. Paste the rows of '
    'the RSBSA/BFAR export, without its heading row, from row 5 (or upload the export file itself). Do not rename, reorder or delete the '
    'columns. The second sheet explains each column.'
)

COLUMN_HELP = {
    'rsbsa_no': ('The RSBSA number', 'Matches the existing farmer or fisherfolk. A row with no match is reported, never created.'),
    'control_no': ('The control number of the export', 'Any text.'),
    'first_name': ('First name', 'Text.'),
    'middle_name': ('Middle name', 'Text, or NULL / blank.'),
    'last_name': ('Last name', 'Text.'),
    'ext_name': ('Name extension (Jr., Sr., III)', 'Text, or NULL / blank.'),
    'farmer_address_bgy': ('Barangay', 'An Aringay barangay, for example Alaska or Pangao-aoan East.'),
    'farmer_address_mun': ('Municipality', 'Aringay.'),
    'farmer_address_prv': ('Province', 'La Union.'),
    'birthday': ('Date of birth', 'YYYY-MM-DD (DD/MM/YYYY is also read).'),
    'gender': ('Gender', 'Male or Female.'),
    'contact_num': ('Mobile number', '09XXXXXXXXX (a 10-digit number starting with 9 is read as 09...). Blank is fine.'),
    'cropname': ('Crop or commodity', 'Text. Read but not used to change records.'),
    'crop_area': ('Area of the crop in hectares', 'A number. Read but not used to change records.'),
    'verified_area(for_testing)': ('Verified area', 'A number. Read but not used to change records.'),
    'farmer': ('Is a farmer', 'YES or NO.'),
    'farmworker': ('Is a farmworker', 'YES or NO.'),
    'fisherfolk': ('Is a fisherfolk', 'YES or NO. At least one of farmer, farmworker, fisherfolk must be YES.'),
    'agency': ('Agency that registered the person', 'Text.'),
    'farm_type': ('Farm type', 'Text.'),
    'date_created': ('Date the record was created', 'YYYY-MM-DD.'),
    'kyc_updated': ('KYC update date', 'Text or a date.'),
    'parcel_updated': ('Parcel update date', 'Text or a date.'),
}


class RsbsaImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        book = SafeWorkbook()
        data = book.active
        data.title = 'RSBSA Registry'
        widths = [max(14, len(header) + 2, len(sample) + 4) for header, sample in zip(EXPECTED_HEADERS_V2, RSBSA_SAMPLE_ROW)]
        lay_out_import_sheet(data, EXPECTED_HEADERS_V2, widths, RSBSA_SAMPLE_ROW, SHEET_NOTE)

        fill = PatternFill(start_color=HEADER_FILL, end_color=HEADER_FILL, fill_type='solid')
        font = Font(color='FFFFFF', bold=True)
        help_sheet = book.create_sheet('How to fill this in')
        help_sheet.append(['This import updates farmers and fisherfolk who are already registered, matched by rsbsa_no. On the first sheet, '
                           'row 4 is a sample fill-up (not imported while unchanged): paste the rows of the RSBSA/BFAR export from row 5. '
                           'Do not rename, reorder or delete the columns: the import refuses a file whose heading row differs.'])
        help_sheet.append([])
        help_sheet.append(['Column', 'What it is', 'What to enter'])
        for cell in help_sheet[3]:
            cell.fill, cell.font = fill, font
        for header in EXPECTED_HEADERS_V2:
            what, how = COLUMN_HELP.get(header, ('', ''))
            help_sheet.append([header, what, how])
        for letter, width in (('A', 28), ('B', 38), ('C', 80)):
            help_sheet.column_dimensions[letter].width = width

        return workbook_response(book, 'rsbsa_registry_import_template.xlsx')
