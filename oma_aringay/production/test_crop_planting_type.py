"""Crop Settings > Planted as (Seed / Tree / Seed or Tree) and how a new crop record follows it; and the variety a new crop record needs."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from production.models import CropMonitoringRecord, CropType

from .test_crop_record_duplicates import make_farmer, payload

URL = '/api/production/monitoring/'
TYPES = '/api/production/crop-types/'


class CropPlantingTypeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pt-admin', password='pw', role='ADMIN', email='pt@x.test')
        cls.rice = CropType.objects.create(name='Plant Rice', days_to_harvest=110)                              # Seed (the default)
        cls.mango = CropType.objects.create(name='Plant Mango', days_to_harvest=120, planting_type='Tree')
        cls.papaya = CropType.objects.create(name='Plant Papaya', days_to_harvest=240, planting_type='Both')
        cls.farmer = make_farmer('Pia')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='20.00', land_ownership='Owner', barangay='Alaska')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, crop, **over):
        return self.client.post(URL, payload(self.farmer, crop, self.parcel, area_planted_ha='1.00', **over), format='json')

    # --- the crop setting
    def test_a_crop_type_defaults_to_seed_and_can_be_set_to_tree_or_both(self):
        r = self.client.post(TYPES, {'name': 'New Plant Crop', 'days_to_harvest': 100}, format='json')
        self.assertEqual((r.status_code, r.json()['planting_type']), (201, 'Seed'), r.content)
        pk = r.json()['id']
        for value in ('Tree', 'Both', 'Seed'):
            r = self.client.patch(f'{TYPES}{pk}/', {'planting_type': value}, format='json')
            self.assertEqual((r.status_code, r.json()['planting_type']), (200, value), r.content)
        self.assertEqual(self.client.patch(f'{TYPES}{pk}/', {'planting_type': 'Shrub'}, format='json').status_code, 400)

    def test_the_known_tree_crops_were_marked_as_trees(self):
        import importlib
        migration = importlib.import_module('production.migrations.0065_crop_type_planting_type')
        self.assertEqual(set(migration.TREE_FIRST_WORDS), {'mango', 'cacao', 'banana', 'coffee'})

    # --- a new crop record follows its crop
    def test_a_seed_crop_is_planted_as_seed_and_a_tree_crop_as_trees_without_saying_so(self):
        seed = self.post(self.rice, quantity_of_seeds='25.5', quantity_of_trees=9).json()
        self.assertEqual((seed['planting_material'], seed['quantity_of_seeds'], seed['quantity_of_trees']), ('Seed', '25.50', None))
        tree = self.post(self.mango, quantity_of_trees=120).json()
        self.assertEqual((tree['planting_material'], tree['quantity_of_trees'], tree['quantity_of_seeds']), ('Tree', 120, None))

    def test_a_crop_cannot_be_planted_the_other_way(self):
        r = self.post(self.rice, planting_material='Tree', quantity_of_trees=10)
        self.assertEqual(r.status_code, 400)
        self.assertIn('planting_material', r.json())
        r = self.post(self.mango, planting_material='Seed', quantity_of_seeds='5')
        self.assertEqual(r.status_code, 400)
        self.assertIn('planting_material', r.json())
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)

    def test_a_crop_that_is_both_takes_either_way(self):
        seed = self.post(self.papaya, variety_used='Solo', planting_material='Seed', quantity_of_seeds='2').json()
        self.assertEqual((seed['planting_material'], seed['quantity_of_seeds']), ('Seed', '2.00'))
        tree = self.post(self.papaya, variety_used='Red Lady', planting_material='Tree', quantity_of_trees=40).json()
        self.assertEqual((tree['planting_material'], tree['quantity_of_trees']), ('Tree', 40))
        self.assertEqual(self.post(self.papaya, variety_used='Default').json()['planting_material'], 'Seed')     # not said: seed

    # --- the variety
    def test_a_new_crop_record_needs_its_variety(self):
        for blank in (None, '', '   '):
            over = {} if blank is None else {'variety_used': blank}
            body = payload(self.farmer, self.rice, self.parcel, area_planted_ha='1.00', **over)
            if blank is None:
                body.pop('variety_used')
            r = self.client.post(URL, body, format='json')
            self.assertEqual(r.status_code, 400, repr(blank))
            self.assertIn('variety_used', r.json())
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)
        self.assertEqual(self.post(self.rice, variety_used='NSIC Rc 222').status_code, 201)

    def test_editing_an_older_crop_without_a_variety_still_works(self):
        record = CropMonitoringRecord.objects.create(
            farmer=self.farmer, crop_type=self.rice, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner',
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')
        r = self.client.patch(f'{URL}{record.id}/', {'notes': 'checked the field'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
