"""What an organization confirmed for its members, one row per ASSISTANCE: GET /api/interventions/confirmed-for-members/<type>/<id>/assistances/.

Each row is one assistance (the records of one distribution, or of one old group of identical records) with the members of it that the
organization confirmed, newest confirmation first. The existing per-member history (the same URL without /assistances/) is unchanged.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import shutil
import tempfile
import uuid
from datetime import date

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember, FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.test_helpers import earlier_confirmation, farmer, make_citizen, make_org

URL = '/api/interventions/confirmed-for-members/{type}/{id}/assistances/'


def record(person, assistance='Seeds', batch=None, day=date(2026, 8, 1), **over):
    return BeneficiaryRecord.objects.create(farmer=person, assistance_type=assistance, date_given=day, quantity='5 sack',
                                            source_agencies=['DA'], distribution_batch=batch, **over)


class ConfirmedAssistancesTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='cfa-staff', password='pw', role='ADMIN', email='cfa@x.test')
        cls.org = make_org(FarmersOrganization, 'Assist Farmers')
        cls.other = make_org(FarmersOrganization, 'Other Assist Farmers')
        cls.org_user = make_citizen('cfa-org', 'FARMERS_ORG', cls.org.id)
        cls.other_user = make_citizen('cfa-other', 'FARMERS_ORG', cls.other.id)

    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)
        self.people = [farmer(n) for n in ('Ana', 'Ben', 'Cora')]
        for p in self.people:
            FarmersOrganizationMember.objects.create(organization=self.org, farmer=p, date_joined=date(2026, 1, 1))

    def confirm(self, records):
        earlier_confirmation(records, self.org, self.org_user)

    def rows(self, user=None, org_id=None, type_='farmers', **params):
        self.client.force_authenticate(user or self.staff)
        r = self.client.get(URL.format(type=type_, id=org_id or self.org.id), params)
        self.assertEqual(r.status_code, 200, r.content)
        return r.json()

    def test_nothing_confirmed_is_an_empty_list(self):
        self.assertEqual(self.rows()['count'], 0)

    def test_the_members_of_one_assistance_are_one_row(self):
        batch = uuid.uuid4()
        recs = [record(p, batch=batch) for p in self.people[:2]]
        self.confirm(recs)
        data = self.rows()
        self.assertEqual(data['count'], 1)
        row = data['results'][0]
        self.assertEqual((row['assistance_type'], row['quantity'], row['source_agencies'], row['date_given']), ('Seeds', '5 sack', ['DA'], '2026-08-01'))
        self.assertEqual(row['member_count'], 2)
        self.assertEqual(sorted(m['name'] for m in row['members']), ['Ana Bulk', 'Ben Bulk'])
        member = row['members'][0]
        for key in ('request_id', 'record_id', 'name', 'rsbsa', 'barangay', 'confirmed_at', 'confirmed_by', 'photo_urls'):
            self.assertIn(key, member)
        self.assertEqual(member['barangay'], 'Alaska')
        self.assertEqual(len(member['photo_urls']), 2)
        self.assertTrue(row['confirmed_at'])

    def test_only_the_members_that_were_confirmed_are_counted(self):
        batch = uuid.uuid4()
        recs = [record(p, batch=batch) for p in self.people]       # three given, one confirmed
        self.confirm(recs[:1])
        row = self.rows()['results'][0]
        self.assertEqual((row['member_count'], [m['name'] for m in row['members']]), (1, ['Ana Bulk']))

    def test_two_assistances_are_two_rows_newest_confirmation_first(self):
        seeds = [record(p, 'Seeds', batch=uuid.uuid4()) for p in self.people[:1]]
        fert = [record(p, 'Fertilizer', batch=uuid.uuid4(), day=date(2026, 9, 1)) for p in self.people[1:2]]
        self.confirm(seeds)
        self.confirm(fert)
        rows = self.rows()['results']
        self.assertEqual([r['assistance_type'] for r in rows], ['Fertilizer', 'Seeds'])
        self.assertEqual([r['member_count'] for r in rows], [1, 1])

    def test_the_name_of_the_item_is_given(self):
        self.confirm([record(self.people[0], batch=uuid.uuid4(), seed_type='Palay (Rice)')])
        row = self.rows()['results'][0]
        self.assertEqual(row['item'], 'Palay (Rice)')

    def test_a_row_has_an_id_that_stays_the_same(self):
        batch = uuid.uuid4()
        self.confirm([record(self.people[0], batch=batch)])
        self.assertEqual(self.rows()['results'][0]['id'], str(batch))

    def test_the_list_is_paged_ten_assistances_at_a_time(self):
        for i in range(12):
            self.confirm([record(self.people[0], batch=uuid.uuid4(), day=date(2026, 8, 1 + i % 20))])
        page1, page2 = self.rows(), self.rows(page=2)
        self.assertEqual((page1['count'], len(page1['results']), len(page2['results'])), (12, 10, 2))

    def test_who_may_read_it(self):
        self.confirm([record(self.people[0], batch=uuid.uuid4())])
        self.assertEqual(self.rows(self.org_user)['count'], 1)
        self.client.force_authenticate(self.other_user)
        self.assertEqual(self.client.get(URL.format(type='farmers', id=self.org.id)).status_code, 403)
        self.assertEqual(self.rows(self.other_user, org_id=self.other.id)['count'], 0)
        member = make_citizen('cfa-member', 'FARMER', self.people[0].id)
        self.client.force_authenticate(member)
        self.assertEqual(self.client.get(URL.format(type='farmers', id=self.org.id)).status_code, 403)
        self.client.force_authenticate(self.staff)
        self.assertEqual(self.client.get(URL.format(type='boats', id=self.org.id)).status_code, 404)

    def test_the_fisherfolk_side_works_the_same_way(self):
        org = make_org(FisherfolkOrganization, 'Assist Fishers')
        user = make_citizen('cfa-fish-org', 'FISHERFOLK_ORG', org.id)
        person = Fisherfolk.objects.create(
            first_name='Fin', last_name='Assist', gender='Male', birthdate=date(1990, 1, 1), barangay='Poblacion',
            fisherfolk_type='Aquaculture', rsbsa_number='01-033-02-019-872001')
        FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=person, date_joined=date(2026, 1, 1))
        rec = FisherfolkBeneficiaryRecord.objects.create(fisherfolk=person, assistance_type='Feed', date_given=date(2026, 8, 1),
                                                         quantity='2 sack', item_type='Starter Feed', distribution_batch=uuid.uuid4())
        earlier_confirmation([rec], org, user)
        row = self.rows(self.staff, org_id=org.id, type_='fisherfolk')['results'][0]
        self.assertEqual((row['assistance_type'], row['item'], row['member_count'], row['members'][0]['name'], row['members'][0]['rsbsa']),
                         ('Feed', 'Starter Feed', 1, 'Fin Assist', '01-033-02-019-872001'))
