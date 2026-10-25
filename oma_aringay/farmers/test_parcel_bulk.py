"""POST /api/farmers/<id>/parcels/bulk/: several parcels (each with its crops and machinery) for one farmer, all or nothing."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropMonitoringRecord, CropType

from .models import FarmCrop, FarmMachinery, FarmParcel, Farmer, ParcelClassification

NO_1 = '01-33-02-005-001-02-003'
NO_2 = '01-33-02-005-001-02-004'
NO_3 = '01-33-02-005-001-02-005'
TAX_DEC = '01-002-00005-2023-0142'


def number(i):
    return f'01-33-02-005-001-02-{i:03d}'


def url(farmer):
    return f'/api/farmers/{farmer.id}/parcels/bulk/'


def parcel(number=NO_1, **over):
    # the parcel number, land ownership, farm type and cropping schedule are all required by the Add Farm Parcels form
    row = {'parcel_number': number, 'area_hectares': 1.5, 'barangay': 'Alaska', 'land_ownership': 'Owner', 'farm_type': 'Irrigated',
           'cropping_schedule': 'Single Cropping', 'classifications': [], 'tax_declaration_number': '', 'land_owner_name': '',
           'land_owner_rsbsa_number': '', 'crops': [], 'machinery': [], 'crop_records': []}
    row.update(over)
    return row


def crop(name='Palay (Rice)', **over):
    row = {'crop_name': name, 'crop_name_other': '', 'area_hectares': 1.0, 'is_main_crop': False, 'variety_used': '',
           'seed_source': 'Certified Seed', 'quantity_of_seeds_used': None, 'seeds_unit': 'kg', 'number_of_trees': None,
           'has_pcic_insurance': False}
    row.update(over)
    return row


def crop_record(crop_type, **over):
    """One Add Crop row (what the Add Crop page sends), without the farmer and the parcel: the endpoint fills those in."""
    row = {'crop_type': crop_type.id, 'land_status': 'Owner', 'season': 'Wet', 'year': 2026, 'date_planted': '2026-10-20',
           'area_planted_ha': '1.00', 'variety_used': 'Rc 222'}
    row.update(over)
    return row


def machine(kind='Hand Tractor', **over):
    row = {'machinery_type': kind, 'machinery_type_other': '', 'quantity': 1, 'ownership': 'Owned'}
    row.update(over)
    return row


class FarmParcelBulkTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.focal = User.objects.create_user(username='foc', password='pw', role='EVALUATOR', email='f@x.test')
        cls.citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000771', first_name='Ana', last_name='Lim', gender='Female', birthdate=date(1985, 3, 3),
            barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, rows, farmer=None):
        return self.client.post(url(farmer or self.farmer), rows, format='json')

    # --- access
    def test_only_staff_can_use_it_and_the_farmer_must_exist(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.post([parcel()]).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.post([parcel()]).status_code, 401)
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.post([parcel(NO_1)]).status_code, 201)
        self.assertEqual(self.client.post('/api/farmers/999999/parcels/bulk/', [parcel()], format='json').status_code, 404)

    # --- saving
    def test_several_parcels_with_their_crops_and_machinery_are_saved_together(self):
        r = self.post([
            parcel(NO_1, classifications=['Organic Farm'], farm_type='Irrigated', cropping_schedule='Double Cropping',
                   crops=[crop('Palay (Rice)', is_main_crop=True, area_hectares=1.0, has_pcic_insurance=True), crop('Onion', area_hectares=0.5)],
                   machinery=[machine('Hand Tractor', quantity=2)]),
            parcel(NO_2, area_hectares=2.25, land_ownership='Tenant', land_owner_name='Juan Dela Cruz', crops=[]),
            parcel(NO_3, area_hectares=0.75),
        ])
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual(len(body), 3)
        first = FarmParcel.objects.get(pk=body[0]['id'])
        self.assertEqual((first.farmer_id, first.parcel_number, first.farm_type, first.classifications), (self.farmer.id, NO_1, 'Irrigated', ['Organic Farm']))
        crops = list(first.crops.order_by('id'))
        self.assertEqual([c.crop_name for c in crops], ['Palay (Rice)', 'Onion'])
        self.assertEqual([c.id for c in crops], body[0]['crop_ids'])          # ids in the order they were sent (for the PCIC photos)
        self.assertEqual([c.has_pcic_insurance for c in crops], [True, False])
        self.assertEqual(first.machinery.get().quantity, 2)
        first.refresh_from_db()
        self.assertEqual(first.commodity_name, 'Palay (Rice)')                 # the existing crop signal still runs
        self.assertEqual(FarmParcel.objects.get(pk=body[1]['id']).land_owner_name, 'Juan Dela Cruz')
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 3)

    def test_one_bad_row_saves_nothing_and_the_errors_line_up_with_the_rows(self):
        r = self.post([
            parcel(NO_1, crops=[crop()]),
            parcel(NO_2, area_hectares='abc', crops=[crop(), crop(area_hectares=-3)], machinery=[machine(quantity=0)]),
            parcel('not-a-number'),
        ])
        self.assertEqual(r.status_code, 400)
        errors = r.json()['errors']
        self.assertEqual(len(errors), 3)
        self.assertEqual(errors[0], {})
        self.assertIn('area_hectares', errors[1])
        self.assertEqual(errors[1]['crops'][0], {})
        self.assertIn('area_hectares', errors[1]['crops'][1])
        self.assertIn('quantity', errors[1]['machinery'][0])
        self.assertIn('parcel_number', errors[2])
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())
        self.assertFalse(FarmCrop.objects.exists())
        self.assertFalse(FarmMachinery.objects.exists())

    def test_a_failure_while_saving_rolls_everything_back(self):
        # the view is called directly: a server error through the test client trips a Python 3.14 bug in Django's error page
        from unittest import mock
        from rest_framework.test import APIRequestFactory, force_authenticate
        from .parcel_bulk import FarmParcelBulkCreateView
        request = APIRequestFactory().post(url(self.farmer), [parcel(NO_1, crops=[crop()], machinery=[machine()])], format='json')
        force_authenticate(request, user=self.admin)
        with mock.patch('farmers.parcel_bulk.FarmMachinery.objects.create', side_effect=RuntimeError('boom')):
            with self.assertRaises(RuntimeError):
                FarmParcelBulkCreateView.as_view()(request, farmer_id=self.farmer.id)
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())
        self.assertFalse(FarmCrop.objects.exists())

    # --- rules across the rows
    def test_the_same_parcel_number_twice_or_one_the_farmer_already_has_is_refused(self):
        FarmParcel.objects.create(farmer=self.farmer, parcel_number=NO_2, area_hectares='1.00', barangay='Alaska')
        r = self.post([parcel(NO_1), parcel(NO_1), parcel(NO_2)])
        self.assertEqual(r.status_code, 400)
        errors = r.json()['errors']
        self.assertEqual(errors[0], {})
        self.assertIn('parcel_number', errors[1])       # the second use of NO_1 in this form
        self.assertIn('parcel_number', errors[2])       # NO_2 is already on file
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 1)

    def test_the_number_ownership_farm_type_and_schedule_are_required(self):
        for field, blank in (('parcel_number', ''), ('land_ownership', ''), ('farm_type', ''), ('cropping_schedule', ''), ('parcel_number', '   ')):
            r = self.post([parcel(NO_1, **{field: blank})])
            self.assertEqual(r.status_code, 400, field)
            self.assertIn(field, r.json()['errors'][0], field)
        row = parcel(NO_1)
        del row['farm_type']
        self.assertIn('farm_type', self.post([row]).json()['errors'][0])      # left out altogether
        self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists())
        self.assertEqual(self.post([parcel(NO_1)]).status_code, 201)

    def test_a_tax_declaration_needs_the_parcel_number(self):
        r = self.post([parcel('', tax_declaration_number=TAX_DEC)])
        self.assertEqual(r.status_code, 400)
        self.assertIn('parcel_number', r.json()['errors'][0])

    def test_only_one_main_crop_per_parcel(self):
        r = self.post([parcel(NO_1, crops=[crop(is_main_crop=True), crop('Onion', is_main_crop=True)])])
        self.assertEqual(r.status_code, 400)
        self.assertIn('crops', r.json()['errors'][0])

    def test_classifications_must_be_offered(self):
        r = self.post([parcel(NO_1, classifications=['Made Up'])])
        self.assertEqual(r.status_code, 400)
        self.assertIn('classifications', r.json()['errors'][0])
        ParcelClassification.objects.filter(name='Organic Farm').delete()
        self.assertEqual(self.post([parcel(NO_1, classifications=['Organic Farm'])]).status_code, 400)

    # --- the shape of the request
    def test_the_request_must_be_a_list_of_one_to_fifty_parcels(self):
        for body in ([], {}, 'x', None):
            self.assertEqual(self.post(body).status_code, 400, body)
        self.assertEqual(self.post([parcel(number(i)) for i in range(51)]).status_code, 400)
        self.assertEqual(self.post([parcel(number(i)) for i in range(50)]).status_code, 201)
        self.assertEqual(self.post(['not a parcel']).status_code, 400)

    def test_nested_crops_and_machinery_must_be_lists(self):
        r = self.post([parcel(NO_1, crops='Palay')])
        self.assertEqual(r.status_code, 400)
        self.assertIn('crops', r.json()['errors'][0])

    # --- the crops of a parcel are crop records, exactly as on the Add Crop page
    def test_crops_are_saved_as_planted_crop_records_on_the_new_parcel(self):
        rice = CropType.objects.create(name='Bulk Rice', days_to_harvest=110)
        mango = CropType.objects.create(name='Bulk Mango', days_to_harvest=120, planting_type='Tree')
        r = self.post([
            parcel(NO_1, area_hectares=3, barangay='Basca', crop_records=[
                crop_record(rice, quantity_of_seeds='25'),
                crop_record(mango, variety_used='Carabao', quantity_of_trees=40, farm_location_barangay='Alaska'),
            ]),
            parcel(NO_2, crop_records=[crop_record(rice, land_status='Tenant', land_owner_name='Rosa Landlord', area_planted_ha='0.50')]),
        ])
        self.assertEqual(r.status_code, 201, r.content)
        body = r.json()
        self.assertEqual([len(p['crop_record_ids']) for p in body], [2, 1])
        records = list(CropMonitoringRecord.objects.filter(farm_parcel_id=body[0]['id']).order_by('id'))
        self.assertEqual([x.id for x in records], body[0]['crop_record_ids'])
        self.assertEqual({(x.farmer_id, x.farm_location_barangay) for x in records}, {(self.farmer.id, 'Basca')})   # the parcel's barangay, whatever was sent
        self.assertEqual([(x.crop_type_id, x.planting_material, x.status) for x in records], [(rice.id, 'Seed', 'Planted'), (mango.id, 'Tree', 'Planted')])
        tenant = CropMonitoringRecord.objects.get(pk=body[1]['crop_record_ids'][0])
        self.assertEqual((tenant.land_status, tenant.land_owner_name, tenant.farm_parcel_id), ('Tenant', 'Rosa Landlord', body[1]['id']))
        self.assertFalse(FarmCrop.objects.exists())                         # no separate declared crops

    def test_a_crop_record_follows_the_add_crop_rules_and_one_bad_one_saves_nothing(self):
        rice = CropType.objects.create(name='Rule Rice', days_to_harvest=110)
        for label, bad, field in (
            ('variety is required', crop_record(rice, variety_used=''), 'variety_used'),
            ('a tenant crop needs its owner', crop_record(rice, land_status='Tenant'), 'land_owner_name'),
            ('a crop is not bigger than its parcel', crop_record(rice, area_planted_ha='9.00'), 'area_planted_ha'),
            ('a seed crop is planted as seed', crop_record(rice, planting_material='Tree', quantity_of_trees=3), 'planting_material'),
        ):
            r = self.post([parcel(NO_1, crop_records=[crop_record(rice, variety_used='Other', area_planted_ha='0.50'), bad]), parcel(NO_2)])
            self.assertEqual(r.status_code, 400, label)
            errors = r.json()['errors']
            self.assertEqual(len(errors), 2, label)
            self.assertEqual(errors[0]['crop_records'][0], {}, label)
            self.assertIn(field, errors[0]['crop_records'][1], label)
            self.assertEqual(errors[1], {}, label)
            self.assertFalse(FarmParcel.objects.filter(farmer=self.farmer).exists(), label)     # not even the parcels
            self.assertFalse(CropMonitoringRecord.objects.exists(), label)

    def test_the_crops_of_one_parcel_must_fit_it_together_and_not_repeat(self):
        rice = CropType.objects.create(name='Fit Rice', days_to_harvest=110)
        r = self.post([parcel(NO_1, area_hectares=1.5, crop_records=[
            crop_record(rice, variety_used='A', area_planted_ha='1.00'), crop_record(rice, variety_used='B', area_planted_ha='1.00')])])
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['errors'][0]['crop_records'][0], {})
        self.assertIn('area_planted_ha', r.json()['errors'][0]['crop_records'][1])         # the one that tips the parcel over
        r = self.post([parcel(NO_1, crop_records=[crop_record(rice, area_planted_ha='0.50'), crop_record(rice, area_planted_ha='0.50')])])
        self.assertEqual(r.status_code, 400)
        self.assertIn('crop_type', r.json()['errors'][0]['crop_records'][1])               # the same crop and variety twice on a parcel
        self.assertFalse(CropMonitoringRecord.objects.exists())

    def test_crop_records_must_be_a_list_of_records(self):
        r = self.post([parcel(NO_1, crop_records='Palay')])
        self.assertEqual(r.status_code, 400)
        self.assertIn('crop_records', r.json()['errors'][0])

    def test_another_farmers_parcel_numbers_do_not_clash(self):
        other = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000772', first_name='Ben', last_name='Ruiz', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Alaska', civil_status='Single')
        FarmParcel.objects.create(farmer=other, parcel_number=NO_1, area_hectares='1.00', barangay='Alaska')
        self.assertEqual(self.post([parcel(NO_1)]).status_code, 201)
        self.assertEqual(FarmParcel.objects.filter(farmer=other).count(), 1)
