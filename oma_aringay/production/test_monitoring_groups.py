"""Crop Monitoring grouped by crop or by farmer: GET /api/production/monitoring/groups/?group_by=crop|farmer, with the same
filters and access rules as the record list; opening a group is the existing list scoped to that crop or farmer."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization
from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType

GROUPS = '/api/production/monitoring/groups/'
LIST = '/api/production/monitoring/'
_RSBSA = itertools.count(960001)


def make_farmer(first, last='Grouper', barangay='Alaska'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name=last, gender='Male',
        birthdate=date(1985, 1, 1), barangay=barangay, civil_status='Single')


def crop_type(name):
    ct, _ = CropType.objects.get_or_create(name=name, defaults=dict(days_to_harvest=100))
    CropType.objects.filter(pk=ct.pk).update(days_to_harvest=100)
    ct.refresh_from_db()
    return ct


def record(farmer, ct, area='1.00', status='Planted', planted_days_ago=30, season='Wet', year=2026, barangay='Alaska', **over):
    data = dict(farmer=farmer, farm_location_barangay=barangay, land_status='Owner', crop_type=ct, season=season, year=year,
                date_planted=date.today() - timedelta(days=planted_days_ago), area_planted_ha=area, status=status)
    data.update(over)
    return CropMonitoringRecord.objects.create(**data)


class MonitoringGroupsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='gm-admin', password='pw', role='ADMIN', email='gm-admin@x.test')
        cls.ana, cls.ben = make_farmer('Ana', 'Alpha'), make_farmer('Ben', 'Bravo', barangay='Basca')
        cls.rice, cls.corn = crop_type('Grp Rice'), crop_type('Grp Corn')
        record(cls.ana, cls.rice, '1.50')
        record(cls.ana, cls.rice, '2.00', status='Near Harvest', planted_days_ago=90)
        record(cls.ana, cls.corn, '1.00')
        record(cls.ben, cls.rice, '1.00', status='Harvested', planted_days_ago=120)
        record(cls.ben, cls.corn, '3.00', barangay='Basca')
        cls.ana_user = User.objects.create_user(username='gm-ana', password='pw', role='CITIZEN', email='gm-ana@x.test')
        UserLinkedRecord.objects.create(user=cls.ana_user, record_type='FARMER', record_id=cls.ana.id, is_active=True)
        cls.fisher_user = User.objects.create_user(username='gm-fish', password='pw', role='CITIZEN', email='gm-fish@x.test')
        UserLinkedRecord.objects.create(user=cls.fisher_user, record_type='FISHERFOLK', record_id=cls.ana.id, is_active=True)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def groups(self, **params):
        params.setdefault('group_by', 'crop')
        params.setdefault('status', 'Planted,Near Harvest')
        r = self.client.get(GROUPS, params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def by_name(self, data):
        return {g['name']: g for g in data['results']}

    # --- by crop
    def test_groups_by_crop_with_counts_and_area(self):
        data = self.groups()
        g = self.by_name(data)
        self.assertEqual(data['count'], 2)
        self.assertEqual((g['Grp Rice']['count'], g['Grp Rice']['area_planted_ha'], g['Grp Rice']['near_harvest']), (2, 3.5, 1))
        self.assertEqual((g['Grp Corn']['count'], g['Grp Corn']['area_planted_ha'], g['Grp Corn']['near_harvest']), (2, 4.0, 0))
        self.assertEqual([x['name'] for x in data['results']], ['Grp Corn', 'Grp Rice'])    # alphabetical

    def test_the_status_filter_applies_to_the_groups(self):
        data = self.groups(status='Harvested')
        self.assertEqual({g['name']: g['count'] for g in data['results']}, {'Grp Rice': 1})

    def test_search_barangay_season_and_year_filters_apply(self):
        self.assertEqual({g['name']: g['count'] for g in self.groups(search='Ana')['results']}, {'Grp Rice': 2, 'Grp Corn': 1})
        self.assertEqual({g['name']: g['count'] for g in self.groups(barangay='Basca')['results']}, {'Grp Corn': 1})
        self.assertEqual(self.groups(season='Dry')['count'], 0)
        self.assertEqual(self.groups(year='2019')['count'], 0)

    def test_a_crop_filter_narrows_to_that_crop(self):
        data = self.groups(crop_type=self.corn.id)
        self.assertEqual([g['name'] for g in data['results']], ['Grp Corn'])

    def test_a_group_key_opens_onto_the_same_records_in_the_list(self):
        group = self.by_name(self.groups())['Grp Rice']
        listed = self.client.get(LIST, {'crop_type': group['id'], 'status': 'Planted,Near Harvest'}).json()
        self.assertEqual(listed['count'], group['count'])

    # --- by farmer
    def test_groups_by_farmer(self):
        data = self.groups(group_by='farmer')
        g = self.by_name(data)
        self.assertEqual(set(g), {'Ana Alpha', 'Ben Bravo'})
        self.assertEqual((g['Ana Alpha']['count'], g['Ana Alpha']['area_planted_ha'], g['Ana Alpha']['barangay']), (3, 4.5, 'Alaska'))
        self.assertEqual(g['Ben Bravo']['count'], 1)
        listed = self.client.get(LIST, {'farmer': g['Ana Alpha']['id'], 'status': 'Planted,Near Harvest'}).json()
        self.assertEqual(len(listed), 3)    # a ?farmer= request returns that farmer's records unpaged

    def test_organization_owned_crops_form_their_own_group(self):
        org = FarmersOrganization.objects.create(name='Grp Org', barangay='Alaska', contact_person='X', contact_number='1', registration_number='G-1')
        record(None, self.rice, '5.00', farmers_organization=org)
        g = self.by_name(self.groups(group_by='farmer'))
        self.assertEqual(g['Grp Org']['count'], 1)
        self.assertEqual(g['Grp Org']['key'], f'o{org.id}')
        listed = self.client.get(LIST, {'farmers_organization': org.id, 'status': 'Planted,Near Harvest'}).json()
        self.assertEqual(listed['count'], 1)

    # --- paging
    def test_groups_are_paged_ten_at_a_time(self):
        for i in range(12):
            record(self.ana, crop_type(f'Grp Crop {i:02d}'))
        first = self.groups()
        self.assertEqual((first['count'], len(first['results'])), (14, 10))
        self.assertIsNotNone(first['next'])
        second = self.groups(page=2)
        self.assertEqual(len(second['results']), 4)

    # --- display status (the Near Harvest split)
    def test_display_status_splits_near_harvest_by_how_far_the_expected_date_is(self):
        today = date.today()
        due = record(self.ben, self.corn, status='Near Harvest', planted_days_ago=90)        # expected in 10 days
        ready = record(self.ben, self.corn, status='Near Harvest', planted_days_ago=100)     # expected today
        overdue = record(self.ben, self.corn, status='Near Harvest', planted_days_ago=110)   # 10 days ago
        for label, want in (('Due Harvest', due), ('Ready for Harvest', ready), ('Overdue', overdue)):
            ids = {r['id'] for r in self.client.get(LIST, {'status': 'Near Harvest', 'display_status': label, 'farmer': self.ben.id}).json()}
            self.assertEqual(ids, {want.id}, label)
        grouped = self.groups(group_by='farmer', status='Near Harvest', display_status='Overdue')
        self.assertEqual({g['name']: g['count'] for g in grouped['results']}, {'Ben Bravo': 1})
        self.assertEqual(today, date.today())

    # --- access
    def test_a_farmer_account_sees_only_its_own_crops(self):
        self.client.force_authenticate(self.ana_user)
        data = self.groups()
        self.assertEqual({g['name']: g['count'] for g in data['results']}, {'Grp Rice': 2, 'Grp Corn': 1})

    def test_a_fisherfolk_account_sees_nothing(self):
        self.client.force_authenticate(self.fisher_user)
        self.assertEqual(self.groups()['count'], 0)

    def test_an_anonymous_request_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(GROUPS, {'group_by': 'crop'}).status_code, (401, 403))

    def test_an_unknown_grouping_is_refused(self):
        self.assertEqual(self.client.get(GROUPS, {'group_by': 'barangay'}).status_code, 400)
        self.assertEqual(self.client.get(GROUPS).status_code, 400)
