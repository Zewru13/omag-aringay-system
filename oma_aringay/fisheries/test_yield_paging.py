"""Fisheries yield analysis: one page of the list on request (and a search), the whole list otherwise, and a summary
that is built chunk by chunk without changing its numbers."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord

_RSBSA = itertools.count(940001)
LIST = '/api/fisheries/yield-analysis/'
SUMMARY = '/api/fisheries/yield-analysis/summary/'


class FisheriesYieldPagingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='yp-staff', password='pw', role='ADMIN', email='yp@x.test')
        cls.fisherfolk = Fisherfolk.objects.create(
            first_name='Pablo', last_name='Reyes', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='YP Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        for _ in range(5):
            StockingRecord.objects.create(
                fisherfolk=cls.fisherfolk, species=cls.species, culture_type='Pond', date_stocked=date(2026, 1, 1),
                number_of_fingerlings=100, season='Dry', year=2026, status='Harvested', pond_location_barangay='Poblacion')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def test_everything_without_page(self):
        r = self.client.get(LIST).json()
        self.assertEqual((r['count'], len(r['records'])), (5, 5))

    def test_one_page_and_the_total(self):
        r = self.client.get(LIST, {'page': 2, 'page_size': 2}).json()
        self.assertEqual((r['count'], len(r['records']), r['page']), (5, 2, 2))
        self.assertEqual(len(self.client.get(LIST, {'page': 3, 'page_size': 2}).json()['records']), 1)

    def test_search_needs_every_word(self):
        self.assertEqual(self.client.get(LIST, {'page': 1, 'search': 'pablo tilapia'}).json()['count'], 5)
        self.assertEqual(self.client.get(LIST, {'page': 1, 'search': 'pablo nothing'}).json()['count'], 0)
        self.assertEqual(self.client.get(LIST, {'page': 1, 'search': 'poblacion'}).json()['count'], 5)

    def test_summary_counts_match(self):
        s = self.client.get(SUMMARY).json()
        self.assertEqual(s['overall']['stocking_count'], 5)
        self.assertEqual(sum(g['stocking_count'] for g in s['groups']), 5)
