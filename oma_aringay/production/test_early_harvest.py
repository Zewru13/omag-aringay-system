"""A crop can be harvested at any time. Harvesting more than 7 days early needs a reason, which is saved with the harvest.
(The old rule that blocked Record Harvest until half the growing time had passed is gone for crops.)"""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

URL = '/api/production/create/'
_RSBSA = itertools.count(930001)


class EarlyHarvestTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='adm', password='pw', role='ADMIN', email='adm@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Early', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.crop_type, _ = CropType.objects.get_or_create(name='Early Test Crop', defaults=dict(days_to_harvest=100))
        cls.crop_type.days_to_harvest = 100
        cls.crop_type.save()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def _crop(self, planted_days_ago=20, **over):
        data = dict(farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.crop_type,
                    season='Wet', year=2026, date_planted=date.today() - timedelta(days=planted_days_ago),
                    area_planted_ha='1.00', status='Planted')
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def _body(self, crop, **over):
        body = {'monitoring_record': crop.id, 'harvest_start_date': str(date.today()), 'season': 'Wet', 'year': 2026,
                'crop_name': 'Early Test Crop', 'area_harvested_hectares': '1.00', 'volume_kg': '100', 'unit_of_measure': 'kg'}
        body.update(over)
        return body

    def test_a_young_crop_can_be_harvested_with_a_reason(self):
        crop = self._crop(planted_days_ago=20)          # 20% of its 100-day growing time: the old rule refused this
        r = self.client.post(URL, self._body(crop, early_late_reason='Upcoming storm'), format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_the_reason_and_how_early_it_was_are_saved(self):
        crop = self._crop(planted_days_ago=20)
        r = self.client.post(URL, self._body(crop, early_late_reason='Drought'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        harvest = HarvestRecord.objects.get(pk=r.json()['id'])
        self.assertEqual(harvest.early_late_reason, 'Drought')
        self.assertEqual(harvest.harvest_variance_days, -80)

    def test_an_early_harvest_without_a_reason_is_refused(self):
        crop = self._crop(planted_days_ago=20)
        r = self.client.post(URL, self._body(crop), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('early_late_reason', r.json())

    def test_a_harvest_a_few_days_early_needs_no_reason(self):
        crop = self._crop(planted_days_ago=96)          # 4 days before the expected date: within the 7-day tolerance
        self.assertEqual(self.client.post(URL, self._body(crop), format='json').status_code, 201)

    def test_a_total_loss_crop_still_cannot_be_harvested(self):
        crop = self._crop(planted_days_ago=60, status='Total Loss')
        r = self.client.post(URL, self._body(crop, early_late_reason='Drought'), format='json')
        self.assertEqual(r.status_code, 400)

    def test_an_estimated_planting_date_still_blocks_harvest(self):
        crop = self._crop(planted_days_ago=60, date_planted_is_estimated=True)
        r = self.client.post(URL, self._body(crop, early_late_reason='Drought'), format='json')
        self.assertEqual(r.status_code, 400)
