"""The crops file read by the Add Farm Parcels form: one row per crop that is planted on the parcel being filled in.

Like the machinery file it only checks the file and hands the crops back; the form adds them to the parcel's own list (so they can be
checked and corrected there) and they are saved, as crop records, when the parcel is saved. Nothing is saved here, so there is nothing
to undo.
"""
from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from production.models import CropType, SeedSource

from .parcel_import import _choice, _decimal, _read, _template_response, _text

CROP_RECORD_HEADERS = [
    'Crop', 'Date Planted', 'Area Planted (ha)', 'Variety', 'Crop Status', 'Crop Owner Name', 'Seed Source', 'Qty of Seeds (kg)', 'Qty of Trees',
]
CROP_RECORD_WIDTHS = [22, 16, 18, 22, 16, 26, 20, 18, 14]
CROP_RECORD_SAMPLE = ['Rice', '2026-09-15', '1.5', 'NSIC Rc 222', 'Owner', '', 'Certified Seed', '40', '']
CROP_RECORD_NOTE_PREFIX = 'How to fill this in:'
MAX_CROP_RECORD_ROWS = 100
LAND_STATUSES = ['Owner', 'Tenant', 'Lessee']


def _crop_record_note():
    crops = ', '.join(CropType.objects.filter(is_active=True).order_by('name').values_list('name', flat=True)) or 'none set up yet'
    return (
        f'{CROP_RECORD_NOTE_PREFIX} one row per crop that is planted on this parcel. Crop: {crops}. Date Planted: the day it was planted (a date, '
        'not in the future). Area Planted (ha): more than 0. Variety is required. Crop Status: Owner, Tenant or Lessee; leave it blank to use '
        "the parcel's own ownership. Crop Owner Name: only for a Tenant or Lessee crop; leave it blank to use the parcel's land owner. "
        'Seed Source: one of the seed sources in Crop Settings, or any other text (recorded as Other). Fill in Qty of Seeds (kg) for a crop '
        'planted from seed, or Qty of Trees (a whole number) for trees; both are optional. Delete the sample row.'
    )


class ParcelCropRecordsTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _template_response('farm_parcel_crops_planted_import_template.xlsx', CROP_RECORD_HEADERS, CROP_RECORD_WIDTHS,
                                  CROP_RECORD_SAMPLE, _crop_record_note())


def _planting_date(text):
    for pattern in ('%Y-%m-%d', '%m/%d/%Y'):
        try:
            planted = datetime.strptime(text, pattern).date()
        except ValueError:
            continue
        if planted > date.today():
            raise ValueError('Date Planted cannot be in the future.')
        return planted
    raise ValueError(f'Date Planted "{text}" is not a date. Use a date such as 2026-09-15.')


def _whole_number(text, label):
    try:
        value = Decimal(text)
    except InvalidOperation:
        raise ValueError(f'{label} "{text}" is not a number.')
    if value < 0:
        raise ValueError(f'{label} cannot be negative.')
    if value != value.to_integral_value():
        raise ValueError(f'{label} "{text}" is not a whole number.')
    return int(value)


def parse_crop_record_cells(row, crops_by_name, seed_sources):
    """One crop from a row of cells as a dict for the form; a missing or invalid value raises ValueError with a sentence."""
    name, planted, area, variety, status, owner, seed, seeds, trees = (_text(row, i) for i in range(len(CROP_RECORD_HEADERS)))
    if not name:
        raise ValueError('Crop is required.')
    crop = crops_by_name.get(name.lower())
    if crop is None:
        raise ValueError(f'Crop "{name}" is not an active crop in Crop Settings.')
    if not planted:
        raise ValueError('Date Planted is required.')
    planted_on = _planting_date(planted)
    if not area:
        raise ValueError('Area Planted (ha) is required.')
    area_value = _decimal(area, 'Area planted', places=2, minimum_exclusive=Decimal(0))
    if not variety:
        raise ValueError('Variety is required.')
    land_status = _choice(status, LAND_STATUSES, 'Crop Status')
    seed_source, seed_other = '', ''
    if seed:
        known = seed_sources.get(seed.lower())
        seed_source, seed_other = (known, '') if known else ('Other', seed)
    quantity_of_seeds = _decimal(seeds, 'Qty of seeds', places=2) if seeds else None
    quantity_of_trees = _whole_number(trees, 'Qty of trees') if trees else None
    return {
        'crop_type': crop.id,
        'crop_name': crop.name,
        'date_planted': planted_on.isoformat(),
        'area_planted_ha': format(area_value.normalize(), 'f'),
        'variety_used': variety,
        'land_status': land_status,
        'land_owner_name': owner if land_status in ('Tenant', 'Lessee') else '',
        'seed_source': seed_source,
        'seed_source_other_specify': seed_other,
        'quantity_of_seeds': '' if quantity_of_seeds is None else format(quantity_of_seeds.normalize(), 'f'),
        'quantity_of_trees': '' if quantity_of_trees is None else str(quantity_of_trees),
    }


class ParcelCropRecordsParseView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        rows, failure = _read(file, CROP_RECORD_HEADERS, CROP_RECORD_SAMPLE, CROP_RECORD_NOTE_PREFIX, MAX_CROP_RECORD_ROWS)
        if failure:
            return failure
        crops_by_name = {c.name.lower(): c for c in CropType.objects.filter(is_active=True)}
        seed_sources = {s.name.lower(): s.name for s in SeedSource.objects.filter(is_active=True)}
        crops, errors = [], []
        for number, row in rows:
            try:
                crops.append({'row': number, **parse_crop_record_cells(row, crops_by_name, seed_sources)})
            except ValueError as exc:
                errors.append({'row': number, 'error': str(exc)})
        if errors:
            return Response({'error': ' '.join(f'Row {e["row"]}: {e["error"]}' for e in errors), 'errors': errors}, status=400)
        return Response({'crops': crops})
