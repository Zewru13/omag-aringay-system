"""Crop type and variety names are unique ignoring case, spaces and punctuation."""
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase
from rest_framework.test import APITestCase

from production.models import CropType, CropVariety
from production.naming import normalize_name


class NormalizeNameTests(SimpleTestCase):
    def test_case_spaces_and_punctuation_are_ignored(self):
        for value in ('Rc 222', 'RC222', 'Rc-222', ' rc 222 ', 'R.C. 222'):
            self.assertEqual(normalize_name(value), 'rc222', value)

    def test_full_width_characters_match(self):
        self.assertEqual(normalize_name('Rc ２２２'), 'rc222')

    def test_nothing_left_is_empty(self):
        self.assertEqual(normalize_name('---'), '')
        self.assertEqual(normalize_name(None), '')


class NameDuplicateApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username='name-admin', password='pw', role='ADMIN', email='name-admin@x.test')
        cls.rice = CropType.objects.create(name='Dupe Rice (Palay)', days_to_harvest=110)
        cls.corn = CropType.objects.create(name='Dupe Corn', days_to_harvest=90)
        cls.rc222 = CropVariety.objects.create(name='Rc222', crop_type=cls.rice)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post_type(self, name, **extra):
        return self.client.post('/api/production/crop-types/', {'name': name, 'days_to_harvest': 100, **extra}, format='json')

    def post_variety(self, name, crop_type):
        return self.client.post('/api/production/varieties/', {'name': name, 'crop_type': crop_type}, format='json')

    def test_crop_type_spelling_duplicate_is_refused_with_the_existing_name(self):
        response = self.post_type('Dupe  Rice (Palay)')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['name'], ["A crop type named 'Dupe Rice (Palay)' already exists."])

    def test_crop_type_can_be_edited_and_renamed_to_a_new_name(self):
        url = f'/api/production/crop-types/{self.rice.id}/'
        self.assertEqual(self.client.patch(url, {'days_to_harvest': 120}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'name': 'Dupe Rice (Palay) 2'}, format='json').status_code, 200)

    def test_variety_spelling_duplicate_is_refused_with_the_existing_name(self):
        response = self.post_variety('RC 222', self.rice.id)
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['name'], ["A variety named 'Rc222' already exists for Dupe Rice (Palay)."])

    def test_same_variety_name_under_another_crop_is_allowed(self):
        self.assertEqual(self.post_variety('RC 222', self.corn.id).status_code, 201)

    def test_trailing_space_and_full_width_forms_are_duplicates(self):
        self.assertEqual(self.post_variety('Rc 222 ', self.rice.id).status_code, 400)
        self.assertEqual(self.post_variety('Rc ２２２', self.rice.id).status_code, 400)

    def test_general_varieties_without_a_crop_are_compared_with_each_other(self):
        CropVariety.objects.create(name='Native Mix')
        response = self.client.post('/api/production/varieties/', {'name': 'native-mix'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('crops with no crop type set', response.json()['name'][0])

    def test_existing_duplicates_can_still_be_edited_on_another_field(self):
        first = CropVariety.objects.create(name='Twin A1', crop_type=self.corn)
        second = CropVariety.objects.create(name='Twin-A1', crop_type=self.corn)
        for variety in (first, second):
            response = self.client.patch(f'/api/production/varieties/{variety.id}/', {'days_to_harvest': 95}, format='json')
            self.assertEqual(response.status_code, 200, response.content)

    def test_renaming_a_variety_into_another_ones_name_is_refused(self):
        other = CropVariety.objects.create(name='Another One', crop_type=self.rice)
        response = self.client.patch(f'/api/production/varieties/{other.id}/', {'name': 'rc-222'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_a_name_with_nothing_but_punctuation_is_refused(self):
        self.assertEqual(self.post_variety('---', self.rice.id).json()['name'], ['Enter a real name (letters or numbers).'])
        self.assertEqual(self.post_type('***').json()['name'], ['Enter a real name (letters or numbers).'])
