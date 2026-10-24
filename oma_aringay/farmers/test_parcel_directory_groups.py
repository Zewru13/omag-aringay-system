"""Crop Records: the parcels sorted (?ordering=) and grouped by farmer, barangay or land ownership (/parcels/directory/groups/)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from farmers.test_parcel_directory import make_crop, make_farmer, make_parcel

URL = '/api/farmers/parcels/directory/'
GROUPS_URL = '/api/farmers/parcels/directory/groups/'


class ParcelDirectorySortAndGroupTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='pg2-admin', password='pw', role='ADMIN', email='pg2a@x.test')
        cls.citizen = User.objects.create_user(username='pg2-cit', password='pw', role='CITIZEN', email='pg2c@x.test')
        cls.ana = make_farmer('Ana', 'Parcelo')
        cls.ben = make_farmer('Ben', 'Dizon', barangay='Poblacion')
        cls.p1 = make_parcel(cls.ana, '01-33-02-005-001-02-003', area='1.50')                       # Ana, Alaska, 2 crops
        cls.p2 = make_parcel(cls.ana, '01-33-02-005-002-02-004', barangay='Poblacion', area='5.00')  # Ana, Poblacion, no crops
        cls.p3 = make_parcel(cls.ben, '01-33-02-006-001-02-004', barangay='Poblacion', area='3.00')  # Ben, Poblacion, 1 crop
        cls.p4 = make_parcel(cls.ben, '01-33-02-006-002-02-005', area='0.50')                       # Ben, Alaska, 4 crops (+1 lost)
        FarmParcel.objects.filter(pk=cls.p2.pk).update(land_ownership='Tenant')
        make_crop(cls.ana, cls.p1); make_crop(cls.ana, cls.p1)
        make_crop(cls.ben, cls.p3)
        for _ in range(4):
            make_crop(cls.ben, cls.p4)
        make_crop(cls.ben, cls.p4, status='Total Loss')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def ids(self, **params):
        return [r['id'] for r in self.client.get(URL, params).json()['results']]

    # --- sorting
    def test_the_default_is_the_farmer_a_to_z(self):
        self.assertEqual(self.ids(), [self.p3.id, self.p4.id, self.p1.id, self.p2.id])      # Dizon, Dizon, Parcelo, Parcelo
        self.assertEqual(self.ids(ordering='name'), self.ids())

    def test_most_crops_first_and_fewest_first(self):
        self.assertEqual(self.ids(ordering='crops'), [self.p4.id, self.p1.id, self.p3.id, self.p2.id])      # 4, 2, 1, 0 (a lost crop is not counted)
        self.assertEqual(self.ids(ordering='crops_asc'), [self.p2.id, self.p3.id, self.p1.id, self.p4.id])

    def test_largest_area_first_and_by_parcel_number(self):
        self.assertEqual(self.ids(ordering='area'), [self.p2.id, self.p3.id, self.p1.id, self.p4.id])       # 5, 3, 1.5, 0.5
        self.assertEqual(self.ids(ordering='number'), [self.p1.id, self.p2.id, self.p3.id, self.p4.id])

    def test_an_unknown_ordering_is_refused(self):
        self.assertEqual(self.client.get(URL, {'ordering': 'luck'}).status_code, 400)

    def test_filter_by_land_ownership(self):
        self.assertEqual(self.ids(land_ownership='Tenant'), [self.p2.id])
        self.assertEqual(len(self.ids(land_ownership='owner')), 3)

    # --- groups
    def groups(self, group_by, **params):
        r = self.client.get(GROUPS_URL, {'group_by': group_by, **params})
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()['results']

    def test_grouped_by_farmer_with_parcels_area_and_crops(self):
        groups = self.groups('farmer')
        self.assertEqual([(g['name'], g['parcels'], g['area_hectares'], g['crops']) for g in groups],
                         [('Ben Dizon', 2, 3.5, 5), ('Ana Parcelo', 2, 6.5, 2)])
        self.assertEqual(groups[0]['id'], self.ben.id)
        self.assertEqual(groups[0]['barangay'], 'Poblacion')

    def test_grouped_by_barangay_and_by_land_ownership(self):
        by_barangay = self.groups('barangay')
        self.assertEqual([(g['name'], g['parcels'], g['area_hectares'], g['crops']) for g in by_barangay],
                         [('Alaska', 2, 2.0, 6), ('Poblacion', 2, 8.0, 1)])
        by_ownership = self.groups('ownership')
        self.assertEqual([(g['name'], g['parcels'], g['crops']) for g in by_ownership], [('Owner', 3, 7), ('Tenant', 1, 0)])

    def test_groups_can_be_ordered_by_crops_or_area(self):
        self.assertEqual([g['name'] for g in self.groups('farmer', ordering='crops')], ['Ben Dizon', 'Ana Parcelo'])
        self.assertEqual([g['name'] for g in self.groups('farmer', ordering='crops_asc')], ['Ana Parcelo', 'Ben Dizon'])
        self.assertEqual([g['name'] for g in self.groups('farmer', ordering='area')], ['Ana Parcelo', 'Ben Dizon'])
        self.assertEqual([g['name'] for g in self.groups('barangay', ordering='area')], ['Poblacion', 'Alaska'])

    def test_opening_a_group_is_the_ordinary_list_so_the_counts_always_agree(self):
        for g in self.groups('farmer'):
            self.assertEqual(self.client.get(URL, {'farmer': g['id']}).json()['count'], g['parcels'])
        for g in self.groups('barangay'):
            self.assertEqual(self.client.get(URL, {'barangay': g['id']}).json()['count'], g['parcels'])
        for g in self.groups('ownership'):
            self.assertEqual(self.client.get(URL, {'land_ownership': g['id']}).json()['count'], g['parcels'])

    def test_the_pages_filters_narrow_the_groups(self):
        groups = self.groups('farmer', barangay='Alaska')
        self.assertEqual([(g['name'], g['parcels'], g['crops']) for g in groups], [('Ben Dizon', 1, 4), ('Ana Parcelo', 1, 2)])
        self.assertEqual([g['name'] for g in self.groups('barangay', search='Parcelo')], ['Alaska', 'Poblacion'])
        self.assertEqual([g['parcels'] for g in self.groups('barangay', search='Parcelo')], [1, 1])

    def test_groups_are_paged_ten_a_page(self):
        for i in range(12):
            make_parcel(make_farmer(f'Many{i:02d}', 'Zzfarmer'), area='1.00')
        r = self.client.get(GROUPS_URL, {'group_by': 'farmer'}).json()
        self.assertEqual((r['count'], len(r['results'])), (14, 10))

    def test_a_group_by_is_required_and_staff_only(self):
        self.assertEqual(self.client.get(GROUPS_URL).status_code, 400)
        self.assertEqual(self.client.get(GROUPS_URL, {'group_by': 'crop'}).status_code, 400)
        self.assertEqual(self.client.get(GROUPS_URL, {'group_by': 'farmer', 'ordering': 'luck'}).status_code, 400)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(GROUPS_URL, {'group_by': 'farmer'}).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(GROUPS_URL, {'group_by': 'farmer'}).status_code, (401, 403))
