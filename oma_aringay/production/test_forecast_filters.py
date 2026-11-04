"""Forecasting filters: the status of a growing crop (Planted / Near Harvest / Overdue, as the Forecast table shows it) and a Date Planted range,
on the Forecast list, the Yield Analysis (list, summary) and the grouped-by-farmer data they share.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date, timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from production.models import CropMonitoringRecord
from production.test_farmer_scope import make_crop, make_farmer, make_staff

MONITORING = '/api/production/monitoring/'
YIELD = '/api/production/yield-analysis/'
YIELD_SUMMARY = '/api/production/yield-analysis/summary/'
HISTORY = '/api/reports/farmer-crop-history/'


class ForecastFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('ff-admin')
        cls.farmer = make_farmer('Fern', 'Forecast')
        today = timezone.localdate()
        cls.future, cls.past = today + timedelta(days=30), today - timedelta(days=3)
        cls.planted_ahead = make_crop(cls.farmer, status='Planted', date_planted=date(2026, 3, 1))
        cls.planted_late = make_crop(cls.farmer, status='Planted', date_planted=date(2026, 4, 1))
        cls.near_ahead = make_crop(cls.farmer, status='Near Harvest', date_planted=date(2026, 5, 1))
        cls.near_late = make_crop(cls.farmer, status='Near Harvest', date_planted=date(2026, 6, 1))
        cls.no_date = make_crop(cls.farmer, status='Planted', date_planted=date(2026, 7, 1))
        # saving a record works out its status from the dates, so the statuses and expected dates are set directly
        for rec, status, expected in ((cls.planted_ahead, 'Planted', cls.future), (cls.planted_late, 'Planted', cls.past), (cls.near_ahead, 'Near Harvest', cls.future),
                                      (cls.near_late, 'Near Harvest', cls.past), (cls.no_date, 'Planted', None)):
            CropMonitoringRecord.objects.filter(pk=rec.pk).update(status=status, expected_harvest_date=expected)
        cls.harvested_early = make_crop(cls.farmer, status='Harvested', date_planted=date(2026, 1, 10))
        cls.harvested_late = make_crop(cls.farmer, status='Harvested', date_planted=date(2026, 8, 10))
        CropMonitoringRecord.objects.filter(pk__in=[cls.harvested_early.pk, cls.harvested_late.pk]).update(status='Harvested')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def ids(self, url, **params):
        r = self.client.get(url, params)
        self.assertEqual(r.status_code, 200, r.content[:300])
        body = r.json()
        rows = body['results'] if isinstance(body, dict) and 'results' in body else body['records'] if isinstance(body, dict) else body
        return {row['id'] for row in rows}

    # ── the forecast status, as the Forecast table's pill reads it
    def test_planted_means_planted_and_not_past_its_expected_harvest(self):
        got = self.ids(MONITORING, status='Planted,Near Harvest', forecast_status='Planted')
        self.assertEqual(got, {self.planted_ahead.id, self.no_date.id})

    def test_near_harvest_means_near_harvest_and_not_past_its_expected_harvest(self):
        self.assertEqual(self.ids(MONITORING, status='Planted,Near Harvest', forecast_status='Near Harvest'), {self.near_ahead.id})

    def test_overdue_is_any_growing_crop_past_its_expected_harvest(self):
        self.assertEqual(self.ids(MONITORING, status='Planted,Near Harvest', forecast_status='Overdue'), {self.planted_late.id, self.near_late.id})

    def test_without_a_forecast_status_every_growing_crop_is_listed(self):
        got = self.ids(MONITORING, status='Planted,Near Harvest')
        self.assertEqual(got, {self.planted_ahead.id, self.planted_late.id, self.near_ahead.id, self.near_late.id, self.no_date.id})

    def test_an_unknown_forecast_status_is_ignored(self):
        self.assertEqual(len(self.ids(MONITORING, status='Planted,Near Harvest', forecast_status='nonsense')), 5)

    # ── Date Planted From / To
    def test_the_forecast_list_filters_by_date_planted(self):
        got = self.ids(MONITORING, status='Planted,Near Harvest', planted_from='2026-04-01', planted_to='2026-05-31')
        self.assertEqual(got, {self.planted_late.id, self.near_ahead.id})

    def test_the_yield_analysis_filters_by_date_planted_both_ends_included(self):
        self.assertEqual(self.ids(YIELD, planted_from='2026-01-10', planted_to='2026-01-10'), {self.harvested_early.id})
        self.assertEqual(self.ids(YIELD, planted_from='2026-02-01'), {self.harvested_late.id})
        self.assertEqual(self.ids(YIELD, planted_to='2026-02-01'), {self.harvested_early.id})
        self.assertEqual(self.ids(YIELD), {self.harvested_early.id, self.harvested_late.id})

    def test_the_yield_summary_follows_the_same_dates(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get(YIELD_SUMMARY, {'planted_from': '2026-08-01'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['overall']['harvested_crop_count'], 1)

    # ── the grouped-by-farmer data
    def test_the_grouped_data_filters_by_date_planted(self):
        got = self.ids(HISTORY, format='json', planted_from='2026-08-01')
        self.assertEqual(got, {self.harvested_late.id})

    def test_the_grouped_data_filters_by_forecast_status(self):
        got = self.ids(HISTORY, format='json', forecast_status='Overdue')
        self.assertEqual(got, {self.planted_late.id, self.near_late.id})
        self.assertEqual(self.ids(HISTORY, format='json', forecast_status='Near Harvest'), {self.near_ahead.id})

    def test_the_grouped_data_without_filters_is_every_status_as_before(self):
        self.assertEqual(len(self.ids(HISTORY, format='json')), 7)

    def test_a_reversed_range_is_refused_like_every_other_date_filter(self):
        r = self.client.get(YIELD, {'planted_from': '2026-09-01', 'planted_to': '2026-01-01'})
        self.assertEqual(r.status_code, 400)
