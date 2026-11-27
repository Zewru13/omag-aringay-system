"""A cooperative logs activities for its members who have no activated account: crop activities, and pond/cage feeding and health
logs, on one or many at once. It reaches only CURRENT members of its own cooperative who cannot log for themselves; it sees just
enough to pick the crop or cycle; and it can do nothing else with a member's records (no harvest, no single-record log pages)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import (
    FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember,
)
from farmers.models import FarmParcel, Farmer
from fisheries.models import Fisherfolk
from interventions.test_helpers import make_citizen, make_org
from monitoring.models import AquacultureFeedingLog, AquacultureHealthLog, AquacultureProductionCycle, AquacultureProductionUnit
from production.models import CropActivityLog, CropMonitoringRecord, CropType

User = get_user_model()
_RSBSA = itertools.count(940001)

CROPS = '/api/production/monitoring/member-crops/'
CROP_LOG = '/api/production/monitoring/bulk-logs/'
CYCLES = '/api/monitoring/aquaculture-cycles/member-cycles/'
FEEDING = '/api/monitoring/aquaculture-cycles/bulk-feeding/'
HEALTH = '/api/monitoring/aquaculture-cycles/bulk-health/'

# who a member is, and whether the cooperative may log for them
ALLOWED = ('NoAccount', 'NotActivated')
REFUSED = ('Activated', 'Ended', 'Elsewhere', 'NoMembership')


def rsbsa():
    return '01-033-02-019-%06d' % next(_RSBSA)


def inactive_shell(username, record_type, record_id):
    user = User.objects.create_user(username=username, password='pw', role='CITIZEN', email=f'{username}@x.test', is_active=False)
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def build_cooperative(cls, model, member_model, person_field, link_type, make_person):
    """One cooperative, a rival one, and a person of every kind named in ALLOWED and REFUSED."""
    cls.coop = make_org(model, 'Ours')
    cls.rival = make_org(model, 'Theirs')
    cls.people = {name: make_person(name) for name in ALLOWED + REFUSED}
    for name in ('NoAccount', 'NotActivated', 'Activated', 'Ended'):
        member_model.objects.create(organization=cls.coop, date_joined=date(2025, 1, 1), is_active=name != 'Ended',
                                    **{person_field: cls.people[name]})
    member_model.objects.create(organization=cls.rival, date_joined=date(2025, 1, 1), **{person_field: cls.people['Elsewhere']})
    inactive_shell(f'shell-{link_type}', link_type, cls.people['NotActivated'].id)
    make_citizen(f'active-{link_type}', link_type, cls.people['Activated'].id)


class MemberCropLoggingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        def farmer(first):
            return Farmer.objects.create(rsbsa_number=rsbsa(), first_name=first, last_name='Member', gender='Female',
                                         birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

        build_cooperative(cls, FarmersOrganization, FarmersOrganizationMember, 'farmer', 'FARMER', farmer)
        cls.coop_user = make_citizen('ml-farm-coop', 'FARMERS_ORG', cls.coop.id)
        cls.admin = User.objects.create_user(username='ml-adm', password='pw', role='ADMIN', email='ml-adm@x.test')
        cls.rice = CropType.objects.create(name='Member Log Rice', days_to_harvest=100)
        cls.parcels = {name: FarmParcel.objects.create(
            farmer=p, parcel_number='01-33-02-005-001-04-%03d' % p.id, area_hectares='9.00', land_ownership='Owner', barangay='Alaska')
            for name, p in cls.people.items()}

    def setUp(self):
        self.client.force_authenticate(self.coop_user)

    def crop(self, who='NoAccount', **over):
        data = dict(farmer=self.people[who], farm_parcel=self.parcels[who], farm_location_barangay='Alaska', land_status='Owner',
                    crop_type=self.rice, season='Wet', year=2026, date_planted=date.today() - timedelta(days=40),
                    area_planted_ha='1.00', status='Planted', variety_used=who)
        data.update(over)
        return CropMonitoringRecord.objects.create(**data)

    def log(self, crops, **over):
        data = {'record_ids': [c.id for c in crops], 'activity_type': 'Weeding', 'date_of_activity': str(date.today()), 'notes': 'Weeded'}
        data.update(over)
        return self.client.post(CROP_LOG, data, format='json')

    def test_the_list_has_only_growing_crops_of_current_members_without_an_account(self):
        wanted = [self.crop(who) for who in ALLOWED]
        for who in REFUSED:
            self.crop(who)
        self.crop('NoAccount', status='Harvested', variety_used='Old')
        res = self.client.get(CROPS)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(sorted(r['id'] for r in res.data['records']), sorted(c.id for c in wanted))
        self.assertEqual(res.data['member_count'], 2)

    def test_the_list_shows_only_what_is_needed_to_pick_a_crop(self):
        self.crop()
        row = self.client.get(CROPS).data['records'][0]
        self.assertEqual(set(row), {
            'id', 'member_id', 'member_name', 'crop_type_name', 'variety_used', 'farm_location_barangay', 'farm_parcel_number',
            'area_planted_ha', 'date_planted', 'expected_harvest_date', 'status'})
        self.assertEqual(row['member_name'], 'NoAccount Member')

    def test_one_or_many_crops_are_logged_in_the_cooperatives_name(self):
        one = self.crop()
        self.assertEqual(self.log([one]).status_code, 201)
        many = [self.crop('NoAccount', variety_used='B'), self.crop('NotActivated')]
        res = self.log(many)
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(res.data['logged'], 2)
        self.assertEqual(set(CropActivityLog.objects.values_list('recorded_by_id', flat=True)), {self.coop_user.id})
        self.assertEqual(CropActivityLog.objects.count(), 3)

    def test_anyone_else_s_crop_is_not_found_and_nothing_is_saved(self):
        allowed = self.crop()
        for who in REFUSED:
            res = self.log([allowed, self.crop(who)])
            self.assertEqual(res.status_code, 400, (who, res.content))
            self.assertIn('could not be found', str(res.data), who)
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_crop_on_a_removed_parcel_is_neither_listed_nor_logged(self):
        crop = self.crop()
        FarmParcel.objects.filter(pk=crop.farm_parcel_id).update(purged_at=timezone.now())
        self.assertEqual(self.client.get(CROPS).data['records'], [])
        self.assertEqual(self.log([crop]).status_code, 400)
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_a_refusal_says_whose_crop_it_is(self):
        young = self.crop('NotActivated', date_planted=date.today() - timedelta(days=2), variety_used='Young')
        res = self.log([self.crop(), young], date_of_activity=str(date.today() - timedelta(days=5)))
        self.assertEqual(res.status_code, 400, res.content)
        self.assertTrue(res.data['detail'].startswith('NotActivated Member, Member Log Rice (Young): '), res.data['detail'])

    def test_activating_the_account_takes_the_member_away_from_the_cooperative(self):
        crop = self.crop('NotActivated')
        self.assertEqual([r['id'] for r in self.client.get(CROPS).data['records']], [crop.id])
        User.objects.filter(username='shell-FARMER').update(is_active=True)
        self.assertEqual(self.client.get(CROPS).data['records'], [])
        self.assertEqual(self.log([crop]).status_code, 400)
        self.assertEqual(CropActivityLog.objects.count(), 0)

    def test_no_one_else_may_use_the_member_list(self):
        crop = self.crop()
        # a fisherfolk cooperative linked to the very same number as ours must not slip through by its id
        others = {
            'fisherfolk cooperative': make_citizen('ml-fish-coop', 'FISHERFOLK_ORG', self.coop.id),
            'office': self.admin,
            'member': User.objects.get(username='active-FARMER'),
        }
        for who, user in others.items():
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(CROPS).status_code, 403, who)
            if who != 'member':   # a farmer account logs on its OWN crops here
                self.assertEqual(self.log([crop]).status_code, 403, who)
        self.assertEqual(CropActivityLog.objects.count(), 0)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(CROPS).status_code, 401)

    def test_the_cooperative_gets_nothing_else_of_a_member_s_crop(self):
        crop = self.crop()
        for method, url in (
            ('get', f'/api/production/monitoring/{crop.id}/logs/'),
            ('post', f'/api/production/monitoring/{crop.id}/logs/'),
            ('get', f'/api/production/monitoring/{crop.id}/'),
            ('patch', f'/api/production/monitoring/{crop.id}/'),
            ('delete', f'/api/production/monitoring/{crop.id}/'),
            ('post', f'/api/production/monitoring/{crop.id}/disasters/'),
            ('post', f'/api/production/monitoring/{crop.id}/labor/'),
            ('post', f'/api/production/monitoring/{crop.id}/inputs/'),
            ('get', f'/api/production/monitoring/{crop.id}/suggestions/'),
            ('post', '/api/production/create/'),                      # recording a harvest
        ):
            res = getattr(self.client, method)(url, {}, format='json')
            self.assertIn(res.status_code, (403, 404, 405), (method, url, res.status_code))
        self.assertEqual(CropActivityLog.objects.count(), 0)


class MemberCycleLoggingTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        def fisherfolk(first):
            return Fisherfolk.objects.create(rsbsa_number=rsbsa(), first_name=first, last_name='Member', gender='Male',
                                             birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Aquaculture')

        build_cooperative(cls, FisherfolkOrganization, FisherfolkOrganizationMember, 'fisherfolk', 'FISHERFOLK', fisherfolk)
        cls.coop_user = make_citizen('ml-fisherfolk-coop', 'FISHERFOLK_ORG', cls.coop.id)
        cls.farm_coop_user = make_citizen('ml-other-farm-coop', 'FARMERS_ORG', cls.coop.id)
        cls.admin = User.objects.create_user(username='ml-adm2', password='pw', role='ADMIN', email='ml-adm2@x.test')

    def setUp(self):
        self.client.force_authenticate(self.coop_user)

    def cycle(self, who='NoAccount', status='Active', units=2):
        cycle = AquacultureProductionCycle.objects.create(
            fisherfolk=self.people[who], cycle_name=f'{who} cycle {AquacultureProductionCycle.objects.count() + 1}',
            species_farmed='Tilapia', culture_system='Fishpond', stocking_date=date.today() - timedelta(days=30), status=status)
        for i in range(units):
            AquacultureProductionUnit.objects.create(production_cycle=cycle, unit_type='pond', unit_number=i + 1, size_sqm='100', fingerling_count=500)
        return cycle

    def feed(self, cycles):
        return self.client.post(FEEDING, {'feeding_date': str(date.today()), 'feed_type': 'Starter', 'cycles': [
            {'cycle': c.id, 'unit_quantities': [{'production_unit': u.id, 'quantity_kg': '5'} for u in c.units.all()]} for c in cycles]}, format='json')

    def check_health(self, units):
        return self.client.post(HEALTH, {'log_date': str(date.today()), 'unit_logs': [
            {'cycle': u.production_cycle_id, 'production_unit': u.id, 'observation': 'Poor Water Quality', 'mortality_count': 0,
             'treatment_applied': 'Water Exchange'} for u in units]}, format='json')

    def test_the_list_has_only_active_cycles_of_current_members_without_an_account(self):
        wanted = [self.cycle(who) for who in ALLOWED]
        for who in REFUSED:
            self.cycle(who)
        self.cycle('NoAccount', status='Harvested')
        self.cycle('NoAccount', units=0)          # nothing to log on
        res = self.client.get(CYCLES)
        self.assertEqual(res.status_code, 200, res.content)
        self.assertEqual(sorted(r['id'] for r in res.data['records']), sorted(c.id for c in wanted))
        self.assertEqual(res.data['member_count'], 2)

    def test_the_list_shows_only_what_is_needed_to_pick_a_pond(self):
        self.cycle()
        row = self.client.get(CYCLES).data['records'][0]
        self.assertEqual(set(row), {'id', 'member_id', 'member_name', 'cycle_name', 'species_farmed', 'culture_system', 'status',
                                    'stocking_date', 'units'})
        self.assertEqual(set(row['units'][0]), {'id', 'unit_type', 'unit_number'})
        self.assertEqual(row['member_name'], 'NoAccount Member')

    def test_feeding_and_health_logs_are_saved_for_one_or_many(self):
        a, b = self.cycle(), self.cycle('NotActivated')
        res = self.feed([a])
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual(self.feed([a, b]).data['logged'], 2)
        res = self.check_health([a.units.first(), b.units.first()])
        self.assertEqual(res.status_code, 201, res.content)
        self.assertEqual((AquacultureFeedingLog.objects.count(), AquacultureHealthLog.objects.count()), (3, 2))

    def test_anyone_else_s_cycle_is_not_found_and_nothing_is_saved(self):
        allowed = self.cycle()
        for who in REFUSED:
            other = self.cycle(who)
            for res in (self.feed([allowed, other]), self.check_health([allowed.units.first(), other.units.first()])):
                self.assertEqual(res.status_code, 400, (who, res.content))
                self.assertIn('could not be found', str(res.data), who)
        self.assertEqual((AquacultureFeedingLog.objects.count(), AquacultureHealthLog.objects.count()), (0, 0))

    def test_a_refusal_says_whose_cycle_it_is(self):
        cycle = self.cycle('NotActivated', status='Harvested')
        for res in (self.feed([cycle]), self.check_health([cycle.units.first()])):
            self.assertEqual(res.status_code, 400, res.content)
            self.assertTrue(res.data['detail'].startswith(f'NotActivated Member, {cycle.cycle_name}'), res.data['detail'])
            self.assertEqual(res.data['detail'].count(cycle.cycle_name), 1, res.data['detail'])

    def test_activating_the_account_takes_the_member_away_from_the_cooperative(self):
        cycle = self.cycle('NotActivated')
        User.objects.filter(username='shell-FISHERFOLK').update(is_active=True)
        self.assertEqual(self.client.get(CYCLES).data['records'], [])
        self.assertEqual(self.feed([cycle]).status_code, 400)
        self.assertEqual(self.check_health([cycle.units.first()]).status_code, 400)

    def test_no_one_else_may_use_the_member_list_or_log(self):
        cycle = self.cycle()
        for who, user in (('farmers cooperative', self.farm_coop_user), ('office', self.admin)):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(CYCLES).status_code, 403, who)
            self.assertEqual(self.feed([cycle]).status_code, 403, who)
            self.assertEqual(self.check_health([cycle.units.first()]).status_code, 403, who)
        self.client.force_authenticate(User.objects.get(username='active-FISHERFOLK'))
        self.assertEqual(self.client.get(CYCLES).status_code, 403, 'a member')
        self.assertEqual((AquacultureFeedingLog.objects.count(), AquacultureHealthLog.objects.count()), (0, 0))
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(CYCLES).status_code, 401)

    def test_the_cooperative_gets_nothing_else_of_a_member_s_cycle(self):
        cycle = self.cycle()
        for method, url in (
            ('get', '/api/monitoring/aquaculture-cycles/'),
            ('get', f'/api/monitoring/aquaculture-cycles/{cycle.id}/'),
            ('patch', f'/api/monitoring/aquaculture-cycles/{cycle.id}/'),
            ('get', f'/api/monitoring/aquaculture-cycles/{cycle.id}/feeding/'),
            ('post', f'/api/monitoring/aquaculture-cycles/{cycle.id}/feeding/'),
            ('post', f'/api/monitoring/aquaculture-cycles/{cycle.id}/health/'),
            ('post', '/api/fisheries/stocking/1/harvests/'),          # recording a harvest
        ):
            res = getattr(self.client, method)(url, {}, format='json')
            self.assertIn(res.status_code, (403, 404, 405), (method, url, res.status_code))
