"""A feeding or a health log made on the ponds and cages of SEVERAL production cycles at once:
POST /api/monitoring/aquaculture-cycles/bulk-feeding/ and /bulk-health/.

A fisherfolk with many cycles logs the same feeding (or the same observation) once instead of cycle by cycle. One AquacultureFeedingLog is
saved for each cycle (with its per-pond quantities) and one AquacultureHealthLog for each pond/cage, each exactly like the single-cycle forms
(same serializers, same checks). Only a fisherfolk account can use it, and it reaches only its OWN cycles. All or nothing: if anything cannot be saved, nothing is, and
the answer names the cycle."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from fisheries.models import Fisherfolk
from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle, AquacultureProductionUnit

FEEDING = '/api/monitoring/aquaculture-cycles/bulk-feeding/'
HEALTH = '/api/monitoring/aquaculture-cycles/bulk-health/'
_RSBSA = itertools.count(960001)


def make_fisherfolk(first):
    return Fisherfolk.objects.create(first_name=first, last_name='Bulk', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
                                     fisherfolk_type='Inland', rsbsa_number='01-033-02-019-%06d' % next(_RSBSA))


def make_citizen(username, record_type, record_id):
    user = get_user_model().objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test')
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


class BulkAquacultureLogTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='bal-adm', password='pw', role='ADMIN', email='bala@x.test')
        cls.pablo, cls.joshua = make_fisherfolk('Pablo'), make_fisherfolk('Joshua')
        cls.pablo_user = make_citizen('bal-pablo', 'FISHERFOLK', cls.pablo.id)
        cls.farmer_user = make_citizen('bal-farmer', 'FARMER', cls.pablo.id)    # a farmer whose id happens to match

    def setUp(self):
        self.client.force_authenticate(self.pablo_user)

    def cycle(self, owner=None, units=2, status='Active', name=None):
        owner = owner or self.pablo
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=owner, cycle_name=name or f'Cycle {AquacultureProductionCycle.objects.count() + 1}', species_farmed='Tilapia',
            culture_system='Fishpond', stocking_date=date.today() - timedelta(days=30), status=status)
        for i in range(units):
            AquacultureProductionUnit.objects.create(production_cycle=cycle, unit_type='pond', unit_number=i + 1, size_sqm='100', fingerling_count=500)
        return cycle

    def feeding(self, cycles, qty='5', **over):
        data = {'feeding_date': str(date.today()), 'feed_type': 'Starter', 'notes': 'Morning',
                'cycles': [{'cycle': c.id, 'unit_quantities': [{'production_unit': u.id, 'quantity_kg': qty} for u in c.units.all()]} for c in cycles]}
        data.update(over)
        return self.client.post(FEEDING, data, format='json')

    def health(self, entries, **over):
        data = {'log_date': str(date.today()), 'notes': 'Seen at dawn', 'unit_logs': entries}
        data.update(over)
        return self.client.post(HEALTH, data, format='json')

    def entry(self, unit, **over):
        data = {'cycle': unit.production_cycle_id, 'production_unit': unit.id, 'observation': 'Poor Water Quality', 'mortality_count': 0,
                'treatment_applied': 'Water Exchange'}
        data.update(over)
        return data

    # ─── feeding ─────────────────────────────────────────────────────────────

    def test_one_feeding_is_logged_on_every_cycle_with_its_pond_quantities(self):
        a, b, c = self.cycle(), self.cycle(), self.cycle(units=3)
        r = self.feeding([a, b, c])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['logged'], 3)
        self.assertEqual(AquacultureFeedingLog.objects.count(), 3)
        log = AquacultureFeedingLog.objects.get(production_cycle=c)
        self.assertEqual((log.feed_type, str(log.quantity_kg), log.notes, log.feeding_date), ('Starter', '15.00', 'Morning', date.today()))
        self.assertEqual(log.unit_quantities.count(), 3)
        self.assertEqual(AquacultureFeedingLog.objects.get(production_cycle=a).quantity_kg, 10)   # 2 ponds x 5 kg

    def test_each_pond_can_have_its_own_quantity(self):
        a = self.cycle()
        first, second = list(a.units.all())
        r = self.client.post(FEEDING, {'feeding_date': str(date.today()), 'feed_type': 'Starter', 'cycles': [
            {'cycle': a.id, 'unit_quantities': [{'production_unit': first.id, 'quantity_kg': '2.5'}, {'production_unit': second.id, 'quantity_kg': '4'}]}]}, format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(str(AquacultureFeedingLog.objects.get().quantity_kg), '6.50')

    def test_a_fisherfolk_cannot_name_another_fisherfolks_cycle(self):
        mine, theirs = self.cycle(), self.cycle(self.joshua)
        r = self.feeding([mine, theirs])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('could not be found', str(r.json()))
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    def test_a_citizen_with_no_fisherfolk_link_is_refused(self):
        # such an account must never see the cycles of everyone: it is refused before any cycle is looked up
        nobody = get_user_model().objects.create_user(username='bal-nobody', password='pw', role='CITIZEN', email='nobody@x.test')
        self.client.force_authenticate(nobody)
        cycle = self.cycle(self.joshua)
        self.assertEqual(self.feeding([cycle]).status_code, 403)
        self.assertEqual(self.health([self.entry(cycle.units.first())]).status_code, 403)
        self.assertEqual(AquacultureFeedingLog.objects.count() + AquacultureHealthLog.objects.count(), 0)

    def test_a_farmer_account_cannot_use_it(self):
        self.client.force_authenticate(self.farmer_user)
        r = self.feeding([self.cycle()])
        self.assertEqual(r.status_code, 403, r.content)
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    def test_a_cycle_that_is_not_active_stops_everything(self):
        good, done = self.cycle(), self.cycle(status='Harvested', name='Old pond')
        r = self.feeding([good, done])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Old pond', r.json()['detail'])
        self.assertEqual([e['cycle'] for e in r.json()['errors']], [done.id])
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    def test_a_pond_of_another_cycle_is_refused_naming_the_cycle(self):
        a, b = self.cycle(name='Cycle A'), self.cycle(name='Cycle B')
        other_unit = b.units.first()
        r = self.client.post(FEEDING, {'feeding_date': str(date.today()), 'feed_type': 'Starter', 'cycles': [
            {'cycle': a.id, 'unit_quantities': [{'production_unit': other_unit.id, 'quantity_kg': '3'}]}]}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Cycle A', r.json()['detail'])
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    def test_a_feeding_needs_some_quantity_in_each_cycle(self):
        a = self.cycle(name='Cycle A')
        r = self.feeding([a], qty='0')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Cycle A', r.json()['detail'])

    def test_the_feeding_list_is_checked(self):
        a = self.cycle()
        self.assertEqual(self.feeding([]).status_code, 400)
        self.assertEqual(self.feeding([a, a]).status_code, 400)                       # the same cycle twice
        self.assertEqual(self.client.post(FEEDING, {'feeding_date': str(date.today()), 'feed_type': '', 'cycles': []}, format='json').status_code, 400)
        r = self.feeding([a], feeding_date='')
        self.assertEqual(r.status_code, 400, r.content)
        r = self.feeding([a], feed_type='')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    def test_the_office_does_not_log_a_feeding_on_many_cycles(self):
        self.client.force_authenticate(self.admin)
        r = self.feeding([self.cycle(), self.cycle(self.joshua)])
        self.assertEqual(r.status_code, 403, r.content)
        self.assertEqual(AquacultureFeedingLog.objects.count(), 0)

    # ─── health ──────────────────────────────────────────────────────────────

    def test_one_health_log_is_saved_for_each_pond_across_cycles(self):
        a, b = self.cycle(), self.cycle()
        units = list(a.units.all()) + list(b.units.all())
        r = self.health([self.entry(u) for u in units])
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(r.json()['logged'], 4)
        self.assertEqual(AquacultureHealthLog.objects.count(), 4)
        log = AquacultureHealthLog.objects.filter(production_cycle=b).first()
        self.assertEqual((log.observation, log.treatment_applied, log.notes, log.log_date), ('Poor Water Quality', 'Water Exchange', 'Seen at dawn', date.today()))

    def test_fish_mortality_needs_its_own_count_and_sets_force_harvest(self):
        unit = self.cycle().units.first()
        r = self.health([self.entry(unit, observation='Fish Mortality', mortality_count=0, treatment_applied='')])
        self.assertEqual(r.status_code, 400, r.content)
        r = self.health([self.entry(unit, observation='Fish Mortality', mortality_count=12, treatment_applied='')])
        self.assertEqual(r.status_code, 201, r.content)
        log = AquacultureHealthLog.objects.get()
        self.assertEqual(log.mortality_count, 12)
        self.assertTrue(log.force_harvest)

    def test_a_pond_that_already_has_a_health_log_stops_everything(self):
        a = self.cycle(name='Cycle A')
        first, second = list(a.units.all())
        self.assertEqual(self.health([self.entry(first)]).status_code, 201)
        r = self.health([self.entry(second), self.entry(first)])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Cycle A', r.json()['detail'])
        self.assertEqual(AquacultureHealthLog.objects.count(), 1)

    def test_a_health_log_cannot_name_another_fisherfolks_pond(self):
        theirs = self.cycle(self.joshua).units.first()
        r = self.health([self.entry(theirs)])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('could not be found', str(r.json()))
        self.assertEqual(AquacultureHealthLog.objects.count(), 0)

    def test_a_pond_listed_twice_or_a_wrong_cycle_is_refused(self):
        a, b = self.cycle(), self.cycle()
        unit = a.units.first()
        self.assertEqual(self.health([self.entry(unit), self.entry(unit)]).status_code, 400)
        self.assertEqual(self.health([self.entry(unit, cycle=b.id)]).status_code, 400)    # the pond is not in that cycle
        self.assertEqual(self.health([]).status_code, 400)
        self.assertEqual(AquacultureHealthLog.objects.count(), 0)

    def test_a_cycle_that_is_not_active_refuses_the_health_log(self):
        done = self.cycle(status='Failed', name='Lost pond')
        r = self.health([self.entry(done.units.first())])
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('Lost pond', r.json()['detail'])

    def test_the_office_does_not_log_health_on_many_ponds(self):
        self.client.force_authenticate(self.admin)
        r = self.health([self.entry(self.cycle(self.joshua).units.first())])
        self.assertEqual(r.status_code, 403, r.content)
        self.assertEqual(AquacultureHealthLog.objects.count(), 0)

    def test_an_anonymous_caller_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.feeding([self.cycle()]).status_code, (401, 403))
        self.assertIn(self.health([self.entry(self.cycle().units.first())]).status_code, (401, 403))
