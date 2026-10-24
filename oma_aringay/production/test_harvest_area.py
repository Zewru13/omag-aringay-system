"""The area harvested cannot be more than the area the crop was planted on (production/harvest_area.py)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

CREATE_URL = '/api/production/create/'
FORCED_URL = '/api/production/forced-harvest/'
_RSBSA = itertools.count(970001)


class HarvestAreaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ha-adm', password='pw', role='ADMIN', email='ha@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Area', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='3.00', land_ownership='Owner', barangay='Alaska')
        cls.crop_type, _ = CropType.objects.get_or_create(name='Area Rice', defaults=dict(days_to_harvest=100))
        cls.crop_type.days_to_harvest = 100
        cls.crop_type.save()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def crop(self, planted='2.00', planted_days_ago=96, **over):
        data = dict(farmer=self.farmer, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.crop_type,
                    season='Wet', year=2026, date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha=planted, status='Planted')
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def body(self, crop, area, **over):
        body = {'monitoring_record': crop.id, 'farm_parcel': self.parcel.id, 'harvest_start_date': str(date.today()), 'season': 'Wet', 'year': 2026,
                'crop_name': 'Area Rice', 'area_harvested_hectares': area, 'volume_kg': '100', 'unit_of_measure': 'kg'}
        body.update(over)
        return body

    def test_the_whole_planted_area_can_be_harvested(self):
        self.assertEqual(self.client.post(CREATE_URL, self.body(self.crop('2.00'), '2.00'), format='json').status_code, 201)

    def test_more_than_was_planted_is_refused_with_the_limit_named(self):
        r = self.client.post(CREATE_URL, self.body(self.crop('2.00'), '2.01'), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['area_harvested_hectares'], ['The area harvested cannot be more than the area planted (2 ha).'])
        self.assertEqual(HarvestRecord.objects.count(), 0)

    def test_the_harvests_of_one_crop_together_cannot_cover_more_than_was_planted(self):
        crop = self.crop('2.00')
        HarvestRecord.objects.create(monitoring_record=crop, farm_parcel=self.parcel, season='Wet', year=2026, crop_name='Area Rice',
                                     area_harvested_hectares='1.50', volume_kg='100', harvest_start_date=date.today())
        refused = self.client.post(CREATE_URL, self.body(crop, '0.60'), format='json')
        self.assertEqual(refused.status_code, 400)
        self.assertIn('Only 0.5 ha of the 2 ha planted is left to harvest: 1.5 ha was already harvested', refused.json()['area_harvested_hectares'][0])
        self.assertEqual(self.client.post(CREATE_URL, self.body(crop, '0.50'), format='json').status_code, 201)

    def test_editing_a_harvest_is_checked_and_does_not_count_it_against_itself(self):
        crop = self.crop('2.00')
        harvest = HarvestRecord.objects.create(monitoring_record=crop, farm_parcel=self.parcel, season='Wet', year=2026, crop_name='Area Rice',
                                               area_harvested_hectares='2.00', volume_kg='100', harvest_start_date=date.today())
        url = f'/api/production/{harvest.id}/'
        self.assertEqual(self.client.patch(url, {'area_harvested_hectares': '1.80'}, format='json').status_code, 200)
        r = self.client.patch(url, {'area_harvested_hectares': '2.50'}, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('area_harvested_hectares', r.json())
        self.assertEqual(self.client.patch(url, {'remarks': 'checked'}, format='json').status_code, 200)

    def test_a_harvest_with_no_crop_record_is_limited_to_its_parcel(self):
        body = {'farm_parcel': self.parcel.id, 'harvest_start_date': str(date.today()), 'season': 'Wet', 'year': 2026, 'crop_name': 'Area Rice',
                'area_harvested_hectares': '3.50', 'volume_kg': '100', 'unit_of_measure': 'kg'}
        r = self.client.post(CREATE_URL, body, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertEqual(r.json()['area_harvested_hectares'], ['The area harvested cannot be more than the parcel (3 ha).'])
        self.assertEqual(self.client.post(CREATE_URL, {**body, 'area_harvested_hectares': '3.00'}, format='json').status_code, 201)

    def test_a_forced_harvest_of_several_crops_is_limited_too_and_saves_nothing(self):
        a, b = self.crop('2.00', planted_days_ago=20), self.crop('1.00', planted_days_ago=20)
        data = {'harvest_date': str(date.today()), 'force_harvest_reason': 'drought',
                'crops': [{'monitoring_record': a.id, 'area_harvested_hectares': '2.00', 'volume_kg': '10', 'unit_of_measure': 'kg'},
                          {'monitoring_record': b.id, 'area_harvested_hectares': '1.50', 'volume_kg': '10', 'unit_of_measure': 'kg'}]}
        r = self.client.post(FORCED_URL, data, format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('area planted', r.json()['detail'])
        self.assertEqual(HarvestRecord.objects.count(), 0)
