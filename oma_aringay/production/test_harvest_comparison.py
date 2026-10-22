"""Farmers / Fisherfolk lists: how many people's actual harvest exceeded the estimate made when it was planted or stocked."""
import itertools
from datetime import date
from decimal import Decimal

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk, FisheriesHarvestRecord, SpeciesCategory, SpeciesOption, StockingRecord
from production.models import CropMonitoringRecord, CropType

FARMERS = '/api/farmers/harvest-comparison/'
FISHERFOLK = '/api/fisheries/fisherfolk/harvest-comparison/'
_N = itertools.count(1)
User = get_user_model()


def farmer(first, last='Compare', barangay='Alaska', gender='Male'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (930000 + next(_N)), first_name=first, last_name=last, gender=gender,
        birthdate=date(1985, 1, 1), barangay=barangay, civil_status='Single')


def fisherfolk(first, last='Compare', barangay='Alaska'):
    return Fisherfolk.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (931000 + next(_N)), first_name=first, last_name=last, gender='Male',
        birthdate=date(1990, 1, 1), barangay=barangay, fisherfolk_type='Inland')


def harvested_crop(person, estimated, actual, year=2026):
    rec = CropMonitoringRecord.objects.create(
        farmer=person, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=year, date_planted=date(year, 1, 5), area_planted_ha='1.00', status='Planted')
    CropMonitoringRecord.objects.filter(pk=rec.pk).update(
        status='Harvested', estimated_yield_kg=None if estimated is None else Decimal(estimated), actual_yield_kg=None if actual is None else Decimal(actual))
    return rec


class CropComparisonTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='hc-admin', password='pw', role='ADMIN', email='hc-admin@x.test')
        cls.citizen = User.objects.create_user(username='hc-citizen', password='pw', role='CITIZEN', email='hc-citizen@x.test')
        cls.up, cls.down, cls.same, cls.nothing, cls.planted_only = (
            farmer('Up'), farmer('Down', barangay='Basca'), farmer('Same'), farmer('Nothing'), farmer('Planted'))
        harvested_crop(cls.up, 1000, 1300)
        harvested_crop(cls.down, 1000, 700)
        harvested_crop(cls.same, 500, 500)
        CropMonitoringRecord.objects.create(
            farmer=cls.planted_only, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00', status='Planted')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, **params):
        return self.client.get(FARMERS, {'year': 2026, **params})

    def test_counts_by_whether_the_actual_harvest_exceeded_the_estimate(self):
        data = self.get().json()
        self.assertEqual((data['increased'], data['decreased'], data['on_target'], data['no_data']), (1, 1, 1, 2))
        self.assertEqual((data['compared'], data['total'], data['year']), (3, 5, 2026))

    def test_a_farmers_records_are_added_together(self):
        harvested_crop(self.down, 1000, 100)        # down: 800 actual against 2000 estimated, still below
        self.assertEqual(self.get().json()['decreased'], 1)
        harvested_crop(self.down, 100, 3000)        # now 3800 against 2100: above
        data = self.get().json()
        self.assertEqual((data['increased'], data['decreased']), (2, 0))

    def test_only_the_chosen_year_counts_and_all_years_can_be_chosen(self):
        harvested_crop(self.nothing, 100, 400, year=2025)
        self.assertEqual(self.get().json()['increased'], 1)
        self.assertEqual(self.get(year=2025).json()['increased'], 1)
        data = self.get(year='all').json()
        self.assertEqual((data['increased'], data['year']), (2, None))

    def test_records_missing_the_estimate_or_the_actual_are_not_compared(self):
        harvested_crop(self.nothing, None, 400)
        harvested_crop(self.planted_only, 100, None)
        data = self.get().json()
        self.assertEqual((data['compared'], data['no_data']), (3, 2))

    def test_it_follows_the_list_filters(self):
        self.assertEqual(self.get(search='Down').json()['total'], 1)
        self.assertEqual(self.get(search='Down').json()['decreased'], 1)
        self.assertEqual(self.get(search='nobody').json()['total'], 0)
        self.assertEqual(self.get(search='nobody').json()['compared'], 0)

    def test_the_year_must_be_a_year(self):
        self.assertEqual(self.client.get(FARMERS, {'year': 'abc'}).status_code, 400)

    def test_a_farmer_account_cannot_read_it(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.get().status_code, 403)


class FisheriesComparisonTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='hf-admin', password='pw', role='ADMIN', email='hf-admin@x.test')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Compare Tilapia', defaults=dict(
            category=cat, culture_environment='Freshwater', culture_duration_days=120, default_survival_rate_pct=80,
            default_avg_body_weight_kg=Decimal('0.25')))
        cls.up, cls.down, cls.waiting = fisherfolk('Up'), fisherfolk('Down'), fisherfolk('Waiting')
        for person, kg in ((cls.up, 260), (cls.down, 150)):
            cls.harvest(person, kg)
        waiting = StockingRecord.objects.create(
            fisherfolk=cls.waiting, species=cls.species, culture_type='Pond', date_stocked=date(2026, 3, 1), number_of_fingerlings=1000, season='Dry', year=2026)
        assert waiting.status != 'Harvested'

    @classmethod
    def harvest(cls, person, kg, year=2026):
        rec = StockingRecord.objects.create(
            fisherfolk=person, species=cls.species, culture_type='Pond', date_stocked=date(year, 3, 1), number_of_fingerlings=1000, season='Dry', year=year)
        StockingRecord.objects.filter(pk=rec.pk).update(status='Harvested')
        FisheriesHarvestRecord.objects.create(stocking_record=rec, harvest_date=date(year, 7, 1), quantity_kg=Decimal(kg))     # estimate: 1000 x 80% x 0.25 = 200 kg
        return rec

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_counts_by_whether_the_actual_harvest_exceeded_the_estimate(self):
        data = self.client.get(FISHERFOLK, {'year': 2026}).json()
        self.assertEqual((data['increased'], data['decreased'], data['on_target'], data['no_data']), (1, 1, 0, 1))
        self.assertEqual((data['compared'], data['total']), (2, 3))

    def test_several_harvests_of_one_stocking_add_up(self):
        rec = StockingRecord.objects.filter(fisherfolk=self.down).first()
        FisheriesHarvestRecord.objects.create(stocking_record=rec, harvest_date=date(2026, 8, 1), quantity_kg=Decimal(80))     # 150 + 80 = 230 > 200
        self.assertEqual(self.client.get(FISHERFOLK, {'year': 2026}).json()['increased'], 2)

    def test_the_year_and_the_list_filters_apply(self):
        self.assertEqual(self.client.get(FISHERFOLK, {'year': 2025}).json()['compared'], 0)
        self.assertEqual(self.client.get(FISHERFOLK, {'year': 2026, 'search': 'Up'}).json()['total'], 1)

    def test_a_fisherfolk_account_cannot_read_it(self):
        citizen = User.objects.create_user(username='hf-citizen', password='pw', role='CITIZEN', email='hf-citizen@x.test')
        self.client.force_authenticate(citizen)
        self.assertEqual(self.client.get(FISHERFOLK).status_code, 403)
