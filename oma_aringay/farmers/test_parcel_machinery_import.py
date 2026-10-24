"""The machinery file read by the Add Farm Parcels page: checked and handed back, nothing saved."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmMachinery
from farmers.parcel_machinery_import import MACHINERY_HEADERS
from farmers.test_parcel_import import xlsx

PARSE_URL = '/api/farmers/parcel-machinery/parse/'
TEMPLATE_URL = '/api/farmers/parcel-machinery/template/'


class ParcelMachineryImportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='pm-adm', password='pw', role='ADMIN', email='pma@x.test')
        cls.citizen = User.objects.create_user(username='pm-cit', password='pw', role='CITIZEN', email='pmc@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def parse(self, rows, headers=None):
        return self.client.post(PARSE_URL, {'file': xlsx(headers or MACHINERY_HEADERS, rows)}, format='multipart')

    def test_the_machinery_in_the_file_is_returned_and_nothing_is_saved(self):
        r = self.parse([
            ['Hand Tractor', '2', 'Owned', ''],
            ['four-wheel tractor', '1', 'rented', ''],
            ['Thresher', '', '', ''],
        ])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['machinery'], [
            {'machinery_type': 'Hand Tractor', 'machinery_type_other': '', 'quantity': 2, 'ownership': 'Owned'},
            {'machinery_type': 'Four-Wheel Tractor', 'machinery_type_other': '', 'quantity': 1, 'ownership': 'Rented'},
            {'machinery_type': 'Thresher', 'machinery_type_other': '', 'quantity': 1, 'ownership': 'Owned'},
        ])
        self.assertEqual(FarmMachinery.objects.count(), 0)

    def test_a_type_that_is_not_listed_is_recorded_as_other_with_its_text(self):
        r = self.parse([['Drone Sprayer', '1', 'Borrowed', ''], ['Other', '3', 'Owned', 'Seeder'], ['Water Pump', '1', 'Organization-Owned', '']])
        self.assertEqual(r.status_code, 200, r.content)
        lines = r.json()['machinery']
        self.assertEqual((lines[0]['machinery_type'], lines[0]['machinery_type_other']), ('Other', 'Drone Sprayer'))
        self.assertEqual((lines[1]['machinery_type'], lines[1]['machinery_type_other'], lines[1]['quantity']), ('Other', 'Seeder', 3))
        self.assertEqual(lines[2]['ownership'], 'Organization-Owned')

    def test_blank_rows_are_skipped(self):
        r = self.parse([['', '', '', ''], ['Sprayer', '1', 'Owned', ''], ['', '', '', '']])
        self.assertEqual([m['machinery_type'] for m in r.json()['machinery']], ['Sprayer'])

    def test_bad_rows_are_named_and_nothing_is_returned(self):
        r = self.parse([
            ['Sprayer', 'two', 'Owned', ''],          # row 2: not a number
            ['Thresher', '1.5', 'Owned', ''],         # row 3: not whole
            ['Harvester', '0', 'Owned', ''],          # row 4: below 1
            ['Rice Mill', '1', 'Leased', ''],         # row 5: unknown ownership
            ['Other', '1', 'Owned', ''],              # row 6: Other with no name
            ['', '2', 'Owned', ''],                   # row 7: no type
            ['Water Pump', '10000', 'Owned', ''],     # row 8: too many
        ])
        self.assertEqual(r.status_code, 400)
        errors = {e['row']: e['error'] for e in r.json()['errors']}
        self.assertEqual(sorted(errors), [2, 3, 4, 5, 6, 7, 8])
        self.assertIn('not a number', errors[2])
        self.assertIn('not a whole number', errors[3])
        self.assertIn('at least 1', errors[4])
        self.assertIn('Ownership "Leased" is not valid', errors[5])
        self.assertIn('Machinery Name', errors[6])
        self.assertIn('Machinery Type is required', errors[7])
        self.assertIn('9999', errors[8])
        self.assertIn('Row 2:', r.json()['error'])

    def test_a_file_with_the_wrong_columns_or_no_file_is_refused(self):
        self.assertEqual(self.parse([['x']], headers=['Wrong', 'Headers']).status_code, 400)
        self.assertEqual(self.client.post(PARSE_URL, {}, format='multipart').status_code, 400)

    def test_the_template_is_an_excel_file_with_the_columns_and_the_sample_row(self):
        r = self.client.get(TEMPLATE_URL)
        self.assertEqual(r.status_code, 200)
        self.assertIn('spreadsheetml', r['Content-Type'])
        from io import BytesIO
        from openpyxl import load_workbook
        sheet = load_workbook(BytesIO(r.content)).active
        self.assertEqual([c.value for c in sheet[1]], MACHINERY_HEADERS)
        self.assertEqual(sheet['A2'].value, 'Hand Tractor')

    def test_the_template_and_the_check_come_back_through_the_same_check(self):
        """The template's own sample row is a valid row, so downloading it and uploading it unchanged works."""
        from io import BytesIO
        from django.core.files.uploadedfile import SimpleUploadedFile
        content = self.client.get(TEMPLATE_URL).content
        upload = SimpleUploadedFile('t.xlsx', content, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        r = self.client.post(PARSE_URL, {'file': upload}, format='multipart')
        self.assertEqual(r.status_code, 200, r.content)

    def test_staff_only(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(TEMPLATE_URL).status_code, 403)
        self.assertEqual(self.client.post(PARSE_URL, {'file': xlsx(MACHINERY_HEADERS, [])}, format='multipart').status_code, 403)
