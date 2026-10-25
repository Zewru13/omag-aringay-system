"""The PCIC insured filter of the crop tables: ?pcic=insured / not_insured on the Crop Monitoring list and its groups, and on the
Crop Records parcel list (a parcel is listed, and its crops counted, only for the crops that match)."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from production.models import CropType

from .test_crop_record_duplicates import make_farmer, make_record

LIST = '/api/production/monitoring/'
GROUPS = '/api/production/monitoring/groups/'
DIRECTORY = '/api/farmers/parcels/directory/'
DIRECTORY_GROUPS = '/api/farmers/parcels/directory/groups/'


class PcicFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='pf-admin', password='pw', role='ADMIN', email='pf@x.test')
        cls.rice = CropType.objects.create(name='Pcic Rice', days_to_harvest=110)
        cls.corn = CropType.objects.create(name='Pcic Corn', days_to_harvest=90)
        cls.ana, cls.ben = make_farmer('Ana'), make_farmer('Ben')
        cls.p1 = FarmParcel.objects.create(farmer=cls.ana, area_hectares='5.00', land_ownership='Owner', barangay='Alaska')   # insured and not
        cls.p2 = FarmParcel.objects.create(farmer=cls.ben, area_hectares='5.00', land_ownership='Owner', barangay='Basca')    # only insured
        cls.p3 = FarmParcel.objects.create(farmer=cls.ben, area_hectares='5.00', land_ownership='Owner', barangay='Basca')    # only not insured
        cls.p4 = FarmParcel.objects.create(farmer=cls.ben, area_hectares='5.00', land_ownership='Owner', barangay='Basca')    # no crop
        cls.a_in = make_record(cls.ana, cls.rice, cls.p1, area_planted_ha='1.00', has_pcic_insurance=True)
        cls.a_out = make_record(cls.ana, cls.corn, cls.p1, area_planted_ha='1.00')
        cls.b_in = make_record(cls.ben, cls.rice, cls.p2, area_planted_ha='1.00', has_pcic_insurance=True)
        cls.b_out = make_record(cls.ben, cls.corn, cls.p3, area_planted_ha='1.00')
        cls.lost = make_record(cls.ben, cls.rice, cls.p3, area_planted_ha='1.00', variety_used='lost', has_pcic_insurance=True, status='Total Loss')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def ids(self, url, **params):
        r = self.client.get(url, params)
        self.assertEqual(r.status_code, 200, r.content)
        data = r.json()
        return {x['id'] for x in (data['results'] if isinstance(data, dict) else data)}

    def test_the_crop_list_can_show_only_insured_or_only_uninsured_crops(self):
        self.assertEqual(self.ids(LIST), {self.a_in.id, self.a_out.id, self.b_in.id, self.b_out.id})
        self.assertEqual(self.ids(LIST, pcic='insured'), {self.a_in.id, self.b_in.id})
        self.assertEqual(self.ids(LIST, pcic='not_insured'), {self.a_out.id, self.b_out.id})
        self.assertEqual(self.ids(LIST, pcic=''), self.ids(LIST))
        self.assertEqual(self.ids(LIST, pcic='anything'), self.ids(LIST))

    def test_the_pcic_filter_combines_with_the_other_filters(self):
        self.assertEqual(self.ids(LIST, pcic='insured', farm_parcel=self.p1.id), {self.a_in.id})
        self.assertEqual(self.ids(LIST, pcic='insured', crop_type=self.corn.id), set())
        self.assertEqual(self.ids(LIST, pcic='not_insured', farmer=self.ben.id), {self.b_out.id})
        self.assertEqual(self.ids(LIST, pcic='insured', search='Ana'), {self.a_in.id})

    def test_the_grouped_crop_monitoring_counts_only_the_matching_crops(self):
        r = self.client.get(GROUPS, {'group_by': 'farmer', 'pcic': 'insured'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([g['count'] for g in r.json()['results']], [1, 1])     # one insured crop each for Ana and Ben
        r = self.client.get(GROUPS, {'group_by': 'farmer', 'pcic': 'not_insured'})
        self.assertEqual(sum(g['count'] for g in r.json()['results']), 2)

    def test_the_parcel_list_keeps_only_parcels_with_such_a_crop_and_counts_those_crops(self):
        rows = {r['id']: r for r in self.client.get(DIRECTORY).json()['results']}
        self.assertEqual({p: rows[p]['crop_count'] for p in rows}, {self.p1.id: 2, self.p2.id: 1, self.p3.id: 1, self.p4.id: 0})
        rows = {r['id']: r['crop_count'] for r in self.client.get(DIRECTORY, {'pcic': 'insured'}).json()['results']}
        self.assertEqual(rows, {self.p1.id: 1, self.p2.id: 1})          # the Total Loss crop is never counted
        rows = {r['id']: r['crop_count'] for r in self.client.get(DIRECTORY, {'pcic': 'not_insured'}).json()['results']}
        self.assertEqual(rows, {self.p1.id: 1, self.p3.id: 1})
        self.assertEqual(self.client.get(DIRECTORY, {'pcic': 'insured'}).json()['count'], 2)

    def test_the_grouped_parcel_list_follows_the_pcic_filter_too(self):
        r = self.client.get(DIRECTORY_GROUPS, {'group_by': 'barangay', 'pcic': 'insured'})
        self.assertEqual(r.status_code, 200, r.content)
        groups = {g['name']: (g['parcels'], g['crops']) for g in r.json()['results']}
        self.assertEqual(groups, {'Alaska': (1, 1), 'Basca': (1, 1)})
