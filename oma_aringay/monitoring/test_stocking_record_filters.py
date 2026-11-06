"""The filters of Aquaculture Records: GET /api/fisheries/stocking/ answers ownership, cycle, culture type, organization, the fisherfolk's barangay
and the pond/cage location (on top of the species, fisherfolk, Date Stocked range, PCIC and search it already had), and
GET /api/fisheries/stocking/filter-options/ lists the values those dropdowns offer, read from the existing records only.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from accounts.models import UserLinkedRecord
from django.contrib.auth import get_user_model

from monitoring.models import AquacultureProductionCycle
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'
OPTIONS = '/api/fisheries/stocking/filter-options/'
ALL = 'Stocked,Near Harvest,Harvested,Total Loss'


class StockingRecordFilterTests(ProductionCycleBase):
    def setUp(self):
        super().setUp()
        self.ff_b.barangay = 'Basca'
        self.ff_b.save(update_fields=['barangay'])
        common = dict(fingerling_source='BFAR')
        made = {}
        for key, over in (
            ('alpha', dict(fisherfolk=self.ff_a.id, cycle_name='Alpha', ownership='Tenant', owner_name='Tom Owner', owner_registration_number='01-33',
                           culture_system='Fishpond', organization=self.org_a.id, pond_location_barangay='Samara', pcic_insured=False)),
            ('beta', dict(fisherfolk=self.ff_b.id, cycle_name='Beta', ownership='Owner', culture_system='Fishcage', organization=self.org_b.id,
                          pond_location_barangay='Basca', pcic_insured=True)),
            ('gamma', dict(fisherfolk=self.ff_none.id, cycle_name='Gamma', ownership='Owner', culture_system='Fishpond', pond_location_barangay='Samara')),
        ):
            response = self.post(**common, **over)
            self.assertEqual(response.status_code, 201, response.content[:300])
            made[key] = response.json()['stocking_record_id']
        # a cycle made before ownership existed has none saved (a new one must choose)
        AquacultureProductionCycle.objects.filter(cycle_name='Gamma').update(ownership='')
        self.made = made

    def ids(self, **params):
        r = self.client.get(STOCKING, {'status': ALL, **params})
        self.assertEqual(r.status_code, 200, r.content[:300])
        body = r.json()
        return {row['id'] for row in (body['results'] if isinstance(body, dict) else body)}

    def only(self, *keys):
        return {self.made[k] for k in keys}

    # ── each filter on its own
    def test_everything_is_listed_when_nothing_is_filtered(self):
        self.assertEqual(self.ids(), self.only('alpha', 'beta', 'gamma'))

    def test_ownership(self):
        self.assertEqual(self.ids(ownership='Tenant'), self.only('alpha'))
        self.assertEqual(self.ids(ownership='Owner'), self.only('beta'))
        self.assertEqual(self.ids(ownership='none'), self.only('gamma'))        # "Not specified": a cycle made before ownership existed
        self.assertEqual(self.ids(ownership='nonsense'), self.only('alpha', 'beta', 'gamma'))

    def test_cycle_by_its_name(self):
        self.assertEqual(self.ids(cycle='Beta'), self.only('beta'))
        self.assertEqual(self.ids(cycle='No such cycle'), set())

    def test_culture_type(self):
        rows = {r['id']: r for r in self.client.get(STOCKING, {'status': ALL}).json()['results']}
        pond, cage = rows[self.made['alpha']]['culture_type'], rows[self.made['beta']]['culture_type']
        self.assertNotEqual(pond, cage)
        self.assertEqual(self.ids(culture_type=pond), self.only('alpha', 'gamma'))
        self.assertEqual(self.ids(culture_type=cage), self.only('beta'))

    def test_organization(self):
        self.assertEqual(self.ids(organization=self.org_a.id), self.only('alpha'))
        self.assertEqual(self.ids(organization=self.org_b.id), self.only('beta'))

    def test_the_fisherfolks_barangay_and_the_pond_location_are_two_different_filters(self):
        self.assertEqual(self.ids(fisherfolk_barangay='Basca'), self.only('beta'))
        self.assertEqual(self.ids(fisherfolk_barangay='Poblacion'), self.only('alpha', 'gamma'))
        self.assertEqual(self.ids(pond_location='Samara'), self.only('alpha', 'gamma'))
        self.assertEqual(self.ids(pond_location='Basca'), self.only('beta'))

    def test_species_fisherfolk_pcic_and_date_stocked_still_work(self):
        self.assertEqual(self.ids(fisherfolk=self.ff_b.id), self.only('beta'))
        self.assertEqual(self.ids(pcic='insured'), self.only('beta'))
        self.assertEqual(self.ids(pcic='not_insured'), self.only('alpha', 'gamma'))
        self.assertEqual(self.ids(species=self.species.id), self.only('alpha', 'beta', 'gamma'))
        self.assertEqual(self.ids(stocked_from='2999-01-01'), set())

    # ── together
    def test_filters_work_together_and_with_the_search(self):
        self.assertEqual(self.ids(pond_location='Samara', ownership='Tenant'), self.only('alpha'))
        self.assertEqual(self.ids(pond_location='Samara', pcic='insured'), set())
        self.assertEqual(self.ids(pond_location='Samara', search='Cy'), self.only('gamma'))
        self.assertEqual(self.ids(organization=self.org_b.id, cycle='Alpha'), set())
        self.assertEqual(self.ids(fisherfolk_barangay='Poblacion', pcic='not_insured', search='Ann'), self.only('alpha'))

    # ── the dropdown options come from the existing records
    def options(self):
        r = self.client.get(OPTIONS)
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.json()

    def test_the_options_are_only_what_the_records_have(self):
        o = self.options()
        self.assertEqual(sorted(o['cycles']), ['Alpha', 'Beta', 'Gamma'])
        self.assertEqual(sorted(x['value'] for x in o['ownerships']), ['Owner', 'Tenant', 'none'])
        self.assertEqual(sorted(o['barangays']), ['Basca', 'Poblacion'])
        self.assertEqual(sorted(o['pond_locations']), ['Basca', 'Samara'])
        self.assertEqual(sorted(x['name'] for x in o['organizations']), ['OrgA', 'OrgB'])     # OrgA2 and the inactive one have no cycle
        self.assertEqual(sorted(x['id'] for x in o['fisherfolk']), sorted([self.ff_a.id, self.ff_b.id, self.ff_none.id]))
        self.assertEqual([x['name'] for x in o['species']], ['Tilapia'])
        self.assertEqual(len(o['culture_types']), 2)

    def test_the_options_follow_the_records_not_a_fixed_list(self):
        self.client.get(STOCKING)
        from fisheries.models import StockingRecord
        StockingRecord.objects.filter(pk=self.made['beta']).delete()
        o = self.options()
        self.assertEqual(sorted(o['cycles']), ['Alpha', 'Gamma'])
        self.assertEqual([x['name'] for x in o['organizations']], ['OrgA'])

    def test_a_fisherfolk_account_is_offered_only_its_own_values(self):
        User = get_user_model()
        citizen = User.objects.create_user(username='ann_opts', password='pw', role='CITIZEN', email='ann_opts@x.test')
        UserLinkedRecord.objects.create(user=citizen, record_type=User.LinkedRecordType.FISHERFOLK, record_id=self.ff_a.id, is_active=True)
        self.client.force_authenticate(citizen)
        o = self.options()
        self.assertEqual(o['cycles'], ['Alpha'])
        self.assertEqual([x['id'] for x in o['fisherfolk']], [self.ff_a.id])

    def test_an_anonymous_request_is_refused(self):
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(OPTIONS).status_code, (401, 403))
