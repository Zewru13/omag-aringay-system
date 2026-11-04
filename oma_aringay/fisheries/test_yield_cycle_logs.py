"""Fisheries Yield Analysis reflects the cycle's actual Feeding Logs and Health Logs (what was saved, nothing invented), per fisherfolk,
production cycle and pond/cage.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from fisheries.models import FisheriesHarvestRecord, Fisherfolk, SpeciesCategory, SpeciesOption, StockingRecord
from monitoring.models import (
    AquacultureFeedingLog, AquacultureFeedingLogUnit, AquacultureHealthLog, AquacultureProductionCycle, AquacultureProductionUnit,
)

LIST = '/api/fisheries/yield-analysis/'
_RSBSA = itertools.count(960001)


class YieldCycleLogsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='yc-admin', password='pw', role='ADMIN', email='yc@x.test')
        make = lambda n: Fisherfolk.objects.create(
            first_name=n, last_name='Logs', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))
        cls.ann, cls.ben = make('Ann'), make('Ben')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species = SpeciesOption.objects.create(
            species_name='YC Tilapia', category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=Decimal('80'), default_avg_body_weight_kg=Decimal('0.25'))
        cls.cycle, cls.record, cls.units = cls._cycle(cls.ann, units=2)
        cls.other_cycle, cls.other_record, _ = cls._cycle(cls.ben, units=1)

        cls.feed = AquacultureFeedingLog.objects.create(
            production_cycle=cls.cycle, feeding_date=date(2026, 1, 10), feed_type='Grower Feed', quantity_kg=Decimal('30.00'), notes='morning')
        AquacultureFeedingLogUnit.objects.create(feeding_log=cls.feed, production_unit=cls.units[0], quantity_kg=Decimal('10.00'))
        AquacultureFeedingLogUnit.objects.create(feeding_log=cls.feed, production_unit=cls.units[1], quantity_kg=Decimal('20.00'))
        cls.feed2 = AquacultureFeedingLog.objects.create(
            production_cycle=cls.cycle, feeding_date=date(2026, 1, 20), feed_type='Finisher Feed', quantity_kg=Decimal('5.00'))
        AquacultureFeedingLogUnit.objects.create(feeding_log=cls.feed2, production_unit=cls.units[0], quantity_kg=Decimal('5.00'))
        AquacultureHealthLog.objects.create(
            production_cycle=cls.cycle, production_unit=cls.units[1], log_date=date(2026, 2, 1), observation='Fish Mortality',
            mortality_count=7, force_harvest=True)
        AquacultureHealthLog.objects.create(
            production_cycle=cls.cycle, production_unit=cls.units[0], log_date=date(2026, 2, 3), observation='Poor Water Quality',
            treatment_applied='Water Exchange', notes='after rain')
        # the other fisherfolk's cycle has its own, different logs
        AquacultureHealthLog.objects.create(
            production_cycle=cls.other_cycle, log_date=date(2026, 2, 5), observation='Fin Rot', force_harvest=True)

    @classmethod
    def _cycle(cls, ff, units):
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=ff, cycle_name='Grow-out', species_farmed='Tilapia', culture_system='Fishpond', stocking_date=date(2026, 1, 1))
        made = [AquacultureProductionUnit.objects.create(
            production_cycle=cycle, unit_type='pond', unit_number=n, size_sqm=Decimal('100'), fingerling_count=50) for n in range(1, units + 1)]
        rec = StockingRecord.objects.create(
            fisherfolk=ff, production_cycle=cycle, species=cls.species, culture_type='Pond', date_stocked=date(2026, 1, 1),
            number_of_fingerlings=100, season='Dry', year=2026, status='Harvested', pond_location_barangay='Poblacion')
        FisheriesHarvestRecord.objects.create(stocking_record=rec, quantity_kg=Decimal('9.00'), harvest_date=date(2026, 5, 1))
        return cycle, rec, made

    def rows(self, user=None):
        self.client.force_authenticate(user or self.admin)
        r = self.client.get(LIST)
        self.assertEqual(r.status_code, 200)
        return {row['id']: row for row in r.json()['records']}

    def test_record_carries_the_cycles_real_feeding_logs(self):
        feeding = self.rows()[self.record.id]['cycle_activity']['feeding']
        self.assertEqual((feeding['count'], feeding['total_kg']), (2, 35.0))
        self.assertEqual([l['feed_type'] for l in feeding['logs']], ['Finisher Feed', 'Grower Feed'])   # newest first
        grower = feeding['logs'][1]
        self.assertEqual((grower['date'], grower['quantity_kg'], grower['notes']), ('2026-01-10', 30.0, 'morning'))
        self.assertEqual([(u['unit_label'], u['quantity_kg']) for u in grower['units']], [('Pond 1', 10.0), ('Pond 2', 20.0)])

    def test_record_carries_the_cycles_real_health_logs(self):
        health = self.rows()[self.record.id]['cycle_activity']['health']
        self.assertEqual((health['count'], health['mortality_total']), (2, 7))
        by_obs = {l['observation']: l for l in health['logs']}
        mort = by_obs['Fish Mortality']
        self.assertEqual((mort['date'], mort['unit_label'], mort['mortality_count'], mort['force_harvest']), ('2026-02-01', 'Pond 2', 7, True))
        water = by_obs['Poor Water Quality']
        self.assertEqual((water['unit_label'], water['treatment_applied'], water['notes']), ('Pond 1', 'Water Exchange', 'after rain'))

    def test_each_pond_cage_has_its_own_summary(self):
        units = {u['unit_label']: u for u in self.rows()[self.record.id]['cycle_activity']['units']}
        self.assertEqual((units['Pond 1']['feeding_kg'], units['Pond 1']['health_logs'], units['Pond 1']['mortality']), (15.0, 1, 0))
        self.assertEqual((units['Pond 2']['feeding_kg'], units['Pond 2']['health_logs'], units['Pond 2']['mortality']), (20.0, 1, 7))
        self.assertEqual(units['Pond 2']['force_harvest'], True)
        self.assertEqual(units['Pond 1']['force_harvest'], False)

    def test_logs_belong_to_their_own_cycle_only(self):
        rows = self.rows()
        other = rows[self.other_record.id]['cycle_activity']
        self.assertEqual((other['feeding']['count'], other['health']['count']), (0, 1))
        self.assertEqual(other['health']['logs'][0]['observation'], 'Fin Rot')
        self.assertNotIn('Fin Rot', [l['observation'] for l in rows[self.record.id]['cycle_activity']['health']['logs']])

    def test_possible_factors_come_from_saved_logs_and_claim_no_cause(self):
        factors = self.rows()[self.record.id]['cycle_activity']['factors']
        text = ' | '.join(factors)
        self.assertIn('Fish Mortality', text)
        self.assertIn('Pond 2', text)
        self.assertIn('2026-02-01', text)
        self.assertIn('Poor Water Quality', text)
        self.assertTrue(any('2 Feeding Log' in f for f in factors))
        for word in ('caused', 'because', 'due to', 'resulted'):
            self.assertNotIn(word, text.lower())

    def test_a_cycle_without_logs_invents_nothing(self):
        bare_cycle, bare_rec, _ = self._cycle(self.ben, units=1)
        activity = self.rows()[bare_rec.id]['cycle_activity']
        self.assertEqual((activity['feeding']['count'], activity['health']['count']), (0, 0))
        self.assertEqual(activity['factors'], [])

    def test_a_record_without_a_cycle_has_empty_activity(self):
        rec = StockingRecord.objects.create(
            fisherfolk=self.ann, species=self.species, culture_type='Pond', date_stocked=date(2026, 1, 1),
            number_of_fingerlings=100, season='Dry', year=2026, status='Harvested')
        activity = self.rows()[rec.id]['cycle_activity']
        self.assertEqual((activity['feeding']['count'], activity['health']['count'], activity['units'], activity['factors']), (0, 0, [], []))

    def test_a_fisherfolk_sees_only_their_own_cycles_logs(self):
        User = get_user_model()
        user = User.objects.create_user(username='yc-ann', password='pw', role='CITIZEN', email='yca@x.test')
        UserLinkedRecord.objects.create(user=user, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ann.id, is_active=True)
        rows = self.rows(user)
        self.assertEqual(set(rows), {self.record.id})
        self.assertEqual(rows[self.record.id]['cycle_activity']['feeding']['count'], 2)

    def test_the_summary_endpoint_is_unchanged(self):
        self.client.force_authenticate(self.admin)
        r = self.client.get('/api/fisheries/yield-analysis/summary/')
        self.assertEqual(r.status_code, 200)
        self.assertNotIn('cycle_activity', r.json()['overall'])
