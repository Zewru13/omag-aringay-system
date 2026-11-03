"""The units each assistance type offers in the quantity box (Seeds: kg, sack, bag, bundle; not piece or set), set in Assistance Settings.
Types with no unit box (Cash Assistance, Training) are not listed. Until an Admin changes one, a type offers its starting units."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from interventions.models import AssistanceTypeUnits

User = get_user_model()
URL = '/api/interventions/assistance-type-units/'


class TypeUnitsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='tu-admin', password='pw', role='ADMIN', email='tu@x.test')
        cls.citizen = User.objects.create_user(username='tu-cit', password='pw', role='CITIZEN', email='tuc@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def rows(self, domain, user=None):
        if user:
            self.client.force_authenticate(user)
        r = self.client.get(URL, {'domain': domain})
        self.assertEqual(r.status_code, 200, r.content)
        return {row['assistance_type']: row for row in r.json()}

    def test_every_type_with_a_unit_box_starts_with_sensible_units(self):
        crop = self.rows('crop')
        self.assertEqual(set(crop), {'Fertilizer', 'Seeds', 'Equipment', 'Other'})
        self.assertEqual(crop['Seeds']['units'], ['kg', 'sack', 'bag', 'bundle'])
        self.assertNotIn('piece', crop['Seeds']['units'])
        self.assertNotIn('set', crop['Seeds']['units'])
        self.assertEqual(crop['Equipment']['units'], ['piece', 'box', 'set'])
        self.assertEqual(len(crop['Other']['units']), 8)
        fish = self.rows('fisheries')
        self.assertEqual(set(fish), {'Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Other'})
        self.assertEqual(fish['Feed']['units'], ['kg', 'sack', 'bag'])
        self.assertTrue(all(row['is_default'] for row in list(crop.values()) + list(fish.values())))

    def test_cash_and_training_have_no_unit_box(self):
        for domain in ('crop', 'fisheries'):
            rows = self.rows(domain)
            self.assertNotIn('Cash Assistance', rows)
            self.assertNotIn('Training', rows)

    def test_an_admin_sets_the_units_of_a_type(self):
        r = self.client.put(URL, {'domain': 'crop', 'assistance_type': 'Seeds', 'units': ['bag', 'kg']}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.json()['units'], ['kg', 'bag'], 'kept in the order of the unit list')
        row = self.rows('crop')['Seeds']
        self.assertEqual((row['units'], row['is_default']), (['kg', 'bag'], False))
        self.assertEqual(self.rows('crop')['Fertilizer']['is_default'], True, 'other types are untouched')
        self.assertEqual(self.rows('fisheries')['Equipment']['is_default'], True, 'the other domain is untouched')
        self.client.put(URL, {'domain': 'crop', 'assistance_type': 'Seeds', 'units': ['sack']}, format='json')
        self.assertEqual(AssistanceTypeUnits.objects.filter(domain='crop', assistance_type='Seeds').count(), 1, 'one row per type')
        self.assertEqual(self.rows('crop')['Seeds']['units'], ['sack'])

    def test_a_bad_change_is_refused(self):
        for body in (
            {'domain': 'crop', 'assistance_type': 'Seeds', 'units': []},                    # at least one unit
            {'domain': 'crop', 'assistance_type': 'Seeds', 'units': ['furlong']},           # not a unit of the list
            {'domain': 'crop', 'assistance_type': 'Cash Assistance', 'units': ['kg']},      # no unit box
            {'domain': 'crop', 'assistance_type': 'Feed', 'units': ['kg']},                 # a fisheries type
            {'domain': 'sky', 'assistance_type': 'Seeds', 'units': ['kg']},                 # no such domain
        ):
            self.assertEqual(self.client.put(URL, body, format='json').status_code, 400, body)
        self.assertFalse(AssistanceTypeUnits.objects.exists())

    def test_everyone_signed_in_reads_but_only_staff_change(self):
        self.assertEqual(self.rows('crop', self.citizen)['Seeds']['units'], ['kg', 'sack', 'bag', 'bundle'])
        r = self.client.put(URL, {'domain': 'crop', 'assistance_type': 'Seeds', 'units': ['kg']}, format='json')
        self.assertEqual(r.status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(URL, {'domain': 'crop'}).status_code, 401)
