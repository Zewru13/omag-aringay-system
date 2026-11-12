"""GET /api/fisheries/disaster-reports/targets/: the ponds and cages a disaster can hit, for staff's Log Disaster table - every ACTIVE stock
(Stocked, Near Harvest) of every fisherfolk with the ponds/cages of its cycle that are not harvested yet, in one response. Searching and
filtering by fisherfolk or barangay are done on the screen, over this list (the same idea as the crop Log Disaster table).

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APITestCase

from fisheries.models import FisheriesHarvestRecord, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import AquacultureProductionCycle, AquacultureProductionUnit

URL = '/api/fisheries/disaster-reports/targets/'
_RSBSA = itertools.count(987000)


class FisheriesDisasterTargetsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm_dt', password='pw', role='ADMIN', email='adm_dt@x.test')
        cls.focal = User.objects.create_user(username='foc_dt', password='pw', role='EVALUATOR', email='foc_dt@x.test')
        cls.citizen = User.objects.create_user(username='cit_dt', password='pw', role='CITIZEN', email='cit_dt@x.test')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.tilapia = SpeciesOption.objects.create(
            species_name='DT Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'))

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def fisherfolk(self, first, last='Target', barangay='Poblacion'):
        return Fisherfolk.objects.create(
            first_name=first, last_name=last, gender='Male', birthdate=timezone.localdate().replace(year=1990), barangay=barangay,
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))

    def stock(self, ff, unit_counts=(300, 200), status='Stocked', cycle_name='Grow-out'):
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=ff, cycle_name=cycle_name, species_farmed='DT Tilapia', culture_system='Fishpond',
            stocking_date=timezone.localdate() - timedelta(days=20))
        units = []
        for n, c in enumerate(unit_counts, start=1):
            units.append(AquacultureProductionUnit.objects.create(
                production_cycle=cycle, unit_type='pond', unit_number=n, length_m=Decimal('4'), width_m=Decimal('2'), size_sqm=Decimal('8'),
                fingerling_count=c))
        rec = StockingRecord.objects.create(
            fisherfolk=ff, production_cycle=cycle, species=self.tilapia, culture_type='Pond', date_stocked=timezone.localdate() - timedelta(days=20),
            number_of_fingerlings=sum(unit_counts) or 500, season='Dry', year=timezone.localdate().year, pond_location_barangay='Dulao')
        StockingRecord.objects.filter(pk=rec.pk).update(status=status)
        rec.refresh_from_db()
        return rec, units

    def listed(self):
        response = self.client.get(URL)
        self.assertEqual(response.status_code, 200, response.content)
        return response.data['stocks']

    def test_lists_an_active_stock_with_its_ponds_and_cages(self):
        ann = self.fisherfolk('Ann', barangay='Samara')
        rec, units = self.stock(ann, (300, 200))
        (item,) = self.listed()
        self.assertEqual(item['stock_id'], rec.id)
        self.assertEqual((item['fisherfolk_id'], item['fisherfolk_name'], item['rsbsa_number'], item['barangay']),
                         (ann.id, ann.full_name, ann.rsbsa_number, 'Samara'))
        self.assertEqual((item['species_name'], item['cycle_name'], item['pond_location']), ('DT Tilapia', 'Grow-out', 'Dulao'))
        self.assertEqual(item['date_stocked'], str(rec.date_stocked))
        self.assertEqual(item['cycle_no'], 1)
        self.assertEqual([(u['id'], u['label'], u['fingerlings']) for u in item['units']],
                         [(units[0].id, 'Pond 1', 300), (units[1].id, 'Pond 2', 200)])

    def test_near_harvest_is_listed_but_harvested_and_total_loss_are_not(self):
        ann = self.fisherfolk('Ann')
        near, _ = self.stock(ann, status='Near Harvest', cycle_name='Near')
        self.stock(ann, status='Harvested', cycle_name='Done')
        self.stock(ann, status='Total Loss', cycle_name='Lost')
        self.assertEqual([s['stock_id'] for s in self.listed()], [near.id])

    def test_a_harvested_pond_is_left_out_and_a_stock_with_nothing_left_is_not_listed(self):
        ann, ben = self.fisherfolk('Ann'), self.fisherfolk('Ben')
        rec, units = self.stock(ann, (300, 200))
        harvest = FisheriesHarvestRecord.objects.create(stocking_record=rec, harvest_date=timezone.localdate(), quantity_kg=Decimal('5'))
        harvest.production_units.add(units[0])
        spent, spent_units = self.stock(ben, (100,), cycle_name='Spent')
        gone = FisheriesHarvestRecord.objects.create(stocking_record=spent, harvest_date=timezone.localdate(), quantity_kg=Decimal('5'))
        gone.production_units.add(spent_units[0])
        items = self.listed()
        self.assertEqual([s['stock_id'] for s in items], [rec.id])
        self.assertEqual([u['label'] for u in items[0]['units']], ['Pond 2'])

    def test_a_stock_without_ponds_is_one_whole_stock_row(self):
        ann = self.fisherfolk('Ann')
        rec = StockingRecord.objects.create(
            fisherfolk=ann, species=self.tilapia, culture_type='Pond', date_stocked=timezone.localdate() - timedelta(days=5),
            number_of_fingerlings=800, season='Dry', year=timezone.localdate().year)
        StockingRecord.objects.filter(pk=rec.pk).update(status='Stocked')
        (item,) = self.listed()
        self.assertEqual(item['stock_id'], rec.id)
        self.assertEqual(item['units'], [{'id': None, 'label': 'Whole stock', 'fingerlings': 800}])

    def test_many_fisherfolk_come_in_name_order(self):
        zed = self.fisherfolk('Zed', last='Alpha')
        amy = self.fisherfolk('Amy', last='Zulu')
        a, _ = self.stock(zed)
        b, _ = self.stock(amy)
        self.assertEqual([s['stock_id'] for s in self.listed()], [a.id, b.id])

    def test_the_number_of_queries_does_not_grow_with_the_stocks(self):
        for n in range(2):
            self.stock(self.fisherfolk(f'A{n}'))
        with CaptureQueriesContext(connection) as few:
            self.client.get(URL)
        for n in range(6):
            self.stock(self.fisherfolk(f'B{n}'))
        with CaptureQueriesContext(connection) as many:
            self.client.get(URL)
        self.assertEqual(len(many), len(few), 'the list does one batch of queries, not one per stock')

    def test_staff_only(self):
        self.stock(self.fisherfolk('Ann'))
        self.client.force_authenticate(self.focal)
        self.assertEqual(self.client.get(URL).status_code, 200)
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL).status_code, 403)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(URL).status_code, (401, 403))
