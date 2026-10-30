"""The saved details a crop's red FORCED HARVEST label opens: GET /api/production/forced-harvest/<harvest id>/ (the harvest with the other crops of
the same farmer saved in the same event), and the crop record carrying the id of its forced harvest."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

MULTI_URL = '/api/production/forced-harvest/'
CREATE_URL = '/api/production/create/'
_RSBSA = itertools.count(940001)


def farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Detail', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class ForcedHarvestDetailTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='fd-adm', password='pw', role='ADMIN', email='fda@x.test')
        cls.focal = User.objects.create_user(username='fd-foc', password='pw', role='EVALUATOR', email='fdf@x.test')
        cls.owner, cls.stranger = farmer('Ana'), farmer('Ben')
        cls.parcel_a = FarmParcel.objects.create(farmer=cls.owner, parcel_number='PA', area_hectares='5.00', land_ownership='Owner', barangay='Alaska')
        cls.parcel_b = FarmParcel.objects.create(farmer=cls.owner, parcel_number='PB', area_hectares='5.00', land_ownership='Owner', barangay='Alaska')
        cls.rice, _ = CropType.objects.get_or_create(name='Detail Rice', defaults=dict(days_to_harvest=100))
        cls.rice.days_to_harvest = 100
        cls.rice.save()
        cls.citizen_owner = User.objects.create_user(username='fd-own', password='pw', role='CITIZEN', email='fdo@x.test')
        UserLinkedRecord.objects.create(user=cls.citizen_owner, record_type=User.LinkedRecordType.FARMER, record_id=cls.owner.id, is_active=True)
        cls.citizen_other = User.objects.create_user(username='fd-oth', password='pw', role='CITIZEN', email='fdt@x.test')
        UserLinkedRecord.objects.create(user=cls.citizen_other, record_type=User.LinkedRecordType.FARMER, record_id=cls.stranger.id, is_active=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def crop(self, parcel, owner=None, planted_days_ago=20):
        return CropMonitoringRecord.objects.create(
            farmer=owner or self.owner, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.rice, season='Wet',
            year=2026, date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha='1.00', status='Planted')

    def force(self, crops, reason='upcoming_typhoon', detail=''):
        body = {'harvest_date': str(date.today()), 'force_harvest_reason': reason, 'force_harvest_detail': detail, 'remarks': 'before the storm',
                'crops': [{'monitoring_record': c.id, 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'} for c in crops]}
        r = self.client.post(MULTI_URL, body, format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def forced_id(self, crop):
        return self.client.get(f'/api/production/monitoring/{crop.id}/').json()['forced_harvest']['id']

    def test_the_crop_record_carries_the_id_of_its_forced_harvest(self):
        crop = self.crop(self.parcel_a)
        self.force([crop])
        harvest = HarvestRecord.objects.get(monitoring_record=crop)
        self.assertEqual(self.forced_id(crop), harvest.id)

    def test_the_details_list_every_crop_saved_in_the_same_event_across_parcels(self):
        a, b = self.crop(self.parcel_a), self.crop(self.parcel_b)
        self.force([a, b], reason='other', detail='Buyer pays double')
        data = self.client.get(f'{MULTI_URL}{self.forced_id(a)}/').json()
        self.assertEqual((data['farmer_name'], data['reason'], data['remarks']), ('Ana Detail', 'other', 'before the storm'))
        self.assertIn('Buyer pays double', data['reason_text'])
        self.assertEqual(sorted(c['parcel_number'] for c in data['crops']), ['PA', 'PB'])
        self.assertEqual(data['total_kg'], '200.00')
        self.assertTrue(all(c['days_early'] and c['days_early'] > 7 for c in data['crops']))

    def test_another_event_of_the_same_farmer_is_not_mixed_in(self):
        a, b = self.crop(self.parcel_a), self.crop(self.parcel_b)
        self.force([a])
        self.force([b], reason='drought')
        data = self.client.get(f'{MULTI_URL}{self.forced_id(a)}/').json()
        self.assertEqual(len(data['crops']), 1)
        self.assertEqual(data['reason'], 'upcoming_typhoon')

    def test_a_harvest_that_is_not_forced_has_no_details(self):
        crop = self.crop(self.parcel_a, planted_days_ago=60)    # past half its growing time, so Record Harvest is open
        r = self.client.post(CREATE_URL, {'monitoring_record': crop.id, 'farm_parcel': self.parcel_a.id, 'harvest_start_date': str(date.today() - timedelta(days=0)),
                                           'season': 'Wet', 'year': 2026, 'crop_name': 'Detail Rice', 'area_harvested_hectares': '1.00', 'volume_kg': '100',
                                           'unit_of_measure': 'kg', 'early_late_reason': 'Early because of the heat'}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(self.client.get(f'{MULTI_URL}{r.json()["id"]}/').status_code, 404)

    def test_staff_and_the_owning_farmer_can_open_it_but_nobody_else(self):
        crop = self.crop(self.parcel_a)
        self.force([crop])
        url = f'{MULTI_URL}{self.forced_id(crop)}/'
        for user, expected in ((self.admin, 200), (self.focal, 200), (self.citizen_owner, 200), (self.citizen_other, 404)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(url).status_code, expected, user.username)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(url).status_code, (401, 403))
