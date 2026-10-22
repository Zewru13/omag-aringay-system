"""Emergency Force Harvest (Aquaculture Monitoring ⋮ menu > Force Harvest) - separate from the Health Log Force Harvest.

Covers the six fixed reasons, the Asia/Manila date rule, several cycles and ponds/cages of one fisherfolk in one atomic
request, per-unit estimates and actual kg, a unit never harvested twice, rollback, ownership, the saved details and the
Admin-only notification - and that the Health Log Force Harvest (is_force_harvest, HP/HC data, its own notification)
keeps working exactly as before.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date, timedelta
from decimal import Decimal
from unittest import mock

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from core.models import Notification
from fisheries import notifications as fn
from fisheries.emergency_force_harvest import record_force_harvests
from fisheries.models import (
    EMERGENCY_FORCE_HARVEST_REASONS, FisheriesHarvestRecord, FisheriesHarvestUnit, Fisherfolk, SpeciesCategory,
    SpeciesOption, StockingRecord, calculate_estimated_harvest_kg,
)
from monitoring.models import AquacultureHealthLog, AquacultureProductionCycle, AquacultureProductionUnit

_RSBSA = itertools.count(910001)

CYCLES = '/api/monitoring/aquaculture-cycles/'
STOCKING = '/api/fisheries/stocking/'
ELIGIBLE = '/api/fisheries/force-harvest/eligible/'
FORCE = '/api/fisheries/force-harvest/'


def rsbsa():
    return '01-033-02-019-%06d' % next(_RSBSA)


class EmergencyForceHarvestTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='admin1', password='pw', role='ADMIN', email='a1@x.test', full_name='Ana Admin')
        cls.admin2 = User.objects.create_user(username='admin2', password='pw', role='ADMIN', email='a2@x.test', full_name='Ben Admin')
        cls.evaluator = User.objects.create_user(username='eval1', password='pw', role='EVALUATOR', email='e1@x.test', full_name='Eva Evaluator')
        cls.inactive_admin = User.objects.create_user(username='admin3', password='pw', role='ADMIN', email='a3@x.test', is_active=False)
        make = lambda first, last: Fisherfolk.objects.create(
            first_name=first, middle_name='', last_name=last, gender='Female', birthdate=date(1985, 5, 5),
            barangay='Samara', fisherfolk_type='Aquaculture', rsbsa_number=rsbsa())
        cls.ff_a, cls.ff_b = make('Felicitas', 'Manabat'), make('Pablo', 'Dulay')

        def citizen(ff, name):
            u = User.objects.create_user(username=name, password='pw', role='CITIZEN', email=f'{name}@x.test', full_name=ff.full_name)
            UserLinkedRecord.objects.create(user=u, record_type=User.LinkedRecordType.FISHERFOLK, record_id=ff.id, is_active=True)
            return u
        cls.user_a, cls.user_b = citizen(cls.ff_a, 'ffa'), citizen(cls.ff_b, 'ffb')
        cat, _ = SpeciesCategory.objects.get_or_create(name='Fish')
        cls.species, _ = SpeciesOption.objects.get_or_create(species_name='Bangus', defaults=dict(
            category=cat, culture_environment='Freshwater', culture_duration_days=120,
            default_survival_rate_pct=80, default_avg_body_weight_kg=0.25))

    # ── helpers ──
    def as_(self, user):
        self.client.force_authenticate(user)

    def start_cycle(self, ff=None, ponds=3, **over):
        """A production cycle for `ff` (default ff_a) stocked yesterday with `ponds` ponds; returns (cycle, stocking record, units)."""
        self.as_(self.admin)
        data = {
            'fisherfolk': (ff or self.ff_a).id, 'cycle_name': 'Grow-out Phase', 'species_farmed': 'Bangus',
            'species_option': self.species.id, 'culture_system': 'Fishpond', 'pond_location_barangay': 'Samara',
            'water_source': 'River', 'stocking_date': str(date.today() - timedelta(days=1)),
            'units': [{'length_m': 10, 'width_m': 5, 'fingerling_count': 100 * (i + 1)} for i in range(ponds)],
        }
        data.update(over)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(CYCLES, data, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        cycle = AquacultureProductionCycle.objects.get(pk=r.data['id'])
        stock = StockingRecord.objects.get(production_cycle=cycle)
        units = list(AquacultureProductionUnit.objects.filter(production_cycle=cycle).order_by('unit_number'))
        return cycle, stock, units

    def force(self, cycles, reason='upcoming_typhoon', harvest_date=None, user=None, commit=True):
        """cycles: [(stock, [(unit, kg), ...]), ...]"""
        self.as_(user or self.admin)
        body = {
            'reason': reason, 'harvest_date': str(harvest_date or date.today()),
            'cycles': [{'stocking_record': s.id, 'units': [{'production_unit': u.id, 'quantity_kg': kg} for u, kg in rows]} for s, rows in cycles],
        }
        with self.captureOnCommitCallbacks(execute=commit):
            return self.client.post(FORCE, body, format='json')

    def affect(self, cycle, unit):
        AquacultureHealthLog.objects.create(production_cycle=cycle, production_unit=unit, log_date=date.today(),
                                            observation='Fish Mortality', mortality_count=4)

    def eligible(self, stock, user=None):
        self.as_(user or self.admin)
        return self.client.get(ELIGIBLE, {'stocking_record': stock.id})

    def expected_estimate(self, stock, unit):
        return Decimal(str(calculate_estimated_harvest_kg(unit.fingerling_count, stock.survival_rate_pct, stock.avg_body_weight_kg)))

    def emergency_notes(self, **f):
        return Notification.objects.filter(record_type=fn.EMERGENCY_FORCE_HARVEST, **f)

    # ── the six reasons ──
    def test_exactly_six_reasons_and_no_other(self):
        _, stock, _ = self.start_cycle()
        r = self.eligible(stock)
        self.assertEqual(r.status_code, 200, r.data)
        self.assertEqual([x['label'] for x in r.data['reasons']], [
            'Upcoming Typhoon', 'Super Typhoon', 'El Niño', 'Drought', 'Possible Flooding', 'Fish Pest or Virus Spreading'])
        self.assertEqual(len(EMERGENCY_FORCE_HARVEST_REASONS), 6)
        self.assertFalse(any('other' in x['label'].lower() or x['value'] == 'other' for x in r.data['reasons']))

    def test_reason_is_required_and_must_be_one_of_the_six(self):
        _, stock, units = self.start_cycle()
        for bad in ('', 'other', 'Typhoon', None):
            r = self.force([(stock, [(units[0], '5')])], reason=bad)
            self.assertEqual(r.status_code, 400, bad)
            self.assertIn('reason', r.data)
        self.assertFalse(FisheriesHarvestRecord.objects.exists())

    def test_no_description_or_photo_field_is_accepted(self):
        _, stock, units = self.start_cycle()
        self.as_(self.admin)
        body = {'reason': 'drought', 'harvest_date': str(date.today()), 'description': 'typhoon coming', 'notes': 'x',
                'cycles': [{'stocking_record': stock.id, 'units': [{'production_unit': units[0].id, 'quantity_kg': '5'}]}]}
        r = self.client.post(FORCE, body, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        h = FisheriesHarvestRecord.objects.get()
        self.assertEqual(h.notes, '')                      # the extra text was never stored
        self.assertNotIn('description', r.data['harvests'][0])
        self.assertNotIn('photo', r.data['harvests'][0])

    # ── eligibility and estimates ──
    def test_eligible_lists_cycles_and_units_with_species_number_and_estimates(self):
        _, stock, units = self.start_cycle(ponds=2)
        r = self.eligible(stock)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.data['fisherfolk']['name'], self.ff_a.full_name)
        (cycle,) = r.data['cycles']
        self.assertEqual((cycle['stocking_record'], cycle['species'], cycle['cycle_number'], cycle['cycle_name']),
                         (stock.id, 'Bangus', 1, 'Grow-out Phase'))
        self.assertEqual([u['label'] for u in cycle['units']], ['Pond 1', 'Pond 2'])
        # each unit's OWN estimate: its own fingerlings x the record's survival rate x average weight (never an even split)
        got = [Decimal(u['estimated_harvest_kg']) for u in cycle['units']]
        self.assertEqual(got, [self.expected_estimate(stock, u) for u in units])
        self.assertNotEqual(got[0], got[1])                                  # 100 vs 200 fingerlings

    def test_estimate_is_null_when_unavailable(self):
        _, stock, _ = self.start_cycle(ponds=1)
        StockingRecord.objects.filter(pk=stock.pk).update(survival_rate_pct=None)
        r = self.eligible(stock)
        self.assertIsNone(r.data['cycles'][0]['units'][0]['estimated_harvest_kg'])

    def test_harvested_units_and_health_log_pending_units_are_not_offered(self):
        cycle, stock, units = self.start_cycle(ponds=3)
        self.affect(cycle, units[2])                                         # Pond 3 awaits the Health Log Force Harvest
        r = self.force([(stock, [(units[0], '9')])])                         # Pond 1 force harvested now
        self.assertEqual(r.status_code, 201, r.data)
        offered = [u['label'] for u in self.eligible(stock).data['cycles'][0]['units']]
        self.assertEqual(offered, ['Pond 2'])

    def test_cycle_without_eligible_units_or_with_estimated_stocking_date_is_not_offered(self):
        _, stock, units = self.start_cycle(ponds=1)
        _, other, _ = self.start_cycle(ponds=1)
        StockingRecord.objects.filter(pk=other.pk).update(date_stocked_is_estimated=True)
        self.assertEqual([c['stocking_record'] for c in self.eligible(stock).data['cycles']], [stock.id])
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        self.assertEqual(self.eligible(stock).data['cycles'], [])            # nothing left to offer

    def test_total_loss_and_harvested_cycles_are_not_offered(self):
        _, stock, _ = self.start_cycle(ponds=1)
        StockingRecord.objects.filter(pk=stock.pk).update(status='Total Loss')
        self.assertEqual(self.eligible(stock).data['cycles'], [])

    def test_a_fisherfolk_account_only_sees_its_own_cycles(self):
        _, mine, _ = self.start_cycle(ff=self.ff_a)
        _, theirs, _ = self.start_cycle(ff=self.ff_b)
        r = self.eligible(mine, user=self.user_a)
        self.assertEqual([c['stocking_record'] for c in r.data['cycles']], [mine.id])
        self.assertEqual(self.eligible(theirs, user=self.user_a).status_code, 404)

    def test_other_roles_cannot_use_it(self):
        _, stock, units = self.start_cycle(ponds=1)
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(ELIGIBLE, {'stocking_record': stock.id}).status_code, (401, 403))
        farmer = get_user_model().objects.create_user(username='f1', password='pw', role='CITIZEN', email='f1@x.test')
        self.as_(farmer)
        self.assertEqual(self.client.get(ELIGIBLE, {'stocking_record': stock.id}).status_code, 403)

    # ── the harvest date (Asia/Manila) ──
    def test_today_comes_from_the_application_timezone_not_utc(self):
        _, stock, units = self.start_cycle(ponds=1)
        manila_today = date.today() + timedelta(days=5)                       # a "Manila today" that differs from any UTC date
        with mock.patch('fisheries.emergency_force_harvest.timezone.localdate', return_value=manila_today):
            self.assertEqual(self.eligible(stock).data['today'], str(manila_today))
            # that local date is accepted, the next day is not
            self.assertEqual(self.force([(stock, [(units[0], '5')])], harvest_date=manila_today).status_code, 201)

    def test_future_date_is_rejected(self):
        _, stock, units = self.start_cycle(ponds=1)
        r = self.force([(stock, [(units[0], '5')])], harvest_date=date.today() + timedelta(days=1))
        self.assertEqual(r.status_code, 400)
        self.assertIn('harvest_date', r.data)
        self.assertFalse(FisheriesHarvestRecord.objects.exists())

    def test_date_before_stocking_is_rejected_and_past_dates_are_allowed(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5')])], harvest_date=stock.date_stocked - timedelta(days=1)).status_code, 400)
        self.assertEqual(self.force([(stock, [(units[0], '5')])], harvest_date=stock.date_stocked).status_code, 201)

    # ── recording ──
    def test_records_several_cycles_and_units_in_one_request(self):
        _, s1, u1 = self.start_cycle(ponds=3)
        _, s2, u2 = self.start_cycle(ponds=2)
        r = self.force([(s1, [(u1[0], '12.50'), (u1[1], '7.25')]), (s2, [(u2[0], '3')])], reason='el_nino')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(len(r.data['harvests']), 2)
        h1 = FisheriesHarvestRecord.objects.get(stocking_record=s1)
        h2 = FisheriesHarvestRecord.objects.get(stocking_record=s2)
        for h in (h1, h2):
            self.assertEqual((h.force_harvest_reason, h.harvest_date, h.is_force_harvest, h.recorded_by_id),
                             ('el_nino', date.today(), False, self.admin.id))
        # the cycle total is its units' sum; each unit keeps its own kg against the right cycle, nothing duplicated
        self.assertEqual((h1.quantity_kg, h2.quantity_kg), (Decimal('19.75'), Decimal('3.00')))
        self.assertEqual({(x.production_unit_id, x.quantity_kg) for x in h1.unit_harvests.all()},
                         {(u1[0].id, Decimal('12.50')), (u1[1].id, Decimal('7.25'))})
        self.assertEqual([x.production_unit_id for x in h2.unit_harvests.all()], [u2[0].id])
        self.assertEqual(set(h1.production_units.values_list('id', flat=True)), {u1[0].id, u1[1].id})
        self.assertEqual(FisheriesHarvestUnit.objects.count(), 3)

    def test_unselected_units_stay_in_stock_and_the_cycle_stays_open(self):
        _, stock, units = self.start_cycle(ponds=3)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        stock.refresh_from_db()
        self.assertIn(stock.status, ('Stocked', 'Near Harvest'))
        self.assertFalse(FisheriesHarvestRecord.objects.get().is_final)
        rows = {u['label']: u['harvested'] for u in stock.harvest_units()}
        self.assertEqual(rows, {'Pond 1': True, 'Pond 2': False, 'Pond 3': False})
        self.assertEqual([u['label'] for u in self.eligible(stock).data['cycles'][0]['units']], ['Pond 2', 'Pond 3'])

    def test_harvesting_every_unit_closes_the_cycle(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5'), (units[1], '6')])]).status_code, 201)
        stock.refresh_from_db()
        self.assertEqual(stock.status, 'Harvested')
        self.assertTrue(FisheriesHarvestRecord.objects.get().is_final)

    def test_a_later_harvest_of_the_remaining_units_closes_the_cycle(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        self.assertEqual(self.force([(stock, [(units[1], '6')])], reason='drought').status_code, 201)
        stock.refresh_from_db()
        self.assertEqual(stock.status, 'Harvested')
        self.assertEqual(stock.harvests.count(), 2)

    def test_actual_kg_must_be_positive_for_every_selected_unit(self):
        _, stock, units = self.start_cycle(ponds=2)
        for kg in ('0', '-3', '0.00', None, ''):
            r = self.force([(stock, [(units[0], '5'), (units[1], kg)])])
            self.assertEqual(r.status_code, 400, kg)
        self.assertFalse(FisheriesHarvestRecord.objects.exists())
        self.assertFalse(FisheriesHarvestUnit.objects.exists())

    def test_empty_selection_is_rejected(self):
        self.as_(self.admin)
        for body in ({'reason': 'drought', 'harvest_date': str(date.today()), 'cycles': []},
                     {'reason': 'drought', 'harvest_date': str(date.today())}):
            self.assertEqual(self.client.post(FORCE, body, format='json').status_code, 400)

    def test_no_double_harvest_and_repeat_submit_is_refused(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        again = self.force([(stock, [(units[0], '5')])])
        self.assertEqual(again.status_code, 400)
        self.assertIn('already been harvested', str(again.data))
        self.assertEqual(FisheriesHarvestRecord.objects.count(), 1)
        self.assertEqual(FisheriesHarvestUnit.objects.count(), 1)

    def test_a_unit_listed_twice_or_from_another_cycle_is_refused(self):
        _, s1, u1 = self.start_cycle(ponds=2)
        _, s2, u2 = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(s1, [(u1[0], '5'), (u1[0], '6')])]).status_code, 400)
        self.assertEqual(self.force([(s1, [(u2[0], '5')])]).status_code, 400)       # a unit of ANOTHER cycle
        self.assertEqual(self.force([(s1, [(u1[0], '5')]), (s1, [(u1[1], '5')])]).status_code, 400)  # a cycle listed twice
        self.assertFalse(FisheriesHarvestRecord.objects.exists())

    def test_a_unit_awaiting_the_health_log_force_harvest_is_refused(self):
        cycle, stock, units = self.start_cycle(ponds=2)
        self.affect(cycle, units[0])
        r = self.force([(stock, [(units[0], '5')])])
        self.assertEqual(r.status_code, 400)
        self.assertIn('Health Log', str(r.data))

    def test_all_selected_cycles_must_belong_to_the_same_fisherfolk(self):
        _, s1, u1 = self.start_cycle(ff=self.ff_a, ponds=1)
        _, s2, u2 = self.start_cycle(ff=self.ff_b, ponds=1)
        r = self.force([(s1, [(u1[0], '5')]), (s2, [(u2[0], '5')])])
        self.assertEqual(r.status_code, 400)
        self.assertIn('same fisherfolk', str(r.data))
        self.assertFalse(FisheriesHarvestRecord.objects.exists())

    def test_a_fisherfolk_account_can_record_only_for_its_own_cycles(self):
        _, mine, mu = self.start_cycle(ff=self.ff_a, ponds=1)
        _, theirs, tu = self.start_cycle(ff=self.ff_b, ponds=1)
        self.assertEqual(self.force([(theirs, [(tu[0], '5')])], user=self.user_a).status_code, 404)
        self.assertEqual(self.force([(mine, [(mu[0], '5')])], user=self.user_a).status_code, 201)
        self.assertEqual(FisheriesHarvestRecord.objects.get().recorded_by_id, self.user_a.id)

    # ── atomic ──
    def test_one_bad_cycle_rolls_the_whole_request_back(self):
        _, s1, u1 = self.start_cycle(ponds=2)
        _, s2, u2 = self.start_cycle(ponds=2)
        # the second cycle names a unit of the first cycle: the request fails after the first cycle was already built
        r = self.force([(s1, [(u1[0], '5')]), (s2, [(u1[1], '5')])])
        self.assertEqual(r.status_code, 400)
        self.assertFalse(FisheriesHarvestRecord.objects.exists())
        self.assertFalse(FisheriesHarvestUnit.objects.exists())
        self.assertFalse(self.emergency_notes().exists())
        s1.refresh_from_db()
        self.assertIn(s1.status, ('Stocked', 'Near Harvest'))

    def test_a_failure_while_saving_rolls_everything_back(self):
        _, s1, u1 = self.start_cycle(ponds=1)
        _, s2, u2 = self.start_cycle(ponds=1)
        real = FisheriesHarvestUnit.objects.bulk_create
        calls = []

        def boom(rows, *a, **k):
            calls.append(1)
            if len(calls) == 2:           # the SECOND cycle's per-unit rows fail after the first was written
                raise RuntimeError('database went away')
            return real(rows, *a, **k)
        data = {'reason': 'drought', 'harvest_date': date.today(), 'cycles': [
            {'stocking_record': s1, 'units': [{'production_unit': u1[0], 'quantity_kg': Decimal('5')}]},
            {'stocking_record': s2, 'units': [{'production_unit': u2[0], 'quantity_kg': Decimal('5')}]}]}
        with mock.patch.object(FisheriesHarvestUnit.objects, 'bulk_create', side_effect=boom):
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(RuntimeError):
                    record_force_harvests(self.admin, data)
        self.assertFalse(FisheriesHarvestRecord.objects.exists())
        self.assertFalse(FisheriesHarvestUnit.objects.exists())
        self.assertFalse(self.emergency_notes().exists())
        for s_ in (s1, s2):
            s_.refresh_from_db()
            self.assertIn(s_.status, ('Stocked', 'Near Harvest'))

    # ── notifications ──
    def test_admins_are_notified_once_per_cycle_after_commit_and_nobody_else(self):
        _, s1, u1 = self.start_cycle(ponds=3)
        _, s2, u2 = self.start_cycle(ponds=1)
        r = self.force([(s1, [(u1[0], '12.5'), (u1[1], '7.5')]), (s2, [(u2[0], '3')])], reason='possible_flooding')
        self.assertEqual(r.status_code, 201, r.data)
        mine = self.emergency_notes()
        # the acting Admin is not told about their own action; inactive admins, the evaluator and the owner are never notified
        self.assertEqual(set(mine.values_list('recipient_id', flat=True)), {self.admin2.id})
        self.assertEqual(mine.count(), 2)                                     # one per harvested cycle
        h1 = FisheriesHarvestRecord.objects.get(stocking_record=s1)
        n1 = mine.get(record_id=h1.id)
        self.assertIn('Bangus', n1.record_label)
        self.assertIn('Felicitas Manabat', n1.record_label)
        self.assertIn('Pond 1, Pond 2', n1.detail)
        self.assertIn('20.00 kg', n1.detail)
        self.assertIn('Possible Flooding', n1.detail)
        self.assertIn(date.today().strftime('%b %d, %Y'), n1.detail)
        self.assertFalse(self.emergency_notes(recipient__in=[self.evaluator, self.user_a, self.inactive_admin]).exists())

    def test_a_second_admin_gets_it_when_a_fisherfolk_records(self):
        _, stock, units = self.start_cycle(ponds=1)
        self.assertEqual(self.force([(stock, [(units[0], '5')])], user=self.user_a).status_code, 201)
        self.assertEqual(set(self.emergency_notes().values_list('recipient_id', flat=True)), {self.admin.id, self.admin2.id})
        self.assertFalse(self.emergency_notes(recipient=self.user_a).exists())

    def test_no_notification_before_commit_or_for_a_refused_request(self):
        _, stock, units = self.start_cycle(ponds=1)
        self.assertEqual(self.force([(stock, [(units[0], '5')])], commit=False).status_code, 201)
        self.assertFalse(self.emergency_notes().exists())                    # nothing until the transaction commits
        bad = self.force([(stock, [(units[0], '5')])])                       # already harvested: refused
        self.assertEqual(bad.status_code, 400)
        self.assertFalse(self.emergency_notes().exists())

    def test_the_same_harvest_is_never_notified_twice(self):
        _, stock, units = self.start_cycle(ponds=1)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        h = FisheriesHarvestRecord.objects.get()
        with self.captureOnCommitCallbacks(execute=True):
            fn.queue_emergency_force_harvest(h, self.admin)                  # e.g. a retried task
        self.assertEqual(self.emergency_notes().count(), 1)

    # ── the saved details ──
    def test_detail_comes_from_the_saved_record(self):
        _, stock, units = self.start_cycle(ponds=3)
        r = self.force([(stock, [(units[0], '12.5'), (units[2], '7')])], reason='super_typhoon')
        hid = r.data['harvests'][0]['id']
        self.as_(self.admin)
        d = self.client.get(f'{FORCE}{hid}/').data
        self.assertEqual((d['species'], d['cycle_number'], d['reason'], d['reason_label'], d['harvest_date'], d['total_actual_kg']),
                         ('Bangus', 1, 'super_typhoon', 'Super Typhoon', str(date.today()), '19.50'))
        self.assertEqual([(u['label'], Decimal(u['estimated_harvest_kg']), u['actual_harvest_kg']) for u in d['units']],
                         [('Pond 1', self.expected_estimate(stock, units[0]), '12.50'),
                          ('Pond 3', self.expected_estimate(stock, units[2]), '7.00')])
        self.assertEqual(d['fisherfolk_name'], self.ff_a.full_name)

    def test_detail_is_only_for_emergency_force_harvests_and_own_records(self):
        _, stock, units = self.start_cycle(ponds=2)
        hid = self.force([(stock, [(units[0], '5')])]).data['harvests'][0]['id']
        self.assertEqual(self.client.get(f'{FORCE}{hid}/').status_code, 200)
        self.as_(self.user_b)
        self.assertEqual(self.client.get(f'{FORCE}{hid}/').status_code, 404)  # another fisherfolk's
        self.as_(self.user_a)
        self.assertEqual(self.client.get(f'{FORCE}{hid}/').status_code, 200)
        # a normal harvest is not an emergency Force Harvest
        self.as_(self.admin)
        normal = self.client.post(f'{STOCKING}{stock.id}/harvests/', {
            'harvest_date': str(date.today()), 'production_units': [units[1].id], 'quantity_kg': '4', 'early_late_reason': 'Early'}, format='json')
        if normal.status_code == 201:
            self.assertEqual(self.client.get(f'{FORCE}{normal.data["id"]}/').status_code, 404)

    def test_stocking_and_unit_endpoints_expose_the_forced_harvest(self):
        _, stock, units = self.start_cycle(ponds=2)
        hid = self.force([(stock, [(units[0], '5')])], reason='drought').data['harvests'][0]['id']
        self.as_(self.admin)
        rec = self.client.get(f'{STOCKING}{stock.id}/').data
        self.assertEqual([(f['id'], f['reason_label'], [u['label'] for u in f['units']]) for f in rec['forced_harvests']],
                         [(hid, 'Drought', ['Pond 1'])])
        panel = {u['label']: u for u in self.client.get(f'{STOCKING}{stock.id}/production-units/').data['units']}
        self.assertEqual(panel['Pond 1']['status'], 'forced_harvest')
        self.assertEqual(panel['Pond 1']['forced_harvest']['id'], hid)
        self.assertEqual(panel['Pond 1']['actual_harvest_kg'], '5.00')
        self.assertIsNone(panel['Pond 2']['forced_harvest'])
        self.assertEqual(panel['Pond 2']['status'], 'in_progress')

    # ── the Health Log Force Harvest is unchanged ──
    def test_health_log_force_harvest_still_works_and_is_not_an_emergency_one(self):
        cycle, stock, units = self.start_cycle(ponds=2)
        self.affect(cycle, units[0])
        self.as_(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f'{STOCKING}{stock.id}/harvests/', {
                'harvest_date': str(date.today()), 'notes': '',
                'unit_quantities': [{'production_unit': units[0].id, 'quantity_kg': '8'}]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertTrue(r.data['is_force_harvest'])
        self.assertEqual(r.data['force_harvest_reason'], '')                  # never an emergency Force Harvest
        h = FisheriesHarvestRecord.objects.get()
        self.assertEqual((h.is_force_harvest, h.force_harvest_reason), (True, ''))
        # its own notification (owner + staff) is as before, and this workflow's notification is not produced
        self.assertTrue(Notification.objects.filter(record_type=fn.FORCE_HARVEST).exists())
        self.assertFalse(self.emergency_notes().exists())
        # the HP/HC data is the Health Log one
        rows = {u['label']: u for u in self.client.get(f'{STOCKING}{stock.id}/').data['harvest_units']}
        self.assertTrue(rows['Pond 1']['force_harvested'])
        self.assertEqual(self.client.get(f'{STOCKING}{stock.id}/').data['forced_harvests'], [])

    def test_an_emergency_force_harvest_never_creates_an_hp_badge_or_the_old_notification(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        self.as_(self.admin)
        rows = {u['label']: u for u in self.client.get(f'{STOCKING}{stock.id}/').data['harvest_units']}
        self.assertTrue(rows['Pond 1']['harvested'])
        self.assertFalse(rows['Pond 1']['force_harvested'])                  # the HP/HC badge data is untouched
        self.assertFalse(Notification.objects.filter(record_type=fn.FORCE_HARVEST).exists())

    def test_the_normal_harvest_form_cannot_set_a_force_harvest_reason(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.as_(self.admin)
        r = self.client.post(f'{STOCKING}{stock.id}/harvests/', {
            'harvest_date': str(date.today()), 'quantity_kg': '5', 'force_harvest_reason': 'drought',
            'early_late_reason': 'Early'}, format='json')
        if r.status_code == 201:
            self.assertEqual(FisheriesHarvestRecord.objects.get().force_harvest_reason, '')

    def test_list_by_cycle_is_scoped_and_required(self):
        cycle, stock, units = self.start_cycle(ponds=2)
        hid = self.force([(stock, [(units[0], '5')])]).data['harvests'][0]['id']
        self.as_(self.admin)
        r = self.client.get(FORCE, {'production_cycle': cycle.id})
        self.assertEqual([h['id'] for h in r.data['harvests']], [hid])
        self.assertEqual(self.client.get(FORCE).status_code, 400)                      # the cycle id is required
        self.as_(self.user_b)
        self.assertEqual(self.client.get(FORCE, {'production_cycle': cycle.id}).data['harvests'], [])   # not theirs

    # ── statuses of the ponds and of the cycle ──
    def unit_panel(self, stock):
        self.as_(self.admin)
        return {u['label']: u for u in self.client.get(f'{STOCKING}{stock.id}/production-units/').data['units']}

    def test_force_harvesting_one_of_two_ponds_then_the_rest_updates_each_status_and_the_cycle(self):
        _, stock, units = self.start_cycle(ponds=2)
        self.assertEqual(self.force([(stock, [(units[0], '5')])]).status_code, 201)
        panel = self.unit_panel(stock)
        # Pond 1 is Forced Harvested (never in progress / stocked); Pond 2 keeps its own status
        self.assertEqual((panel['Pond 1']['status'], panel['Pond 2']['status']), ('forced_harvest', 'in_progress'))
        self.assertEqual((panel['Pond 1']['actual_harvest_kg'], panel['Pond 1']['harvest_dates']), ('5.00', [str(date.today())]))
        self.assertIsNone(panel['Pond 2']['forced_harvest'])
        rec = self.client.get(f'{STOCKING}{stock.id}/').data
        self.assertIn(rec['display_status'], ('Stocked', 'Near Harvest'))            # the cycle is still going
        self.assertEqual([u['harvested'] for u in rec['harvest_units']], [True, False])
        # the remaining eligible pond: the cycle now follows the existing completed-cycle rule
        self.assertEqual(self.force([(stock, [(units[1], '6')])], reason='drought').status_code, 201)
        panel = self.unit_panel(stock)
        self.assertEqual((panel['Pond 1']['status'], panel['Pond 2']['status']), ('forced_harvest', 'forced_harvest'))
        rec = self.client.get(f'{STOCKING}{stock.id}/').data
        self.assertEqual((rec['status'], rec['display_status']), ('Harvested', 'Harvested'))
        # each pond points at its own saved harvest: one label per unit, never two for the same pond
        ids = [panel['Pond 1']['forced_harvest']['id'], panel['Pond 2']['forced_harvest']['id']]
        self.assertEqual(len(set(ids)), 2)
        self.assertEqual([f['id'] for f in rec['forced_harvests']], ids)

    def test_a_pond_harvested_by_the_health_log_and_one_by_the_new_workflow_stay_distinct(self):
        cycle, stock, units = self.start_cycle(ponds=3)
        self.affect(cycle, units[0])
        self.as_(self.admin)
        with self.captureOnCommitCallbacks(execute=True):
            r = self.client.post(f'{STOCKING}{stock.id}/harvests/', {
                'harvest_date': str(date.today()), 'notes': '',
                'unit_quantities': [{'production_unit': units[0].id, 'quantity_kg': '8'}]}, format='json')
        self.assertEqual(r.status_code, 201, r.data)
        self.assertEqual(self.force([(stock, [(units[1], '5')])]).status_code, 201)
        panel = self.unit_panel(stock)
        self.assertEqual([panel[l]['status'] for l in ('Pond 1', 'Pond 2', 'Pond 3')], ['force_harvested', 'forced_harvest', 'in_progress'])
        self.assertIsNone(panel['Pond 1']['forced_harvest'])                       # the Health Log one has no FORCED HARVEST label
        rec = self.client.get(f'{STOCKING}{stock.id}/').data
        rows = {u['label']: u for u in rec['harvest_units']}
        self.assertTrue(rows['Pond 1']['force_harvested'])                         # HP badge data: only the Health Log pond
        self.assertFalse(rows['Pond 2']['force_harvested'])
        self.assertEqual([f['units'][0]['label'] for f in rec['forced_harvests']], ['Pond 2'])
        self.assertEqual(Notification.objects.filter(record_type=fn.FORCE_HARVEST, recipient=self.user_a).count(), 1)   # unchanged
        self.assertEqual(self.emergency_notes().count(), 1)
        self.assertEqual(FisheriesHarvestRecord.objects.count(), 2)

    def test_a_repeated_submission_creates_no_duplicate_record_unit_or_notification(self):
        _, stock, units = self.start_cycle(ponds=2)
        body = [(stock, [(units[0], '5')])]
        self.assertEqual(self.force(body).status_code, 201)
        self.assertEqual(self.force(body).status_code, 400)
        self.assertEqual(self.force(body).status_code, 400)
        self.assertEqual(FisheriesHarvestRecord.objects.count(), 1)
        self.assertEqual(FisheriesHarvestUnit.objects.count(), 1)
        self.assertEqual(self.emergency_notes().count(), 1)
