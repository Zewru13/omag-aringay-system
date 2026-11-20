"""Sensible limits on what a crop record and its disaster report may hold (audit 2026-11-20).

Before, a crop could be saved with a negative or zero planted area (the estimated yield then came out negative), a year of 1900 or
2200, a planting date in 1970, and a disaster dated before the crop was even planted.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropDisasterReport, CropMonitoringRecord, CropType

from .test_crop_record_duplicates import make_farmer, make_parcel, make_record, payload

URL = '/api/production/monitoring/'


class CropValueLimitTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='cvl-admin', password='pw', role='ADMIN', email='cvl-admin@x.test')
        cls.farmer = make_farmer('Limit')
        cls.parcel = make_parcel(cls.farmer)
        cls.crop = CropType.objects.order_by('id').first()

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, **over):
        return self.client.post(URL, payload(self.farmer, self.crop, self.parcel, **over), format='json')

    def test_a_normal_record_is_still_accepted(self):
        r = self.post()
        self.assertEqual(r.status_code, 201, r.content)

    def test_a_negative_area_is_refused(self):
        r = self.post(area_planted_ha='-1.00')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('area_planted_ha', r.json())
        self.assertEqual(CropMonitoringRecord.objects.count(), 0)

    def test_a_zero_area_is_refused(self):
        r = self.post(area_planted_ha='0')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('area_planted_ha', r.json())

    def test_an_absurdly_large_area_is_refused(self):
        r = self.client.post(URL, payload(self.farmer, self.crop, None, area_planted_ha='5000'), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('area_planted_ha', r.json())

    def test_a_year_in_the_distant_past_or_future_is_refused(self):
        for year in (1900, 2200):
            r = self.post(year=year)
            self.assertEqual(r.status_code, 400, (year, r.content))
            self.assertIn('year', r.json())

    def test_a_planting_date_decades_ago_is_refused(self):
        r = self.post(date_planted='1970-05-01', year=1970)
        self.assertEqual(r.status_code, 400, r.content)

    def test_editing_a_record_to_a_negative_area_is_refused(self):
        record = make_record(self.farmer, self.crop, self.parcel)
        r = self.client.patch(f'{URL}{record.id}/', {'area_planted_ha': '-3'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        record.refresh_from_db()
        self.assertEqual(str(record.area_planted_ha), '1.00')


class DisasterBeforePlantingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='dbp-admin', password='pw', role='ADMIN', email='dbp-admin@x.test')
        cls.farmer = make_farmer('Storm')
        cls.record = make_record(cls.farmer, CropType.objects.order_by('id').first(), make_parcel(cls.farmer), date_planted=date(2026, 5, 10))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, when):
        return self.client.post(f'{URL}{self.record.id}/disasters/', {
            'disaster_type': 'Typhoon', 'date_of_occurrence': when, 'area_affected_ha': '0.50',
            'estimated_damage': 'Wind', 'production_loss': 'Some'}, format='json')

    def test_a_disaster_before_the_crop_was_planted_is_refused(self):
        r = self.post('2026-05-01')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('date_of_occurrence', r.json())
        self.assertEqual(CropDisasterReport.objects.count(), 0)

    def test_a_disaster_on_or_after_the_planting_date_is_accepted(self):
        self.assertEqual(self.post('2026-05-10').status_code, 201)
        self.assertEqual(self.post('2026-06-01').status_code, 201)
