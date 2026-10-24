"""Crop Monitoring grouped by farm parcel: GET /api/production/monitoring/groups/?group_by=parcel (the farmer account's view)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

URL = '/api/production/monitoring/groups/'
LIST = '/api/production/monitoring/'
_N = itertools.count(1)
User = get_user_model()


def farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (920000 + next(_N)), first_name=first, last_name='Parcelgroup', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def crop(person, parcel, status='Planted', area='1.00', name=None):
    ct = CropType.objects.filter(name=name).first() if name else CropType.objects.order_by('id').first()
    rec = CropMonitoringRecord.objects.create(
        farmer=person, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=ct, season='Wet', year=date.today().year,
        date_planted=date.today() - timedelta(days=5), area_planted_ha=area, status='Planted')
    if status != 'Planted':
        CropMonitoringRecord.objects.filter(pk=rec.pk).update(status=status)   # the model sets Planted for a crop just planted
    return rec


class ParcelGroupTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='pg-admin', password='pw', role='ADMIN', email='pg-admin@x.test')
        cls.ana, cls.ben = farmer('Ana'), farmer('Ben')
        cls.p1 = FarmParcel.objects.create(farmer=cls.ana, parcel_number='01-33-02-005-001-02-003', area_hectares='2.50', land_ownership='Owner', barangay='Alaska')
        cls.p2 = FarmParcel.objects.create(farmer=cls.ana, parcel_number='', area_hectares='1.00', land_ownership='Tenant', barangay='Basca')
        cls.pb = FarmParcel.objects.create(farmer=cls.ben, parcel_number='01-33-02-006-001-02-004', area_hectares='0.80', land_ownership='Owner', barangay='Poblacion')
        for crop_args in ((cls.ana, cls.p1), (cls.ana, cls.p1, 'Near Harvest', '0.50'), (cls.ana, cls.p2), (cls.ana, None), (cls.ben, cls.pb)):
            crop(*crop_args)
        cls.ana_user = User.objects.create_user(username='pg-ana', password='pw', role='CITIZEN', email='pg-ana@x.test')
        UserLinkedRecord.objects.create(user=cls.ana_user, record_type='FARMER', record_id=cls.ana.id, is_active=True)

    def groups(self, user=None, **params):
        self.client.force_authenticate(user or self.admin)
        res = self.client.get(URL, {'group_by': 'parcel', **params})
        self.assertEqual(res.status_code, 200, res.content)
        return res.json()

    def test_a_group_per_parcel_with_its_counts_and_a_last_group_for_crops_without_one(self):
        data = self.groups()
        by_key = {g['key']: g for g in data['results']}
        self.assertEqual(set(by_key), {f'p{self.p1.id}', f'p{self.p2.id}', f'p{self.pb.id}', 'none'})
        g1 = by_key[f'p{self.p1.id}']
        self.assertEqual((g1['name'], g1['count'], g1['near_harvest'], g1['area_planted_ha'], g1['barangay']), ('01-33-02-005-001-02-003', 2, 1, 1.5, 'Alaska'))
        self.assertEqual(by_key[f'p{self.p2.id}']['name'], f'Parcel #{self.p2.id}')       # no parcel number yet
        self.assertEqual((by_key['none']['name'], by_key['none']['count']), ('No farm parcel on file', 1))
        self.assertEqual(data['results'][-1]['key'], 'none')

    def test_a_parcel_group_names_its_farmer_area_and_ownership(self):
        by_key = {g['key']: g for g in self.groups()['results']}
        g1, g2 = by_key[f'p{self.p1.id}'], by_key[f'p{self.p2.id}']
        self.assertEqual((g1['farmer_id'], g1['farmer_name'], g1['rsbsa_number']), (self.ana.id, 'Ana Parcelgroup', self.ana.rsbsa_number))
        self.assertEqual((g1['parcel_area_hectares'], g1['land_ownership']), (2.5, 'Owner'))
        self.assertEqual((g2['parcel_area_hectares'], g2['land_ownership'], g2['barangay']), (1.0, 'Tenant', 'Basca'))
        self.assertNotIn('farmer_id', by_key['none'])

    def test_a_farmer_account_only_sees_its_own_parcels(self):
        keys = {g['key'] for g in self.groups(self.ana_user)['results']}
        self.assertEqual(keys, {f'p{self.p1.id}', f'p{self.p2.id}', 'none'})

    def test_each_groups_count_is_what_opening_it_lists(self):
        self.client.force_authenticate(self.ana_user)
        for g in self.groups(self.ana_user)['results']:
            param = 'none' if g['key'] == 'none' else g['id']
            rows = self.client.get(LIST, {'farm_parcel': param}).json()
            self.assertEqual(rows['count'], g['count'], g['key'])

    def test_the_list_filters_apply_to_the_groups(self):
        data = self.groups(status='Near Harvest')
        self.assertEqual([(g['key'], g['count']) for g in data['results']], [(f'p{self.p1.id}', 1)])

    def test_the_other_groupings_still_work_and_unknown_ones_are_refused(self):
        self.assertEqual(self.groups(group_by='crop')['count'] >= 1, True)
        self.client.force_authenticate(self.admin)
        res = self.client.get(URL, {'group_by': 'barangay'})
        self.assertEqual(res.status_code, 400)
        self.assertIn('parcel', str(res.json()['group_by']))
