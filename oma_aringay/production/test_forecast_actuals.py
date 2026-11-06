"""Crop Forecasting's actual harvest: the Forecast list also lists harvested crops (like Fisheries Forecasting), each with the date it was actually
harvested and whether that was Early / On-Time / Late against the expected harvest date - the same rule as Fisheries Forecasting
(fisheries.models.harvest_timing), read from the crop's own harvest records. Nothing is stored for it: no new column, no copied harvest.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date, datetime, timedelta, timezone as dt_timezone
from decimal import Decimal

from rest_framework.test import APITestCase

from fisheries.models import harvest_timing
from production.models import CropMonitoringRecord, HarvestRecord
from production.test_farmer_scope import make_crop, make_farmer, make_staff

MONITORING = '/api/production/monitoring/'
EXPECTED = date(2026, 9, 10)


def harvest(crop, kg, start, recorded=None):
    """A harvest of the crop on `start` (the day it was harvested), recorded `recorded` (default: a few days later)."""
    rec = HarvestRecord.objects.create(
        monitoring_record=crop, season='Wet', year=2026, crop_name='Forecast Rice', area_harvested_hectares='1.00',
        harvest_start_date=start, volume_kg=Decimal(str(kg)))
    when = recorded or datetime.combine(start + timedelta(days=3), datetime.min.time(), tzinfo=dt_timezone.utc)
    HarvestRecord.objects.filter(pk=rec.pk).update(date_recorded=when)
    return rec


class ForecastActualsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = make_staff('fa-admin')
        cls.farmer = make_farmer('Fay', 'Actuals')
        mk = lambda planted: make_crop(cls.farmer, date_planted=planted)
        cls.growing = mk(date(2026, 6, 1))
        cls.early, cls.on_time, cls.late, cls.multi = mk(date(2026, 6, 2)), mk(date(2026, 6, 3)), mk(date(2026, 6, 4)), mk(date(2026, 6, 5))
        cls.no_start = mk(date(2026, 6, 6))
        harvest(cls.early, 900, date(2026, 9, 5))
        harvest(cls.on_time, 1000, EXPECTED)
        harvest(cls.late, 1200, date(2026, 9, 14))
        harvest(cls.multi, 400, date(2026, 9, 8))
        harvest(cls.multi, 500, date(2026, 9, 12))
        # a harvest saved without a start date: the day it was recorded stands in for it
        nostart = HarvestRecord.objects.create(
            monitoring_record=cls.no_start, season='Wet', year=2026, crop_name='Forecast Rice', area_harvested_hectares='1.00', volume_kg='300')
        HarvestRecord.objects.filter(pk=nostart.pk).update(date_recorded=datetime(2026, 9, 11, 8, 0, tzinfo=dt_timezone.utc))
        # saving a harvest works the crop out again from its dates, so the expected harvest date is set last
        for crop in (cls.growing, cls.early, cls.on_time, cls.late, cls.multi, cls.no_start):
            CropMonitoringRecord.objects.filter(pk=crop.pk).update(expected_harvest_date=EXPECTED)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def rows(self, **params):
        r = self.client.get(MONITORING, params)
        self.assertEqual(r.status_code, 200, r.content[:300])
        body = r.json()
        return body['results'] if isinstance(body, dict) else body

    def by_id(self, **params):
        return {row['id']: row for row in self.rows(**params)}

    # ── the date and the timing, from the harvest records
    def test_the_actual_date_is_the_day_it_was_harvested_and_the_timing_follows_the_fisheries_rule(self):
        got = self.by_id()
        self.assertEqual(got[self.early.id]['latest_harvest_date'], '2026-09-05')
        self.assertEqual([got[self.early.id][k] for k in ('actual_harvest_timing', 'actual_harvest_timing_label', 'actual_harvest_timing_days')], ['early', 'Early Harvest', -5])
        self.assertEqual([got[self.on_time.id][k] for k in ('actual_harvest_timing', 'actual_harvest_timing_label', 'actual_harvest_timing_days')], ['on_time', 'On-Time Harvest', 0])
        self.assertEqual([got[self.late.id][k] for k in ('actual_harvest_timing', 'actual_harvest_timing_label', 'actual_harvest_timing_days')], ['late', 'Late Harvest', 4])

    def test_the_timing_is_exactly_what_the_fisheries_function_says(self):
        got = self.by_id()
        for crop, date_ in ((self.early, date(2026, 9, 5)), (self.on_time, EXPECTED), (self.late, date(2026, 9, 14))):
            self.assertEqual((got[crop.id]['actual_harvest_timing'], got[crop.id]['actual_harvest_timing_days']), harvest_timing(date_, EXPECTED))

    def test_with_several_harvests_the_latest_one_decides(self):
        row = self.by_id()[self.multi.id]
        self.assertEqual(row['latest_harvest_date'], '2026-09-12')
        self.assertEqual((row['actual_harvest_timing'], row['actual_harvest_timing_days']), ('late', 2))
        self.assertEqual(Decimal(str(row['actual_yield_kg'])), Decimal('900'))     # the total of both harvests, as before

    def test_a_harvest_without_a_start_date_uses_the_day_it_was_recorded(self):
        row = self.by_id()[self.no_start.id]
        self.assertEqual(row['latest_harvest_date'], '2026-09-11')
        self.assertEqual(row['actual_harvest_timing'], 'late')

    def test_a_crop_with_no_harvest_has_no_date_and_no_timing(self):
        row = self.by_id()[self.growing.id]
        self.assertEqual([row['latest_harvest_date'], row['actual_harvest_timing'], row['actual_harvest_timing_label'], row['actual_harvest_timing_days']], [None] * 4)
        self.assertIsNone(row['actual_yield_kg'])

    def test_the_stored_actual_harvest_date_is_left_as_it_was(self):
        row = self.by_id()[self.early.id]
        self.assertEqual(row['actual_harvest_date'], CropMonitoringRecord.objects.get(pk=self.early.id).actual_harvest_date.isoformat())

    # ── the Forecast list: growing and harvested crops, growing first
    def test_the_forecast_list_can_include_harvested_crops(self):
        growing_only = set(self.by_id(status='Planted,Near Harvest'))
        everything = set(self.by_id(status='Planted,Near Harvest,Harvested'))
        self.assertEqual(growing_only, {self.growing.id})
        self.assertEqual(everything, {self.growing.id, self.early.id, self.on_time.id, self.late.id, self.multi.id, self.no_start.id})

    def test_the_forecast_status_harvested_lists_only_harvested_crops(self):
        got = set(self.by_id(status='Planted,Near Harvest,Harvested', forecast_status='Harvested'))
        self.assertEqual(got, {self.early.id, self.on_time.id, self.late.id, self.multi.id, self.no_start.id})

    def test_the_other_forecast_statuses_still_mean_growing_crops_only(self):
        self.assertEqual(set(self.by_id(status='Planted,Near Harvest,Harvested', forecast_status='Overdue')), {self.growing.id})
        self.assertEqual(set(self.by_id(status='Planted,Near Harvest,Harvested', forecast_status='Planted')), set())

    def test_the_forecast_order_puts_growing_crops_first_then_by_expected_date(self):
        order = [row['id'] for row in self.rows(status='Planted,Near Harvest,Harvested', ordering='forecast')]
        self.assertEqual(order[0], self.growing.id)
        self.assertEqual(set(order[1:]), {self.early.id, self.on_time.id, self.late.id, self.multi.id, self.no_start.id})

    def test_the_existing_expected_date_order_is_unchanged(self):
        order = [row['id'] for row in self.rows(status='Planted,Near Harvest', ordering='expected_harvest_date')]
        self.assertEqual(order, [self.growing.id])
