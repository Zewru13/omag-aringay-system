"""Editing an Input Type (Crop Settings > Input Types) used to crash: the serializer's update read `application_days`, a field Input Types do not
have (audit 2026-11-20), so a rename or a switch to inactive answered with a server error.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropInputType, CropType


class InputTypeEditTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='it-admin', password='pw', role='ADMIN', email='it-admin@x.test')
        cls.focal = User.objects.create_user(username='it-focal', password='pw', role='EVALUATOR', email='it-focal@x.test')
        cls.citizen = User.objects.create_user(username='it-cit', password='pw', role='CITIZEN', email='it-cit@x.test')

    def setUp(self):
        self.item = CropInputType.objects.create(name='Audit Test Input', input_type='Fertilizer', is_active=True)
        self.url = f'/api/production/input-types/{self.item.id}/'

    def test_the_name_can_be_changed(self):
        self.client.force_authenticate(self.admin)
        r = self.client.patch(self.url, {'name': 'Urea 46'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual(self.item.name, 'Urea 46')

    def test_it_can_be_switched_to_inactive_and_back(self):
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.patch(self.url, {'is_active': False}, format='json').status_code, 200)
        self.item.refresh_from_db()
        self.assertFalse(self.item.is_active)
        self.assertEqual(self.client.patch(self.url, {'is_active': True}, format='json').status_code, 200)

    def test_a_full_update_and_its_crop_types_work(self):
        rice = CropType.objects.order_by('id').first()
        self.client.force_authenticate(self.admin)
        r = self.client.put(self.url, {'name': 'Urea', 'description': 'N source', 'is_active': True, 'input_type': 'Fertilizer',
                                       'growth_stage': 'Vegetative', 'crop_types': [rice.id]}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.item.refresh_from_db()
        self.assertEqual((self.item.description, self.item.growth_stage, list(self.item.crop_types.all())), ('N source', 'Vegetative', [rice]))

    def test_a_new_input_type_can_still_be_added(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post('/api/production/input-types/', {'name': 'Zinc sulfate', 'description': '', 'is_active': True, 'input_type': 'Fertilizer',
                                                               'growth_stage': ''}, format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_a_citizen_still_cannot_edit_one(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.patch(self.url, {'name': 'x'}, format='json').status_code, 403)
