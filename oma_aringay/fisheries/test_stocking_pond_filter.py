"""The Aquaculture Monitoring list can be narrowed by pond / cage name: the name of the stock's Pond, or the label of one of
its production units ("Pond 2", "Cage 1")."""
import itertools
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from fisheries.models import Fisherfolk, Pond, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit

_RSBSA = itertools.count(930001)
URL = '/api/fisheries/stocking/'


class StockingPondFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='pf-staff', password='pw', role='ADMIN', email='pf@x.test')
        cls.fisherfolk = Fisherfolk.objects.create(
            first_name='Pond', last_name='Filter', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        category, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='PF Tilapia', defaults=dict(
            category=category, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg='0.25'))
        cls.north = cls.stock(pond=Pond.objects.create(fisherfolk=cls.fisherfolk, name='North Dike', barangay='Poblacion'))
        cls.south = cls.stock(pond=Pond.objects.create(fisherfolk=cls.fisherfolk, name='South Pond', barangay='Poblacion'))
        cls.caged = cls.stock(units=[('pond', 1), ('cage', 2)])
        cls.plain = cls.stock()

    @classmethod
    def stock(cls, pond=None, units=()):
        cycle = None
        if units:
            cycle = AquacultureProductionCycle.objects.create(
                fisherfolk=cls.fisherfolk, cycle_name='Grow-out', species_farmed=cls.species.species_name, culture_system='Fishpond',
                stocking_date=date(2026, 8, 1))
            for kind, number in units:
                AquacultureProductionUnit.objects.create(
                    production_cycle=cycle, unit_type=kind, unit_number=number, length_m=Decimal('4'), width_m=Decimal('2'),
                    size_sqm=Decimal('8'), fingerling_count=100)
        return StockingRecord.objects.create(
            fisherfolk=cls.fisherfolk, pond=pond, production_cycle=cycle, species=cls.species, culture_type='Pond',
            date_stocked=date(2026, 8, 1), number_of_fingerlings=100, season='Wet', year=2026)

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def ids(self, **params):
        response = self.client.get(URL, params)
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()
        return {row['id'] for row in (data['results'] if isinstance(data, dict) else data)}

    def test_no_pond_filter_lists_everything(self):
        self.assertEqual(self.ids(), {self.north.id, self.south.id, self.caged.id, self.plain.id})

    def test_a_pond_name_matches_that_pond_only(self):
        self.assertEqual(self.ids(pond='North Dike'), {self.north.id})

    def test_the_match_is_partial_and_ignores_case(self):
        self.assertEqual(self.ids(pond='dike'), {self.north.id})
        self.assertEqual(self.ids(pond='SOUTH'), {self.south.id})

    def test_a_production_unit_label_matches_its_stock(self):
        self.assertEqual(self.ids(pond='Cage 2'), {self.caged.id})
        self.assertEqual(self.ids(pond='cage'), {self.caged.id})

    def test_a_name_nobody_has_gives_an_empty_list(self):
        self.assertEqual(self.ids(pond='Nonexistent'), set())

    def test_surrounding_spaces_are_ignored_and_a_blank_filter_is_no_filter(self):
        self.assertEqual(self.ids(pond='  north dike  '), {self.north.id})
        self.assertEqual(self.ids(pond='   '), {self.north.id, self.south.id, self.caged.id, self.plain.id})

    def test_a_stock_with_two_matching_units_is_listed_once(self):
        response = self.client.get(URL, {'pond': 'pond'})
        data = response.json()
        rows = data['results'] if isinstance(data, dict) else data
        listed = [row['id'] for row in rows]
        self.assertEqual(len(listed), len(set(listed)))
        self.assertIn(self.caged.id, listed)       # its "Pond 1" unit
