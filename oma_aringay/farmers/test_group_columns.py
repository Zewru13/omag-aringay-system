"""Crop Records grouped by farmer, barangay or land ownership: each group row carries the facts its columns show (the farmer's RSBSA number and
contact number, and how many farmers a barangay / ownership group holds), like the ordinary table's columns."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from farmers.test_parcel_directory import make_crop, make_farmer, make_parcel

GROUPS_URL = '/api/farmers/parcels/directory/groups/'


class ParcelGroupColumnTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='gc-admin', password='pw', role='ADMIN', email='gca@x.test')
        cls.ana = make_farmer('Ana', 'Parcelo')
        cls.ben = make_farmer('Ben', 'Dizon', barangay='Poblacion')
        Farmer.objects.filter(pk=cls.ana.pk).update(contact_number='09171112222')
        cls.p1 = make_parcel(cls.ana, '01-33-02-005-001-02-003', area='1.50')                         # Ana, Alaska
        cls.p2 = make_parcel(cls.ana, '01-33-02-005-002-02-004', barangay='Poblacion', area='5.00')   # Ana, Poblacion, Tenant
        cls.p3 = make_parcel(cls.ben, '01-33-02-006-001-02-004', barangay='Poblacion', area='3.00')   # Ben, Poblacion
        cls.p4 = make_parcel(cls.ben, '01-33-02-006-002-02-005', area='0.50')                         # Ben, Alaska
        FarmParcel.objects.filter(pk=cls.p2.pk).update(land_ownership='Tenant')
        make_crop(cls.ana, cls.p1)
        make_crop(cls.ben, cls.p3)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def groups(self, group_by, **params):
        response = self.client.get(GROUPS_URL, {'group_by': group_by, **params})
        self.assertEqual(response.status_code, 200, response.content[:200])
        return {g['name']: g for g in response.json()['results']}

    def test_a_farmer_group_carries_the_farmers_rsbsa_and_contact_number(self):
        groups = self.groups('farmer')
        ana = groups['Ana Parcelo']
        self.assertEqual(ana['rsbsa_number'], self.ana.rsbsa_number)
        self.assertEqual(ana['contact_number'], '09171112222')
        self.assertEqual(ana['barangay'], 'Alaska')
        self.assertEqual((ana['parcels'], ana['crops']), (2, 1))
        self.assertEqual(groups['Ben Dizon']['rsbsa_number'], self.ben.rsbsa_number)
        self.assertEqual(groups['Ben Dizon']['contact_number'], '')

    def test_a_barangay_group_says_how_many_farmers_it_holds(self):
        groups = self.groups('barangay')
        self.assertEqual((groups['Alaska']['farmers'], groups['Alaska']['parcels']), (2, 2))        # Ana's p1 and Ben's p4
        self.assertEqual((groups['Poblacion']['farmers'], groups['Poblacion']['parcels']), (2, 2))  # Ana's p2 and Ben's p3

    def test_a_land_ownership_group_counts_each_farmer_once(self):
        groups = self.groups('ownership')
        self.assertEqual(groups['Owner']['farmers'], 2)
        self.assertEqual(groups['Owner']['parcels'], 3)
        self.assertEqual((groups['Tenant']['farmers'], groups['Tenant']['parcels']), (1, 1))

    def test_a_farmer_with_two_parcels_in_one_barangay_is_still_one_farmer(self):
        make_parcel(self.ana, '01-33-02-005-009-02-009', area='1.00')   # a second Alaska parcel of Ana's
        self.assertEqual(self.groups('barangay')['Alaska']['farmers'], 2)
        self.assertEqual(self.groups('barangay')['Alaska']['parcels'], 3)

    def test_the_filters_still_decide_which_farmers_are_counted(self):
        groups = self.groups('barangay', search='Ana')
        self.assertEqual(groups['Alaska']['farmers'], 1)
        self.assertEqual(groups['Poblacion']['farmers'], 1)

    def test_every_group_kind_still_has_its_old_fields(self):
        for group_by in ('farmer', 'barangay', 'ownership'):
            group = next(iter(self.groups(group_by).values()))
            for key in ('key', 'id', 'name', 'barangay', 'parcels', 'area_hectares', 'crops'):
                self.assertIn(key, group, f'{group_by}: {key}')
