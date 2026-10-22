"""A new farmer crop record must sit on one of the farmer's farm parcels; records without a parcel can still be listed."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

URL = '/api/production/monitoring/'
BULK_URL = '/api/production/monitoring/bulk/'
_RSBSA = itertools.count(985001)


def make_farmer(first='Rita'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Parcelreq', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def payload(farmer, crop_type, parcel=None, **over):
    data = dict(farmer=farmer.id, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop_type.id,
                season='Wet', year=2026, date_planted='2026-05-01', area_planted_ha='1.00')
    if parcel:
        data['farm_parcel'] = parcel.id
    data.update(over)
    return data


class ParcelRequiredTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pr-admin', password='pw', role='ADMIN', email='pr-admin@x.test')
        cls.crops = list(CropType.objects.order_by('id')[:3])
        cls.farmer = make_farmer()
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='2.00', land_ownership='Owner', barangay='Alaska')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_farmer_without_any_parcel_cannot_get_a_crop_record(self):
        lone = make_farmer('Lone')
        res = self.client.post(URL, payload(lone, self.crops[0]), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('farm parcel', str(res.json()['farm_parcel']).lower())
        self.assertIn('add a farm parcel first', str(res.json()['farm_parcel']).lower())
        self.assertFalse(CropMonitoringRecord.objects.filter(farmer=lone).exists())

    def test_a_farmer_with_two_parcels_must_choose_one(self):
        two = make_farmer('Two')
        for _ in range(2):
            FarmParcel.objects.create(farmer=two, area_hectares='1.00', land_ownership='Owner', barangay='Alaska')
        res = self.client.post(URL, payload(two, self.crops[0]), format='json')
        self.assertEqual(res.status_code, 400)
        self.assertIn('choose', str(res.json()['farm_parcel']).lower())

    def test_a_chosen_parcel_saves(self):
        res = self.client.post(URL, payload(self.farmer, self.crops[0], self.parcel), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['farm_parcel'], self.parcel.id)

    def test_the_only_parcel_is_used_when_none_is_sent(self):
        res = self.client.post(URL, payload(self.farmer, self.crops[1]), format='json')
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.json()['farm_parcel'], self.parcel.id)

    def test_editing_an_old_record_without_a_parcel_still_works(self):
        old = CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.crops[2], season='Dry',
            year=2025, date_planted=date(2025, 11, 1), area_planted_ha='1.00', status='Planted')
        res = self.client.patch(f'{URL}{old.id}/', {'area_planted_ha': '1.25'}, format='json')
        self.assertEqual(res.status_code, 200, res.content)

    def test_bulk_entry_refuses_the_whole_batch_when_one_row_has_no_parcel(self):
        lone = make_farmer('Bulk')
        res = self.client.post(BULK_URL, [payload(self.farmer, self.crops[0], self.parcel), payload(lone, self.crops[1])], format='json')
        self.assertEqual(res.status_code, 400)
        self.assertFalse(CropMonitoringRecord.objects.filter(farmer=self.farmer, crop_type=self.crops[0]).exists())


class NoParcelFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='np-admin', password='pw', role='ADMIN', email='np-admin@x.test')
        cls.farmer = make_farmer('Nina')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='2.00', land_ownership='Owner', barangay='Alaska')
        crop = CropType.objects.order_by('id').first()
        base = dict(farmer=cls.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop, season='Wet',
                    year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted')
        cls.with_parcel = CropMonitoringRecord.objects.create(farm_parcel=cls.parcel, **base)
        cls.without = CropMonitoringRecord.objects.create(**base)

    def test_farm_parcel_none_lists_only_records_without_a_parcel(self):
        self.client.force_authenticate(self.admin)
        data = self.client.get(URL, {'farm_parcel': 'none'}).json()
        self.assertEqual([r['id'] for r in data['results']], [self.without.id])
        data = self.client.get(URL, {'farm_parcel': self.parcel.id}).json()
        self.assertEqual([r['id'] for r in data['results']], [self.with_parcel.id])
