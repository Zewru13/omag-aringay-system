"""The PCIC Insured filter of Aquaculture Monitoring: ?pcic=insured / not_insured on GET /api/fisheries/stocking/ (the table the page lists).

It filters on each cycle's saved PCIC status (the flag its PCIC INSURED column reads) and combines with the search and the other filters.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from monitoring.tests import ProductionCycleBase

STOCKING = '/api/fisheries/stocking/'
ALL_STATUS = 'Stocked,Near Harvest,Harvested'


class StockingPcicFilterTests(ProductionCycleBase):
    @classmethod
    def setUpTestData(cls):
        super().setUpTestData()

    def setUp(self):
        super().setUp()
        made = {}
        for key, ff, insured in (('ann_in', self.ff_a, True), ('ben_out', self.ff_b, False), ('cy_in', self.ff_none, True), ('ann_out', self.ff_a, False)):
            response = self.post(fisherfolk=ff.id, pcic_insured=insured, cycle_name=key)
            self.assertEqual(response.status_code, 201, response.content[:300])
            made[key] = response.json()['stocking_record_id']
        self.made = made

    def ids(self, **params):
        r = self.client.get(STOCKING, {'status': ALL_STATUS, **params})
        self.assertEqual(r.status_code, 200, r.content[:300])
        rows = r.json()['results'] if isinstance(r.json(), dict) else r.json()
        return {row['id'] for row in rows}

    def test_insured_lists_only_the_insured_cycles(self):
        self.assertEqual(self.ids(pcic='insured'), {self.made['ann_in'], self.made['cy_in']})

    def test_not_insured_lists_only_the_uninsured_cycles(self):
        self.assertEqual(self.ids(pcic='not_insured'), {self.made['ben_out'], self.made['ann_out']})

    def test_all_or_anything_else_changes_nothing(self):
        everything = self.ids()
        self.assertEqual(everything, set(self.made.values()))
        self.assertEqual(self.ids(pcic=''), everything)
        self.assertEqual(self.ids(pcic='anything'), everything)

    def test_the_two_options_never_overlap_and_cover_every_cycle(self):
        insured, uninsured = self.ids(pcic='insured'), self.ids(pcic='not_insured')
        self.assertFalse(insured & uninsured)
        self.assertEqual(insured | uninsured, self.ids())

    def test_it_works_together_with_search_and_the_other_filters(self):
        self.assertEqual(self.ids(pcic='insured', search='Ann'), {self.made['ann_in']})
        self.assertEqual(self.ids(pcic='not_insured', search='Ann'), {self.made['ann_out']})
        self.assertEqual(self.ids(pcic='insured', search='Ben'), set())
        self.assertEqual(self.ids(pcic='insured', fisherfolk=self.ff_none.id), {self.made['cy_in']})
        self.assertEqual(self.ids(pcic='insured', species=self.species.id, year=''), {self.made['ann_in'], self.made['cy_in']})

    def test_the_rows_say_the_same_thing_the_filter_used(self):
        r = self.client.get(STOCKING, {'status': ALL_STATUS, 'pcic': 'insured'})
        rows = r.json()['results'] if isinstance(r.json(), dict) else r.json()
        self.assertTrue(rows and all(row['has_pcic_insurance'] for row in rows))
        r = self.client.get(STOCKING, {'status': ALL_STATUS, 'pcic': 'not_insured'})
        rows = r.json()['results'] if isinstance(r.json(), dict) else r.json()
        self.assertTrue(rows and not any(row['has_pcic_insurance'] for row in rows))
