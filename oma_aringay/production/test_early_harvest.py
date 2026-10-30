"""Record Harvest of a crop opens once half of its growing time (date planted to expected harvest date) has passed, measured at the harvest
date. Before that the crop is harvested with Force Harvest (its own button and form). From half on, no reason is needed unless the harvest is
more than 7 days late."""
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

    def test_a_crop_younger_than_half_its_growing_time_cannot_be_harvested_here(self):
        crop = self._crop(planted_days_ago=20)          # 20% of its 100-day growing time
        r = self.client.post(URL, self._body(crop), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('harvest_start_date', r.json())
        self.assertIn('Force Harvest', str(r.json()['harvest_start_date']))
        # a reason does not open it: harvesting before then is the separate Force Harvest
        self.assertEqual(self.client.post(URL, self._body(crop, early_late_reason='Upcoming storm'), format='json').status_code, 400)
        self.assertFalse(HarvestRecord.objects.filter(monitoring_record=crop).exists())

    def test_the_gate_opens_at_half_the_growing_time_and_then_needs_no_reason(self):
        for days, ok in ((49, False), (50, True), (60, True)):
            crop = self._crop(planted_days_ago=days)
            r = self.client.post(URL, self._body(crop), format='json')
            self.assertEqual(r.status_code, 201 if ok else 400, (days, r.content))
        harvest = HarvestRecord.objects.get(monitoring_record__date_planted=date.today() - timedelta(days=60))
        self.assertEqual(harvest.harvest_variance_days, -40)
        self.assertEqual(harvest.early_late_reason, '')

    def test_the_date_of_the_harvest_is_what_is_measured(self):
        crop = self._crop(planted_days_ago=60)
        early = str(date.today() - timedelta(days=20))   # only 40 days after planting
        self.assertEqual(self.client.post(URL, self._body(crop, harvest_start_date=early), format='json').status_code, 400)

    def test_a_forced_harvest_is_not_held_back_by_the_gate(self):
        crop = self._crop(planted_days_ago=20)
        body = self._body(crop, force_harvest_reason='upcoming_typhoon')
        self.assertEqual(self.client.post(URL, body, format='json').status_code, 201)

    def test_a_late_harvest_still_needs_a_reason(self):
        crop = self._crop(planted_days_ago=120)         # 20 days after the expected date
        r = self.client.post(URL, self._body(crop), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('early_late_reason', r.json())
        self.assertEqual(self.client.post(URL, self._body(crop, early_late_reason='Rain delayed it'), format='json').status_code, 201)

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
