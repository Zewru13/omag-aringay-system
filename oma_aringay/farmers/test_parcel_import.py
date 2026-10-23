"""Farm parcel imports: the crops file read by the Add Farm Parcel wizard, and the parcels file imported from a farmer's profile."""
import itertools
from datetime import date
from io import BytesIO

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from openpyxl import Workbook
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.import_undo import build_plan, execute_items
from core.models import ImportBatch, ImportBatchItem
from farmers.models import FarmCrop, FarmMachinery, FarmParcel, Farmer
from farmers.parcel_import import CROP_HEADERS, PARCEL_HEADERS
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(990001)
PARCEL_NO = '01-33-02-005-001-02-003'
OTHER_NO = '01-33-02-006-002-01-004'


def make_farmer(first='Rita'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Parcelimport', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def xlsx(headers, rows, name='file.xlsx'):
    book = Workbook()
    sheet = book.active
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    buffer = BytesIO()
    book.save(buffer)
    return SimpleUploadedFile(name, buffer.getvalue(),
                              content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')


def crop_row(name='Palay (Rice)', area='1.5', main='Yes', variety='NSIC Rc 222', seed='Certified Seed', qty='40', unit='kg', trees=''):
    return [name, area, main, variety, seed, qty, unit, trees]


def parcel_row(number=PARCEL_NO, area='2.5', barangay='Alaska', ownership='Owner', owner='', owner_rsbsa='', tax='',
               farm_type='Irrigated', organic='No', ancestral='No', arb='No', schedule='Double Cropping', crop=None):
    return [number, area, barangay, ownership, owner, owner_rsbsa, tax, farm_type, organic, ancestral, arb, schedule,
            *(crop if crop is not None else crop_row())]


class CropsFileTests(APITestCase):
    URL = '/api/farmers/parcel-crops/parse/'
    TEMPLATE = '/api/farmers/parcel-crops/template/'

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pc-admin', password='pw', role='ADMIN', email='pc-admin@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, rows, headers=CROP_HEADERS):
        return self.client.post(self.URL, {'file': xlsx(headers, rows)}, format='multipart')

    def test_valid_rows_come_back_as_crops_ready_for_the_form(self):
        res = self.post([crop_row(), crop_row('Mango', '0.5', 'No', '', 'Other', '', '', '12')])
        self.assertEqual(res.status_code, 200, res.content)
        crops = res.json()['crops']
        self.assertEqual(len(crops), 2)
        self.assertEqual(crops[0], {
            'crop_name': 'Palay (Rice)', 'crop_name_other': '', 'area_hectares': 1.5, 'is_main_crop': True,
            'variety_used': 'NSIC Rc 222', 'seed_source': 'Certified Seed', 'quantity_of_seeds_used': 40.0, 'seeds_unit': 'kg',
            'number_of_trees': None})
        self.assertEqual((crops[1]['crop_name'], crops[1]['is_main_crop'], crops[1]['number_of_trees'], crops[1]['seed_source']),
                         ('Mango', False, 12, 'Other'))

    def test_a_crop_name_outside_the_list_is_kept_as_other_with_the_typed_text(self):
        crops = self.post([crop_row('Dragon fruit', main='No')]).json()['crops']
        self.assertEqual((crops[0]['crop_name'], crops[0]['crop_name_other']), ('Other', 'Dragon fruit'))

    def test_names_match_without_regard_to_case_and_blank_optional_cells_are_fine(self):
        crops = self.post([crop_row('palay (rice)', '2', '', '', '', '', '', '')]).json()['crops']
        self.assertEqual((crops[0]['crop_name'], crops[0]['is_main_crop'], crops[0]['seed_source'], crops[0]['quantity_of_seeds_used']),
                         ('Palay (Rice)', False, '', None))

    def test_seeds_quantity_without_a_unit_is_in_kg(self):
        crops = self.post([crop_row(qty='25', unit='')]).json()['crops']
        self.assertEqual(crops[0]['seeds_unit'], 'kg')

    def test_any_bad_row_refuses_the_whole_file_and_names_the_rows(self):
        res = self.post([crop_row(), crop_row('Onion', 'abc', 'No'), crop_row('Garlic', '1', 'Maybe'), crop_row('Corn (Mais)', '1', 'No', seed='Magic Beans')])
        self.assertEqual(res.status_code, 400)
        data = res.json()
        self.assertNotIn('crops', data)
        self.assertEqual([e['row'] for e in data['errors']], [3, 4, 5])
        self.assertIn('Row 3', data['error'])
        self.assertIn('area', data['errors'][0]['error'].lower())
        self.assertIn('yes or no', data['errors'][1]['error'].lower())
        self.assertIn('seed source', data['errors'][2]['error'].lower())

    def test_area_must_be_more_than_zero(self):
        res = self.post([crop_row(area='0')])
        self.assertEqual(res.status_code, 400)

    def test_two_main_crops_are_refused(self):
        res = self.post([crop_row(), crop_row('Onion', '1', 'Yes')])
        self.assertEqual(res.status_code, 400)
        self.assertIn('main crop', res.json()['error'].lower())

    def test_a_file_from_another_template_is_refused(self):
        res = self.post([['x', 'y']], headers=['Something', 'Else'])
        self.assertEqual(res.status_code, 400)
        self.assertIn('template', res.json()['error'].lower())

    def test_no_file_is_a_400(self):
        self.assertEqual(self.client.post(self.URL, {}, format='multipart').status_code, 400)

    def test_the_template_downloads_and_its_untouched_sample_row_is_not_imported(self):
        res = self.client.get(self.TEMPLATE)
        self.assertEqual(res.status_code, 200)
        self.assertIn('spreadsheetml', res['Content-Type'])
        upload = SimpleUploadedFile('t.xlsx', res.content, content_type=res['Content-Type'])
        parsed = self.client.post(self.URL, {'file': upload}, format='multipart')
        self.assertEqual(parsed.status_code, 200, parsed.content)
        self.assertEqual(parsed.json()['crops'], [])

    def test_only_staff_may_use_it(self):
        citizen = get_user_model().objects.create_user(username='pc-farmer', password='pw', role='CITIZEN', email='pc-farmer@x.test')
        self.client.force_authenticate(citizen)
        self.assertEqual(self.client.post(self.URL, {'file': xlsx(CROP_HEADERS, [crop_row()])}, format='multipart').status_code, 403)
        self.assertEqual(self.client.get(self.TEMPLATE).status_code, 403)


class ParcelImportTests(APITestCase):
    TEMPLATE = '/api/farmers/parcels/import/template/'

    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pi-admin', password='pw', role='ADMIN', email='pi-admin@x.test')
        cls.farmer = make_farmer()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def url(self, farmer=None):
        return f'/api/farmers/{(farmer or self.farmer).id}/parcels/import/'

    def post(self, rows, dry_run=False, farmer=None):
        data = {'file': xlsx(PARCEL_HEADERS, rows)}
        if dry_run:
            data['dry_run'] = 'true'
        return self.client.post(self.url(farmer), data, format='multipart')

    def test_the_header_is_one_row_per_crop_with_the_parcel_columns_first(self):
        self.assertEqual(PARCEL_HEADERS[:3], ['Parcel Number', 'Area (ha)', 'Barangay'])
        self.assertEqual(PARCEL_HEADERS[12:], CROP_HEADERS)
        self.assertNotIn('Farm Status', PARCEL_HEADERS)

    def test_a_preview_reports_every_row_and_writes_nothing(self):
        res = self.post([parcel_row(), parcel_row(crop=crop_row('Onion', '1', 'No', '', '', '', '', ''))], dry_run=True)
        self.assertEqual(res.status_code, 200, res.content)
        data = res.json()
        self.assertTrue(data['dry_run'])
        self.assertEqual((data['created'], data['summary']['ready']), (0, 2))
        self.assertEqual([r['status'] for r in data['rows']], ['ready', 'ready'])
        self.assertEqual([r['row'] for r in data['rows']], [2, 3])
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())
        self.assertFalse(ImportBatch.objects.exists())

    def test_rows_with_the_same_parcel_number_become_one_parcel_with_all_its_crops(self):
        res = self.post([parcel_row(), parcel_row(crop=crop_row('Onion', '1', 'No', '', '', '', '', ''))])
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(res.json()['created'], 1)
        parcel = FarmParcel.objects.get(farmer=self.farmer)
        self.assertEqual((parcel.parcel_number, str(parcel.area_hectares), parcel.barangay, parcel.farm_type, parcel.cropping_schedule),
                         (PARCEL_NO, '2.50', 'Alaska', 'Irrigated', 'Double Cropping'))
        self.assertEqual(sorted(parcel.crops.values_list('crop_name', flat=True)), ['Onion', 'Palay (Rice)'])
        self.assertEqual(parcel.commodity_name, 'Palay (Rice)')       # the main crop, set by the existing crop signal
        main = parcel.crops.get(crop_name='Palay (Rice)')
        self.assertEqual((main.is_main_crop, str(main.quantity_of_seeds_used), main.seeds_unit, main.variety_used), (True, '40.00', 'kg', 'NSIC Rc 222'))

    def test_classification_and_land_owner_columns_are_saved(self):
        self.post([parcel_row(ownership='Tenant', owner='Juan Dela Cruz', owner_rsbsa='01-33-02-014-058212', tax='01-002-00005-2023-0142',
                              organic='Yes', ancestral='yes', arb='Y')])
        parcel = FarmParcel.objects.get(farmer=self.farmer)
        self.assertEqual((parcel.land_ownership, parcel.land_owner_name, parcel.land_owner_rsbsa_number, parcel.tax_declaration_number),
                         ('Tenant', 'Juan Dela Cruz', '01-33-02-014-058212', '01-002-00005-2023-0142'))
        self.assertEqual((parcel.is_organic, parcel.within_ancestral_domain, parcel.is_agrarian_reform_beneficiary), (True, True, True))

    def test_a_parcel_without_crops_is_one_row_with_the_crop_cells_blank(self):
        res = self.post([parcel_row(crop=['', '', '', '', '', '', '', ''])])
        self.assertEqual(res.json()['created'], 1)
        self.assertEqual(FarmParcel.objects.get(farmer=self.farmer).crops.count(), 0)

    def test_rows_with_no_parcel_number_are_separate_parcels(self):
        res = self.post([parcel_row(number=''), parcel_row(number='', barangay='Basca')])
        self.assertEqual(res.json()['created'], 2)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 2)

    def test_a_parcel_number_the_farmer_already_has_is_skipped_but_another_farmers_is_fine(self):
        FarmParcel.objects.create(farmer=self.farmer, parcel_number=PARCEL_NO, area_hectares='1.00', land_ownership='Owner', barangay='Alaska')
        other = make_farmer('Other')
        FarmParcel.objects.create(farmer=other, parcel_number=OTHER_NO, area_hectares='1.00', land_ownership='Owner', barangay='Alaska')
        res = self.post([parcel_row(), parcel_row(number=OTHER_NO)])
        data = res.json()
        self.assertEqual([r['status'] for r in data['rows']], ['duplicate_in_database', 'ready'])
        self.assertEqual(data['created'], 1)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 2)

    def test_rows_of_one_parcel_that_disagree_are_all_skipped(self):
        res = self.post([parcel_row(), parcel_row(area='9.9', crop=crop_row('Onion', '1', 'No', '', '', '', '', ''))])
        data = res.json()
        self.assertEqual([r['status'] for r in data['rows']], ['duplicate_in_file', 'duplicate_in_file'])
        self.assertIn('different', data['rows'][0]['detail'].lower())
        self.assertEqual(data['created'], 0)
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())

    def test_a_tenant_needs_the_land_owner_name_and_bad_values_are_invalid_rows(self):
        res = self.post([
            parcel_row(ownership='Tenant'),
            parcel_row(number=OTHER_NO, barangay='Atlantis'),
            parcel_row(number='01-33-02-007-001-01-001', area='abc'),
            parcel_row(number='01-33-02-008-001-01-001', farm_type='Swamp'),
            parcel_row(number='not-a-number'),
            parcel_row(number='01-33-02-009-001-01-001', tax='01-002-00005-2023-0142', crop=['', '', '', '', '', '', '', '']),
            parcel_row(number='01-33-02-010-001-01-001', organic='maybe'),
        ])
        data = res.json()
        statuses = [r['status'] for r in data['rows']]
        self.assertEqual(statuses, ['invalid', 'invalid', 'invalid', 'invalid', 'invalid', 'ready', 'invalid'])
        details = ' | '.join(r['detail'].lower() for r in data['rows'])
        for word in ('land owner', 'barangay', 'area', 'farm type', 'parcel number', 'yes or no'):
            self.assertIn(word, details)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 1)

    def test_a_bad_crop_row_skips_its_whole_parcel(self):
        res = self.post([parcel_row(), parcel_row(crop=crop_row('Onion', 'abc', 'No', '', '', '', '', ''))])
        self.assertEqual([r['status'] for r in res.json()['rows']], ['invalid', 'invalid'])
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())

    def test_two_main_crops_on_one_parcel_are_invalid(self):
        res = self.post([parcel_row(), parcel_row(crop=crop_row('Onion', '1', 'Yes', '', '', '', '', ''))])
        self.assertEqual([r['status'] for r in res.json()['rows']], ['invalid', 'invalid'])
        self.assertIn('main crop', res.json()['rows'][0]['detail'].lower())

    def test_a_file_from_another_template_is_refused(self):
        upload = xlsx(['Something', 'Else'], [['x', 'y']])
        res = self.client.post(self.url(), {'file': upload}, format='multipart')
        self.assertEqual(res.status_code, 400)

    def test_the_template_downloads_and_its_sample_row_is_not_imported(self):
        res = self.client.get(self.TEMPLATE)
        self.assertEqual(res.status_code, 200)
        upload = SimpleUploadedFile('t.xlsx', res.content, content_type=res['Content-Type'])
        parsed = self.client.post(self.url(), {'file': upload}, format='multipart')
        self.assertEqual(parsed.status_code, 200, parsed.content)
        self.assertEqual(parsed.json()['rows'], [])

    def test_only_staff_may_import(self):
        citizen = get_user_model().objects.create_user(username='pi-farmer', password='pw', role='CITIZEN', email='pi-farmer@x.test')
        UserLinkedRecord.objects.create(user=citizen, record_type='FARMER', record_id=self.farmer.id, is_active=True)
        self.client.force_authenticate(citizen)
        self.assertEqual(self.post([parcel_row()]).status_code, 403)
        self.assertEqual(self.client.get(self.TEMPLATE).status_code, 403)

    def test_the_import_is_one_undoable_batch(self):
        self.post([parcel_row(), parcel_row(crop=crop_row('Onion', '1', 'No', '', '', '', '', ''))])
        batch = ImportBatch.objects.get()
        self.assertEqual((batch.import_type, batch.performed_by_id, batch.row_count), ('farm_parcels', self.admin.id, 3))
        labels = list(batch.items.order_by('id').values_list('model_label', flat=True))
        self.assertEqual(labels, ['farmers.farmparcel', 'farmers.farmcrop', 'farmers.farmcrop'])      # the parcel, then its crops


class ParcelImportUndoTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pu-admin', password='pw', role='ADMIN', email='pu-admin@x.test')
        cls.farmer = make_farmer('Undo')

    def setUp(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post(f'/api/farmers/{self.farmer.id}/parcels/import/',
                               {'file': xlsx(PARCEL_HEADERS, [parcel_row(), parcel_row(crop=crop_row('Onion', '1', 'No', '', '', '', '', ''))])},
                               format='multipart')
        self.assertEqual(res.status_code, 200, res.content)
        self.batch = ImportBatch.objects.get()
        self.parcel = FarmParcel.objects.get(farmer=self.farmer)

    def undo_all(self):
        return execute_items(self.batch, [i.id for i in self.batch.items.all()], self.admin)

    def test_undo_removes_the_parcel_and_its_crops(self):
        self.assertTrue(all(item.can_undo for item in build_plan(self.batch)))
        self.undo_all()
        self.assertFalse(FarmParcel.objects.filter(pk=self.parcel.pk).exists())
        self.assertEqual(FarmCrop.objects.count(), 0)

    def test_undo_keeps_a_parcel_that_was_edited_after_the_import(self):
        FarmParcel.objects.filter(pk=self.parcel.pk).update(area_hectares='3.00')
        self.undo_all()
        self.assertTrue(FarmParcel.objects.filter(pk=self.parcel.pk).exists())

    def test_undo_keeps_a_parcel_that_got_machinery_afterwards(self):
        FarmMachinery.objects.create(farm_parcel=self.parcel, machinery_type='Hand Tractor', quantity=1, ownership='Owned')
        self.undo_all()
        self.assertTrue(FarmParcel.objects.filter(pk=self.parcel.pk).exists())
        self.assertTrue(FarmMachinery.objects.exists())

    def test_undo_keeps_a_parcel_when_a_crop_was_added_or_changed_afterwards(self):
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Garlic', area_hectares='0.2')
        self.undo_all()
        self.assertTrue(FarmParcel.objects.filter(pk=self.parcel.pk).exists())
        self.assertTrue(FarmCrop.objects.filter(crop_name='Garlic').exists())

    def test_undo_keeps_a_parcel_that_has_crop_monitoring_records(self):
        CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner',
            crop_type=CropType.objects.order_by('id').first(), season='Wet', year=2026, date_planted=date(2026, 5, 1),
            area_planted_ha='1.00', status='Planted')
        self.undo_all()
        self.assertTrue(FarmParcel.objects.filter(pk=self.parcel.pk).exists())
        reason = ImportBatchItem.objects.get(model_label='farmers.farmparcel').kept_reason
        self.assertIn('crop records', reason.lower())
