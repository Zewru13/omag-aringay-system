"""A harvest unit weight can be set for several crops at once: one unit, one weight, any number of crops (none chosen = every crop).
Underneath it is still one row per unit and crop (production/unit_weights.py); these endpoints add, change and delete the whole group."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropType, HarvestUnitWeight

URL = '/api/production/harvest-unit-weights/'
GROUP = '/api/production/harvest-unit-weights/group/'


class UnitWeightGroupTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='uwg-adm', password='pw', role='ADMIN', email='uwg@x.test')
        cls.focal = User.objects.create_user(username='uwg-foc', password='pw', role='EVALUATOR', email='uwgf@x.test')
        cls.rice, cls.corn, cls.garlic = (CropType.objects.create(name=f'Group {n}', days_to_harvest=100) for n in ('Rice', 'Corn', 'Garlic'))

    def setUp(self):
        HarvestUnitWeight.objects.all().delete()   # the migrations seed a few standard weights; these tests start from none
        self.client.force_authenticate(self.admin)

    def rows(self, unit='Sack'):
        return sorted(HarvestUnitWeight.objects.filter(unit=unit).values_list('crop_type_id', 'kg_per_unit', 'note'), key=lambda r: (r[0] is None, r[0] or 0))

    def test_one_post_with_several_crops_adds_one_row_per_crop(self):
        r = self.client.post(URL, {'unit': 'Sack', 'crop_types': [self.rice.id, self.corn.id], 'kg_per_unit': '50', 'note': 'NFA'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(len(r.json()), 2)
        self.assertEqual([(c, float(k), n) for c, k, n in self.rows()], [(self.rice.id, 50.0, 'NFA'), (self.corn.id, 50.0, 'NFA')])

    def test_no_crops_means_every_crop(self):
        r = self.client.post(URL, {'unit': 'Sack', 'crop_types': [], 'kg_per_unit': '30'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual([c for c, _, _ in self.rows()], [None])

    def test_a_single_crop_post_still_works(self):
        r = self.client.post(URL, {'unit': 'Sack', 'crop_type': self.rice.id, 'kg_per_unit': '50'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['crop_type'], self.rice.id)

    def test_a_crop_that_already_has_the_unit_refuses_the_whole_post(self):
        HarvestUnitWeight.objects.create(unit='sack', crop_type=self.corn, kg_per_unit='40')
        r = self.client.post(URL, {'unit': 'Sack', 'crop_types': [self.rice.id, self.corn.id], 'kg_per_unit': '50'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Group Corn', str(r.json()))
        self.assertFalse(HarvestUnitWeight.objects.filter(crop_type=self.rice).exists(), 'nothing is saved when one crop is refused')

    def test_editing_a_group_adds_changes_and_removes_crops(self):
        a = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.rice, kg_per_unit='50', note='old')
        b = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.corn, kg_per_unit='50', note='old')
        r = self.client.put(GROUP, {'ids': [a.id, b.id], 'unit': 'Sack', 'crop_types': [self.corn.id, self.garlic.id], 'kg_per_unit': '55', 'note': 'new'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([(c, float(k), n) for c, k, n in self.rows()], [(self.corn.id, 55.0, 'new'), (self.garlic.id, 55.0, 'new')])
        self.assertTrue(HarvestUnitWeight.objects.filter(pk=b.pk).exists(), 'the row of a crop that stays is kept')
        self.assertFalse(HarvestUnitWeight.objects.filter(pk=a.pk).exists(), 'the row of a crop that left is deleted')

    def test_a_group_can_be_renamed_and_can_become_every_crop(self):
        a = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.rice, kg_per_unit='50')
        self.client.put(GROUP, {'ids': [a.id], 'unit': 'Bag', 'crop_types': [], 'kg_per_unit': None}, format='json')
        self.assertEqual(list(HarvestUnitWeight.objects.values_list('unit', 'crop_type_id', 'kg_per_unit')), [('Bag', None, None)])

    def test_editing_into_a_crop_that_another_row_has_is_refused_and_changes_nothing(self):
        a = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.rice, kg_per_unit='50')
        HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.corn, kg_per_unit='40')
        r = self.client.put(GROUP, {'ids': [a.id], 'unit': 'Sack', 'crop_types': [self.rice.id, self.corn.id], 'kg_per_unit': '60'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(float(HarvestUnitWeight.objects.get(pk=a.pk).kg_per_unit), 50.0)

    def test_deleting_a_group_removes_all_its_rows(self):
        a = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.rice, kg_per_unit='50')
        b = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.corn, kg_per_unit='50')
        keep = HarvestUnitWeight.objects.create(unit='Bag', crop_type=self.corn, kg_per_unit='20')
        r = self.client.delete(GROUP, {'ids': [a.id, b.id]}, format='json')
        self.assertEqual(r.status_code, 204, r.content)
        self.assertEqual(list(HarvestUnitWeight.objects.values_list('pk', flat=True)), [keep.pk])

    def test_the_unit_name_rules_still_apply(self):
        self.assertEqual(self.client.post(URL, {'unit': 'kg', 'crop_types': [self.rice.id], 'kg_per_unit': '1'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {'unit': ' ', 'crop_types': [self.rice.id]}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {'unit': 'Sack', 'crop_types': [self.rice.id], 'kg_per_unit': '0'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(URL, {'unit': 'Sack', 'crop_types': [9999999], 'kg_per_unit': '5'}, format='json').status_code, 400)

    def test_only_an_admin_changes_groups(self):
        a = HarvestUnitWeight.objects.create(unit='Sack', crop_type=self.rice, kg_per_unit='50')
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.post(URL, {'unit': 'Bag', 'crop_types': [self.rice.id]}, format='json').status_code, 403)
        self.assertEqual(self.client.put(GROUP, {'ids': [a.id], 'unit': 'Sack', 'crop_types': []}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(GROUP, {'ids': [a.id]}, format='json').status_code, 403)
