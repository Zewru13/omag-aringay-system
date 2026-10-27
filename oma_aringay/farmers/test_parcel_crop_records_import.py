"""The crops file read by Add Farm Parcels: one row per crop that is planted on the parcel, checked and handed back to the form
(nothing is saved here; the crops are saved with the parcel)."""
from datetime import date, timedelta
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook, load_workbook
from rest_framework.test import APITestCase

from farmers.parcel_crop_records_import import CROP_RECORD_HEADERS
from production.models import CropType, SeedSource

URL = '/api/farmers/parcel-crop-records/parse/'
TEMPLATE = '/api/farmers/parcel-crop-records/template/'
LONG_AGO = (date.today() - timedelta(days=30)).isoformat()


def xlsx(headers, rows, name='crops.xlsx'):
    book = Workbook()
    sheet = book.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    book.save(buffer)
    return SimpleUploadedFile(name, buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


def line(crop='Parcel Rice', planted=LONG_AGO, area='1.5', variety='NSIC Rc 222', status='', owner='', seed='', seeds='', trees=''):
    return [crop, planted, area, variety, status, owner, seed, seeds, trees]


class ParcelCropRecordsImportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pcr-admin', password='pw', role='ADMIN', email='pcr@x.test')
        cls.rice = CropType.objects.create(name='Parcel Rice', days_to_harvest=120)
        cls.mango = CropType.objects.create(name='Parcel Mango', days_to_harvest=1000, planting_type='Tree')
        cls.old = CropType.objects.create(name='Parcel Retired', days_to_harvest=90, is_active=False)
        SeedSource.objects.create(name='Certified Seed')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, rows, headers=CROP_RECORD_HEADERS):
        return self.client.post(URL, {'file': xlsx(headers, rows)}, format='multipart')

    def test_valid_rows_come_back_as_crops_ready_for_the_form(self):
        res = self.post([line(status='Tenant', owner='Rosa Reyes', seed='certified seed', seeds='40'), line('parcel mango', area='0.5', variety='Carabao', trees='12')])
        self.assertEqual(res.status_code, 200, res.content)
        crops = res.json()['crops']
        self.assertEqual(crops[0], {
            'row': 2, 'crop_type': self.rice.id, 'crop_name': 'Parcel Rice', 'date_planted': LONG_AGO, 'area_planted_ha': '1.5',
            'variety_used': 'NSIC Rc 222', 'land_status': 'Tenant', 'land_owner_name': 'Rosa Reyes',
            'seed_source': 'Certified Seed', 'seed_source_other_specify': '', 'quantity_of_seeds': '40', 'quantity_of_trees': ''})
        self.assertEqual((crops[1]['crop_type'], crops[1]['quantity_of_trees'], crops[1]['quantity_of_seeds']), (self.mango.id, '12', ''))

    def test_a_blank_status_is_left_for_the_parcel_to_decide(self):
        crops = self.post([line()]).json()['crops']
        self.assertEqual((crops[0]['land_status'], crops[0]['land_owner_name']), ('', ''))

    def test_a_seed_source_outside_the_list_is_kept_as_other_with_the_typed_text(self):
        crops = self.post([line(seed='Neighbor')]).json()['crops']
        self.assertEqual((crops[0]['seed_source'], crops[0]['seed_source_other_specify']), ('Other', 'Neighbor'))

    def test_a_real_date_cell_is_read(self):
        crops = self.post([line(planted=date.today() - timedelta(days=10))]).json()['crops']
        self.assertEqual(crops[0]['date_planted'], (date.today() - timedelta(days=10)).isoformat())

    def test_a_slash_date_is_read(self):
        planted = date.today() - timedelta(days=10)
        crops = self.post([line(planted=planted.strftime('%m/%d/%Y'))]).json()['crops']
        self.assertEqual(crops[0]['date_planted'], planted.isoformat())

    def test_each_bad_row_is_named_and_nothing_is_returned(self):
        res = self.post([
            line('Dragon fruit'),                                   # not in Crop Settings
            line('Parcel Retired'),                                   # switched off in Crop Settings
            line(planted=(date.today() + timedelta(days=3)).isoformat()),
            line(planted='soon'),
            line(area='0'),
            line(area='abc'),
            line(variety=''),
            line(status='Squatter'),
            line(seeds='-2'),
            line(trees='1.5'),
        ])
        self.assertEqual(res.status_code, 400, res.content)
        errors = res.json()['errors']
        self.assertEqual([e['row'] for e in errors], list(range(2, 12)))
        text = ' '.join(e['error'] for e in errors)
        for word in ('Crop Settings', 'future', 'date', 'more than 0', 'number', 'Variety', 'Crop Status', 'negative', 'whole number'):
            self.assertIn(word, text)
        self.assertNotIn('crops', res.json())

    def test_a_row_with_only_some_cells_filled_in_is_refused(self):
        res = self.post([['Parcel Rice', '', '', '', '', '', '', '', '']])
        self.assertEqual(res.status_code, 400, res.content)

    def test_the_template_is_the_same_file_the_parser_reads(self):
        res = self.client.get(TEMPLATE)
        self.assertEqual(res.status_code, 200)
        sheet = load_workbook(BytesIO(res.content)).active
        self.assertEqual([c.value for c in sheet[1]], CROP_RECORD_HEADERS)
        upload = SimpleUploadedFile('t.xlsx', res.content, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        # an untouched template has only its sample row, which is skipped: nothing to add
        res = self.client.post(URL, {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['crops'], [])

    def test_a_file_from_another_template_is_refused(self):
        res = self.client.post(URL, {'file': xlsx(['Machinery Type', 'Quantity'], [['Hand Tractor', 1]])}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_citizens_cannot_read_a_crops_file(self):
        citizen = get_user_model().objects.create_user(username='pcr-cit', password='pw', role='CITIZEN', email='pcrc@x.test')
        self.client.force_authenticate(citizen)
        self.assertIn(self.post([line()]).status_code, (401, 403))
