"""
The machinery file read by the Add Farm Parcels page (the per-parcel "Import machinery" button).

Like the crops file (parcel_import.ParcelCropsParseView) it only checks the file and returns the machinery, which the page adds to the
list of the parcel being filled in. Nothing is saved here (the parcel is saved on submit), so there is nothing to undo: a wrong file
costs nothing.

    columns: Machinery Type, Quantity, Ownership, Machinery Name (if Other)
    GET  /api/farmers/parcel-machinery/template/   the Excel template
    POST /api/farmers/parcel-machinery/parse/      multipart `file` -> { machinery: [{ machinery_type, machinery_type_other, quantity, ownership }] }
"""
from decimal import Decimal, InvalidOperation

from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator

from .models import FarmMachinery
from .parcel_import import _choice, _read, _serializer_errors, _template_response, _text
from .serializers import FarmMachinerySerializer

MACHINERY_HEADERS = ['Machinery Type', 'Quantity', 'Ownership', 'Machinery Name (if Other)']
MACHINERY_WIDTHS = [26, 12, 24, 30]
MACHINERY_SAMPLE = ['Hand Tractor', '1', 'Owned', '']
MACHINERY_NOTE_PREFIX = 'How to fill this in:'
MAX_MACHINERY_ROWS = 100

MACHINERY_TYPES = [value for value, _ in FarmMachinery.MachineryType.choices if value != 'Other']
OWNERSHIPS = [value for value, _ in FarmMachinery.Ownership.choices]
MAX_QUANTITY = 9999

MACHINERY_NOTE = (
    f'{MACHINERY_NOTE_PREFIX} one row per kind of machinery. Machinery Type: {", ".join(MACHINERY_TYPES)} (anything else is recorded as '
    'Other with your text, or write Other and give its name in the last column). Quantity: a whole number, 1 if blank. '
    f'Ownership: {", ".join(OWNERSHIPS)} (who owns the equipment, not the land; Owned if blank). Delete the sample row.'
)


def parse_machinery_cells(row):
    """One machinery line from a row of cells, or None when the row is blank; a value that is not valid raises ValueError with a sentence."""
    cells = [_text(row, i) for i in range(len(MACHINERY_HEADERS))]
    kind, quantity, ownership, other_name = cells
    if not any(cells):
        return None
    if not kind:
        raise ValueError('Machinery Type is required when any other cell is filled in.')
    known = _choice(kind, MACHINERY_TYPES, 'Machinery Type') if kind.lower() in {t.lower() for t in MACHINERY_TYPES} else ''
    if known:
        machinery_type, machinery_type_other = known, ''
    else:
        machinery_type = 'Other'
        # "Other" itself needs its name in the last column; any other unlisted text is the name.
        machinery_type_other = other_name if kind.lower() == 'other' else kind
        if not machinery_type_other:
            raise ValueError('Machinery Name (if Other) is required when the Machinery Type is Other.')
    if quantity:
        try:
            amount = Decimal(quantity)
        except InvalidOperation:
            raise ValueError(f'Quantity "{quantity}" is not a number.')
        if not amount.is_finite() or amount != amount.to_integral_value():
            raise ValueError(f'Quantity "{quantity}" is not a whole number.')
        if amount < 1:
            raise ValueError('Quantity must be at least 1.')
        if amount > MAX_QUANTITY:
            raise ValueError(f'Quantity cannot be more than {MAX_QUANTITY}.')
        amount = int(amount)
    else:
        amount = 1
    line = {
        'machinery_type': machinery_type,
        'machinery_type_other': machinery_type_other,
        'quantity': amount,
        'ownership': _choice(ownership, OWNERSHIPS, 'Ownership') or 'Owned',
    }
    check = FarmMachinerySerializer(data=line)
    if not check.is_valid():
        raise ValueError(_serializer_errors(check))
    return line


class ParcelMachineryTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _template_response('farm_parcel_machinery_import_template.xlsx', MACHINERY_HEADERS, MACHINERY_WIDTHS, MACHINERY_SAMPLE, MACHINERY_NOTE)


class ParcelMachineryParseView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        rows, failure = _read(file, MACHINERY_HEADERS, MACHINERY_SAMPLE, MACHINERY_NOTE_PREFIX, MAX_MACHINERY_ROWS)
        if failure:
            return failure
        machinery, errors = [], []
        for number, row in rows:
            try:
                line = parse_machinery_cells(row)
            except ValueError as exc:
                errors.append({'row': number, 'error': str(exc)})
                continue
            if line:
                machinery.append(line)
        if errors:
            return Response({'error': ' '.join(f'Row {e["row"]}: {e["error"]}' for e in errors), 'errors': errors}, status=400)
        return Response({'machinery': machinery})
