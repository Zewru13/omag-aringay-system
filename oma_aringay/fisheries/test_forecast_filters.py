"""Fisheries Forecasting filters: a Date Stocked range and the displayed status, on the grouped-by-fisherfolk data (stocking history) and the
Yield Analysis (list, summary), the same filters the Forecast list already takes.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord

HISTORY = '/api/fisheries/stocking/history/'
YIELD = '/api/fisheries/yield-analysis/'
YIELD_SUMMARY = '/api/fisheries/yield-analysis/summary/'
_RSBSA = itertools.count(965001)


class FisheriesForecastFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ffa', password='pw', role='ADMIN', email='ffa@x.test')
        cls.ff = Fisherfolk.objects.create(
            first_name='Fia', last_name='Filter', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species = SpeciesOption.objects.create(
            species_name='FF Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'))
        today = timezone.localdate()

        def make(stocked, status, expected):
            rec = StockingRecord.objects.create(
                fisherfolk=cls.ff, species=cls.species, culture_type='Pond', date_stocked=stocked, number_of_fingerlings=100, season='Dry',
                year=stocked.year, pond_location_barangay='Poblacion')
            # saving a record works out its status and expected date, so both are set directly
            StockingRecord.objects.filter(pk=rec.pk).update(status=status, expected_harvest_date=expected)
            return rec

        cls.stocked = make(date(2026, 3, 1), 'Stocked', today + timedelta(days=90))
        cls.near = make(date(2026, 4, 1), 'Stocked', today + timedelta(days=5))
        cls.late = make(date(2026, 5, 1), 'Stocked', today - timedelta(days=4))
        cls.harvested_early = make(date(2026, 1, 10), 'Harvested', today - timedelta(days=100))
        cls.harvested_late = make(date(2026, 8, 10), 'Harvested', today - timedelta(days=20))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def ids(self, url, **params):
        r = self.client.get(url, params)
        self.assertEqual(r.status_code, 200, r.content[:300])
        body = r.json()
        rows = body['records'] if isinstance(body, dict) and 'records' in body else body['results'] if isinstance(body, dict) else body
        return {row['id'] for row in rows}

    # ── the grouped-by-fisherfolk data
    def test_history_is_every_status_when_nothing_is_chosen(self):
        self.assertEqual(len(self.ids(HISTORY)), 5)

    def test_history_filters_by_the_displayed_status(self):
        self.assertEqual(self.ids(HISTORY, status='Stocked'), {self.stocked.id})
        self.assertEqual(self.ids(HISTORY, status='Near Harvest'), {self.near.id})
        self.assertEqual(self.ids(HISTORY, status='Late'), {self.late.id})
        self.assertEqual(self.ids(HISTORY, status='Harvested'), {self.harvested_early.id, self.harvested_late.id})

    def test_history_filters_by_date_stocked_both_ends_included(self):
        self.assertEqual(self.ids(HISTORY, stocked_from='2026-04-01', stocked_to='2026-05-01'), {self.near.id, self.late.id})
        self.assertEqual(self.ids(HISTORY, stocked_from='2026-08-10'), {self.harvested_late.id})
        self.assertEqual(self.ids(HISTORY, stocked_to='2026-01-10'), {self.harvested_early.id})

    def test_history_dates_and_status_work_together(self):
        self.assertEqual(self.ids(HISTORY, status='Harvested', stocked_from='2026-06-01'), {self.harvested_late.id})

    def test_history_refuses_a_reversed_range(self):
        self.assertEqual(self.client.get(HISTORY, {'stocked_from': '2026-09-01', 'stocked_to': '2026-01-01'}).status_code, 400)

    # ── the Yield Analysis
    def test_the_yield_analysis_filters_by_date_stocked_both_ends_included(self):
        self.assertEqual(self.ids(YIELD, stocked_from='2026-01-10', stocked_to='2026-01-10'), {self.harvested_early.id})
        self.assertEqual(self.ids(YIELD, stocked_from='2026-02-01'), {self.harvested_late.id})
        self.assertEqual(self.ids(YIELD, stocked_to='2026-02-01'), {self.harvested_early.id})
        self.assertEqual(self.ids(YIELD), {self.harvested_early.id, self.harvested_late.id})

    def test_the_yield_summary_follows_the_same_dates(self):
        r = self.client.get(YIELD_SUMMARY, {'stocked_from': '2026-08-01'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['overall']['stocking_count'], 1)
