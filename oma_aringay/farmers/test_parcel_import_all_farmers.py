"""The parcels file of MANY farmers (Crop Records > Import Farm Parcels): the farm parcels file with the farmer's RSBSA number first."""
from io import BytesIO

from django.contrib.auth import get_user_model
from openpyxl import load_workbook
from rest_framework.test import APITestCase

from core.models import ImportBatch, ImportBatchItem
from farmers.models import FarmCrop, FarmParcel
from farmers.parcel_import import ALL_HEADERS, PARCEL_HEADERS
from farmers.test_parcel_import import OTHER_NO, PARCEL_NO, crop_row, make_farmer, parcel_row, xlsx

IMPORT_URL = '/api/farmers/parcels/bulk-import/'
TEMPLATE_URL = '/api/farmers/parcels/bulk-import/template/'


def row(farmer_number, **over):
    return [farmer_number, *parcel_row(**over)]


class AllFarmersParcelImportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='af-adm', password='pw', role='ADMIN', email='afa@x.test')
        cls.citizen = User.objects.create_user(username='af-cit', password='pw', role='CITIZEN', email='afc@x.test')
        cls.rita = make_farmer('Rita')
        cls.sam = make_farmer('Sam')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, rows, dry_run=False, headers=None):
        body = {'file': xlsx(headers or ALL_HEADERS, rows)}
        if dry_run:
            body['dry_run'] = 'true'
        return self.client.post(IMPORT_URL, body, format='multipart')

    def test_the_header_is_the_parcel_file_with_the_farmer_first(self):
        self.assertEqual(ALL_HEADERS, ['Farmer RSBSA Number'] + PARCEL_HEADERS)

    def test_a_preview_names_each_rows_farmer_and_writes_nothing(self):
        r = self.post([row(self.rita.rsbsa_number), row(self.sam.rsbsa_number, number=OTHER_NO)], dry_run=True)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['summary']['ready'], 2)
        self.assertTrue(data['dry_run'])
        self.assertTrue(data['rows'][0]['label'].startswith('Rita Parcelimport — '), data['rows'][0]['label'])
        self.assertTrue(data['rows'][1]['label'].startswith('Sam Parcelimport — '))
        self.assertEqual(FarmParcel.objects.count(), 0)

    def test_one_file_creates_the_parcels_and_crops_of_several_farmers_as_one_undoable_batch(self):
        r = self.post([
            row(self.rita.rsbsa_number, crop=crop_row('Palay (Rice)', '1.5')),
            row(self.rita.rsbsa_number, crop=crop_row('Corn (Mais)', '1', main='No')),    # the same parcel again: a second crop
            row(self.sam.rsbsa_number, number=OTHER_NO, crop=crop_row('Onion', '1', main='Yes')),
        ])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['created'], 2)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.rita).count(), 1)
        self.assertEqual(FarmCrop.objects.filter(farm_parcel__farmer=self.rita).count(), 2)
        self.assertEqual(FarmParcel.objects.get(farmer=self.sam).parcel_number, OTHER_NO)
        batch = ImportBatch.objects.get()
        self.assertEqual(batch.import_type, 'farm_parcels')
        self.assertEqual(ImportBatchItem.objects.filter(batch=batch).count(), 5)   # 2 parcels + 3 crops

    def test_the_farmer_number_matches_whatever_the_dashes_or_case(self):
        typed = self.rita.rsbsa_number.replace('-', '')
        r = self.post([row(typed)])
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.rita).count(), 1)

    def test_the_same_parcel_number_for_two_farmers_is_two_parcels(self):
        r = self.post([row(self.rita.rsbsa_number), row(self.sam.rsbsa_number)])
        self.assertEqual(r.json()['created'], 2)
        self.assertEqual(FarmParcel.objects.filter(parcel_number=PARCEL_NO).count(), 2)

    def test_an_unknown_or_missing_farmer_skips_only_that_parcel(self):
        r = self.post([row('01-033-02-019-000001'), row(''), row(self.sam.rsbsa_number)])
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        self.assertEqual(data['created'], 1)
        errors = {e['row']: e['error'] for e in data['errors']}
        self.assertIn('No registered farmer has the RSBSA number 01-033-02-019-000001', errors[2])
        self.assertIn('Farmer RSBSA Number is required', errors[3])
        self.assertEqual(FarmParcel.objects.get().farmer_id, self.sam.id)

    def test_a_parcel_number_the_farmer_already_has_is_not_imported_again(self):
        FarmParcel.objects.create(farmer=self.rita, parcel_number=PARCEL_NO, area_hectares='1', land_ownership='Owner', barangay='Alaska')
        r = self.post([row(self.rita.rsbsa_number), row(self.sam.rsbsa_number)])
        data = r.json()
        self.assertEqual((data['summary']['duplicate_in_database'], data['summary']['ready'], data['created']), (1, 1, 1))

    def test_the_area_rules_still_apply(self):
        r = self.post([row(self.rita.rsbsa_number, area='1', crop=crop_row('Palay (Rice)', '1.5'))])
        self.assertEqual(r.json()['created'], 0)
        self.assertIn('bigger than its parcel', r.json()['errors'][0]['error'])

    def test_a_file_in_the_farmer_profile_format_is_refused(self):
        self.assertEqual(self.post([parcel_row()], headers=PARCEL_HEADERS).status_code, 400)
        self.assertEqual(self.client.post(IMPORT_URL, {}, format='multipart').status_code, 400)

    def test_the_template_has_the_farmer_column_and_its_sample_row_is_not_imported(self):
        r = self.client.get(TEMPLATE_URL)
        self.assertEqual(r.status_code, 200)
        sheet = load_workbook(BytesIO(r.content)).active
        self.assertEqual([c.value for c in sheet[1]], ALL_HEADERS)
        self.assertIn('first column is the RSBSA number of the farmer', sheet['A4'].value)
        from django.core.files.uploadedfile import SimpleUploadedFile
        upload = SimpleUploadedFile('t.xlsx', r.content, content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        again = self.client.post(IMPORT_URL, {'file': upload}, format='multipart')
        self.assertEqual(again.status_code, 200, again.content)
        self.assertEqual(again.json()['rows'], [])

    def test_staff_only(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.post([row(self.rita.rsbsa_number)]).status_code, 403)
        self.assertEqual(self.client.get(TEMPLATE_URL).status_code, 403)
