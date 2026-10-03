"""Yield analysis: the number of database queries must not grow with the number of harvested crops (it used to
run one stage query per crop, which made the page take minutes against the remote database)."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.models import CropActivityLog, CropActivityStage, CropMonitoringRecord, CropType, HarvestRecord

YIELD = '/api/production/yield-analysis/'
SUMMARY = '/api/production/yield-analysis/summary/'


class YieldAnalysisQueryCountTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(
            username='admin1', password='pw', role='ADMIN', email='admin1@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000151', first_name='Maria', last_name='Santos', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        # two crops that have scheduled activity stages
        cls.crops = list(CropType.objects.filter(activity_stages__isnull=False).distinct().order_by('id')[:2])

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def harvested(self, crop, n=1):
        planted = date(2026, 1, 1)
        for _ in range(n):
            rec = CropMonitoringRecord.objects.create(
                farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=crop, season='Dry',
                year=2026, date_planted=planted, area_planted_ha='1.00', status='Harvested',
                actual_harvest_date=planted + timedelta(days=120), estimated_yield_kg='1000.00')
            HarvestRecord.objects.create(monitoring_record=rec, season='Dry', year=2026, crop_name=crop.name,
                                         area_harvested_hectares='1.00', volume_kg='900.00')

    def queries(self, url):
        with CaptureQueriesContext(connection) as ctx:
            r = self.client.get(url)
        self.assertEqual(r.status_code, 200)
        return len(ctx), r

    def test_query_count_does_not_grow_with_the_number_of_harvested_crops(self):
        self.harvested(self.crops[0], 2)
        few, _ = self.queries(YIELD)
        self.harvested(self.crops[0], 8)
        self.harvested(self.crops[1], 8)
        many, r = self.queries(YIELD)
        self.assertEqual(r.json()['count'], 18)
        self.assertEqual(few, many)

    def test_summary_query_count_is_flat_too(self):
        self.harvested(self.crops[0], 2)
        few, _ = self.queries(SUMMARY)
        self.harvested(self.crops[1], 10)
        many, _ = self.queries(SUMMARY)
        self.assertEqual(few, many)

    def test_activity_completion_is_still_computed_per_crop(self):
        self.harvested(self.crops[0], 1)
        rec = CropMonitoringRecord.objects.get(crop_type=self.crops[0])
        stage = CropActivityStage.objects.filter(crop_type=self.crops[0]).order_by('day_after_planting', 'id').first()
        CropActivityLog.objects.create(monitoring_record=rec, activity_type=stage.stage_name,
                                       date_of_activity=rec.date_planted + timedelta(days=stage.day_after_planting),
                                       target_day=stage.day_after_planting)
        row = self.client.get(YIELD).json()['records'][0]
        self.assertEqual(row['farmer'], 'Maria Santos')
        self.assertEqual(row['barangay'], 'Alaska')
        self.assertEqual(row['actual_total_kg'], 900.0)
        self.assertEqual(row['variance_kg'], round(900.0 - row['estimated_kg'], 2))   # estimate is computed when the crop is saved
        self.assertGreaterEqual(row['activities_total_count'], 1)
        self.assertGreaterEqual(row['activities_completed_count'], 1)
        self.assertLessEqual(row['activities_completed_count'], row['activities_total_count'])
