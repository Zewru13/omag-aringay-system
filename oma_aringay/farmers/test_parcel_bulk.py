"""POST /api/farmers/<id>/parcels/bulk/: several parcels (each with its crops and machinery) for one farmer, all or nothing."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import FarmCrop, FarmMachinery, FarmParcel, Farmer, ParcelClassification

NO_1 = '01-33-02-005-001-02-003'
NO_2 = '01-33-02-005-001-02-004'
TAX_DEC = '01-002-00005-2023-0142'


def url(farmer):
    return f'/api/farmers/{farmer.id}/parcels/bulk/'


def parcel(number='', **over):
    row = {'parcel_number': number, 'area_hectares': 1.5, 'barangay': 'Alaska', 'land_ownership': 'Owner', 'farm_type': '',
           'cropping_schedule': '', 'classifications': [], 'tax_declaration_number': '', 'land_owner_name': '',
           'land_owner_rsbsa_number': '', 'crops': [], 'machinery': []}
    row.update(over)
    return row


def crop(name='Palay (Rice)', **over):
    row = {'crop_name': name, 'crop_name_other': '', 'area_hectares': 1.0, 'is_main_crop': False, 'variety_used': '',
           'seed_source': 'Certified Seed', 'quantity_of_seeds_used': None, 'seeds_unit': 'kg', 'number_of_trees': None,
           'has_pcic_insurance': False}
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
            parcel('', area_hectares=0.75),
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

    def test_parcels_without_a_number_never_clash(self):
        self.assertEqual(self.post([parcel(''), parcel(''), parcel('')]).status_code, 201)

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
        ParcelClassification.objects.filter(name='Organic Farm').update(is_active=False)
        self.assertEqual(self.post([parcel(NO_1, classifications=['Organic Farm'])]).status_code, 400)

    # --- the shape of the request
    def test_the_request_must_be_a_list_of_one_to_fifty_parcels(self):
        for body in ([], {}, 'x', None):
            self.assertEqual(self.post(body).status_code, 400, body)
        self.assertEqual(self.post([parcel() for _ in range(51)]).status_code, 400)
        self.assertEqual(self.post([parcel() for _ in range(50)]).status_code, 201)
        self.assertEqual(self.post(['not a parcel']).status_code, 400)

    def test_nested_crops_and_machinery_must_be_lists(self):
        r = self.post([parcel(NO_1, crops='Palay')])
        self.assertEqual(r.status_code, 400)
        self.assertIn('crops', r.json()['errors'][0])

    def test_another_farmers_parcel_numbers_do_not_clash(self):
        other = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000772', first_name='Ben', last_name='Ruiz', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Alaska', civil_status='Single')
        FarmParcel.objects.create(farmer=other, parcel_number=NO_1, area_hectares='1.00', barangay='Alaska')
        self.assertEqual(self.post([parcel(NO_1)]).status_code, 201)
        self.assertEqual(FarmParcel.objects.filter(farmer=other).count(), 1)
