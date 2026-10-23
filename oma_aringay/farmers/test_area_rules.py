"""A crop cannot use more land than its parcel has (farmers.area_rules), wherever crops are put on a parcel."""
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from . import area_rules
from .models import FarmCrop, FarmParcel, Farmer
from .test_parcel_bulk import crop, parcel, url


class AreaRuleFunctionTests(APITestCase):
    def test_one_crop_cannot_be_bigger_than_its_parcel(self):
        messages = area_rules.crop_area_problems('5.00', '', ['5.01'])
        self.assertEqual(messages, ['A crop cannot be bigger than its parcel: this crop is 5.01 ha and the parcel is 5 ha.'])

    def test_crops_that_exactly_fill_the_parcel_are_fine(self):
        self.assertEqual(area_rules.crop_area_problems('5.00', '', ['2.5', '2.5']), [None, None])

    def test_the_crop_that_tips_the_total_over_carries_the_message(self):
        messages = area_rules.crop_area_problems('5.00', 'Single Cropping', ['3', '2', '1'])
        self.assertEqual(messages[:2], [None, None])
        self.assertEqual(messages[2], "The crops on this parcel would come to 6 ha, more than the 5 ha, the parcel's area.")

    def test_double_and_triple_cropping_parcels_may_declare_two_and_three_times_the_area(self):
        self.assertEqual(area_rules.crop_area_problems('5.00', 'Double Cropping', ['5', '5']), [None, None])
        self.assertIsNotNone(area_rules.crop_area_problems('5.00', 'Double Cropping', ['5', '5', '1'])[2])
        self.assertEqual(area_rules.crop_area_problems('5.00', 'Triple Cropping', ['5', '5', '5']), [None, None, None])
        # even then, one crop alone is never bigger than the parcel
        self.assertIn('bigger than its parcel', area_rules.crop_area_problems('5.00', 'Triple Cropping', ['6'])[0])

    def test_already_declared_crops_count_towards_the_total(self):
        self.assertIsNotNone(area_rules.crop_area_problems('5.00', '', ['1'], already_declared='4.5')[0])
        self.assertIsNone(area_rules.crop_area_problems('5.00', '', ['0.5'], already_declared='4.5')[0])

    def test_growing_area_problem(self):
        self.assertIsNone(area_rules.growing_area_problem('5.00', '3.00', '2.00'))
        self.assertIn('Only 2 ha of this 5 ha parcel is free', area_rules.growing_area_problem('5.00', '3.00', '2.50'))
        self.assertIn('bigger than its parcel', area_rules.growing_area_problem('5.00', '0', '5.50'))


class ParcelAreaEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='area-adm', password='pw', role='ADMIN', email='area@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000881', first_name='Ben', last_name='Sison', gender='Male', birthdate=date(1980, 2, 2),
            barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    # --- Add Farm Parcels page
    def test_bulk_refuses_a_crop_bigger_than_its_parcel_and_saves_nothing(self):
        rows = [parcel(area_hectares=5, crops=[crop(area_hectares=5.5)])]
        response = self.client.post(url(self.farmer), rows, format='json')
        self.assertEqual(response.status_code, 400)
        message = response.json()['errors'][0]['crops'][0]['area_hectares'][0]
        self.assertIn('bigger than its parcel', message)
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 0)

    def test_bulk_refuses_crops_that_together_fill_more_than_the_parcel(self):
        rows = [parcel(area_hectares=5, crops=[crop(area_hectares=3), crop('Corn (Mais)', area_hectares=2.5)])]
        response = self.client.post(url(self.farmer), rows, format='json')
        self.assertEqual(response.status_code, 400)
        crops = response.json()['errors'][0]['crops']
        self.assertEqual(crops[0], {})
        self.assertIn('would come to 5.5 ha', crops[1]['area_hectares'][0])

    def test_bulk_allows_double_cropping_to_use_twice_the_area(self):
        rows = [parcel(area_hectares=5, cropping_schedule='Double Cropping', crops=[crop(area_hectares=5), crop('Corn (Mais)', area_hectares=4)])]
        self.assertEqual(self.client.post(url(self.farmer), rows, format='json').status_code, 201)

    def test_bulk_accepts_crops_that_fit(self):
        rows = [parcel(area_hectares=5, crops=[crop(area_hectares=3), crop('Corn (Mais)', area_hectares=2)])]
        self.assertEqual(self.client.post(url(self.farmer), rows, format='json').status_code, 201)

    def test_one_over_full_parcel_stops_the_other_parcels_too(self):
        rows = [parcel('', area_hectares=5, crops=[crop(area_hectares=2)]), parcel('', area_hectares=1, crops=[crop(area_hectares=2)])]
        response = self.client.post(url(self.farmer), rows, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['errors'][0], {})
        self.assertEqual(FarmParcel.objects.filter(farmer=self.farmer).count(), 0)

    # --- adding a crop to a parcel that exists
    def make_parcel(self, area='5.00', schedule=''):
        return FarmParcel.objects.create(farmer=self.farmer, area_hectares=area, land_ownership='Owner', barangay='Alaska',
                                         cropping_schedule=schedule)

    def add_crop(self, parcel_obj, area, name='Palay (Rice)'):
        return self.client.post(f'/api/farmers/parcels/{parcel_obj.id}/crops/', {
            'crop_name': name, 'crop_name_other': '', 'area_hectares': area, 'is_main_crop': False, 'variety_used': '',
            'seed_source': 'Certified Seed', 'seeds_unit': 'kg', 'has_pcic_insurance': False}, format='json')

    def test_adding_a_crop_counts_the_crops_the_parcel_already_has(self):
        target = self.make_parcel()
        self.assertEqual(self.add_crop(target, '4.5').status_code, 201)
        refused = self.add_crop(target, '1.0', 'Corn (Mais)')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('would come to 5.5 ha', refused.json()['area_hectares'][0])
        self.assertEqual(self.add_crop(target, '0.5', 'Corn (Mais)').status_code, 201)
        self.assertEqual(FarmCrop.objects.filter(farm_parcel=target).count(), 2)

    def test_adding_a_crop_bigger_than_the_parcel_is_refused(self):
        self.assertEqual(self.add_crop(self.make_parcel(), '5.5').status_code, 400)

    def test_adding_a_crop_to_a_double_cropping_parcel(self):
        target = self.make_parcel(schedule='Double Cropping')
        self.assertEqual(self.add_crop(target, '5').status_code, 201)
        self.assertEqual(self.add_crop(target, '5', 'Corn (Mais)').status_code, 201)
        self.assertEqual(self.add_crop(target, '1', 'Onion').status_code, 400)


class ParcelFileAreaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='area-imp', password='pw', role='ADMIN', email='areaimp@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000882', first_name='Cora', last_name='Sison', gender='Female', birthdate=date(1981, 2, 2),
            barangay='Alaska', civil_status='Single')

    def test_the_judge_marks_an_over_area_parcel_invalid_with_the_row_number(self):
        from .parcel_import import _judge
        base = {'parcel_number': '', 'area_hectares': '5.00', 'cropping_schedule': ''}
        items = [
            {'row': 4, 'error': None, 'parcel': base, 'crop': {'is_main_crop': False, 'area_hectares': Decimal('3')}},
            {'row': 5, 'error': None, 'parcel': base, 'crop': {'is_main_crop': False, 'area_hectares': Decimal('2.5')}},
        ]
        status, detail = _judge(self.farmer, items)
        self.assertEqual(status, 'invalid')
        self.assertTrue(detail.startswith('Row 5: '), detail)
        self.assertIn('would come to 5.5 ha', detail)
        items[1]['crop']['area_hectares'] = Decimal('2')
        self.assertEqual(_judge(self.farmer, items), ('ready', None))
