"""The Registered and Organization Assistance reports without a 'one record' switch: the list carries an id and name per row (so a clicked
row can ask for that one record), and `individual=auto` turns a search that leaves exactly one record into that record's individual report."""
import io
import uuid
from datetime import date

from django.contrib.auth import get_user_model
from pypdf import PdfReader
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord

REGISTERED = '/api/reports/registered/'
ASSISTANCE = '/api/reports/organization-assistance/'


def _farmer(rsbsa, first, last, barangay='Alaska'):
    return Farmer.objects.create(rsbsa_number=rsbsa, first_name=first, last_name=last, gender='Female', birthdate=date(1985, 3, 3),
                                 barangay=barangay, civil_status='Single')


def _org(model, name, number, barangay='Alaska'):
    return model.objects.create(name=name, barangay=barangay, contact_person='Contact', contact_number='0917', registration_number=number,
                                date_organized=date(2020, 1, 1), date_registered=date(2021, 2, 2))


def pdf_text(response):
    return '\n'.join(page.extract_text() for page in PdfReader(io.BytesIO(response.content)).pages)


class RegisteredIndividualTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ind-adm', password='pw', role='ADMIN', email='ia@x.test')
        cls.maria = _farmer('01-033-02-019-000151', 'Maria', 'Santos')
        cls.jose = _farmer('01-033-02-019-000152', 'Jose', 'Reyes', barangay='Baracbac')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000201', first_name='Pedro', last_name='Cruz', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Alaska', fisherfolk_type='Aquaculture')
        cls.org = _org(FarmersOrganization, 'Alaska Farmers Org', 'ORG-1')
        cls.org2 = _org(FarmersOrganization, 'Baracbac Farmers Org', 'ORG-2', barangay='Baracbac')
        cls.forg = _org(FisherfolkOrganization, 'Samara Fishers', 'FORG-1')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, **params):
        res = self.client.get(REGISTERED, {'format': 'json', **params})
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()

    # --- the list says which record each row is
    def test_each_list_row_carries_the_id_and_name_of_its_record(self):
        for kind, name_column in (('farmers', 1), ('fisherfolk', 1), ('farmers_orgs', 0), ('fisherfolk_orgs', 0)):
            doc = self.get(kind=kind)
            rows = doc['sections'][0]['rows']
            refs = doc['row_refs']
            self.assertEqual(len(refs), len(rows), kind)
            self.assertEqual([r['label'] for r in refs], [row[name_column] for row in rows], kind)
        self.assertEqual({r['id'] for r in self.get(kind='farmers')['row_refs']}, {self.maria.id, self.jose.id})
        self.assertEqual({r['id'] for r in self.get(kind='farmers_orgs')['row_refs']}, {self.org.id, self.org2.id})

    def test_an_individual_report_has_no_row_refs(self):
        doc = self.get(kind='farmers', id=self.maria.id)
        self.assertNotIn('row_refs', doc)
        self.assertNotIn('individual', doc)

    # --- individual=auto
    def test_a_search_that_leaves_one_record_becomes_that_records_individual_report(self):
        doc = self.get(kind='farmers', search='Santos', individual='auto')
        self.assertEqual(doc['sections'][0]['title'], 'Farmer Details')
        self.assertEqual(doc['individual'], {'id': self.maria.id, 'label': 'Maria Santos'})
        self.assertNotIn('row_refs', doc)

    def test_it_works_for_fisherfolk_and_both_kinds_of_organization(self):
        self.assertEqual(self.get(kind='fisherfolk', search='Cruz', individual='auto')['individual']['id'], self.fisher.id)
        doc = self.get(kind='farmers_orgs', search='Alaska Farmers', individual='auto')
        self.assertEqual(doc['individual'], {'id': self.org.id, 'label': 'Alaska Farmers Org'})
        self.assertEqual(doc['sections'][0]['title'], 'Organization Details')
        self.assertEqual(self.get(kind='fisherfolk_orgs', search='Samara', individual='auto')['individual']['id'], self.forg.id)

    def test_a_search_with_several_matches_stays_the_list(self):
        doc = self.get(kind='farmers', search='01-033-02-019-0001', individual='auto')
        self.assertEqual(doc['sections'][0]['title'], 'Farmers')
        self.assertNotIn('individual', doc)
        self.assertEqual(len(doc['row_refs']), 2)

    def test_no_search_never_switches_even_when_only_one_record_matches(self):
        doc = self.get(kind='farmers', barangay='Baracbac', individual='auto')
        self.assertEqual(doc['sections'][0]['title'], 'Farmers')
        self.assertEqual(len(doc['sections'][0]['rows']), 1)
        self.assertNotIn('individual', doc)
        self.assertNotIn('individual', self.get(kind='farmers', search='   ', barangay='Baracbac', individual='auto'))

    def test_a_search_with_no_match_is_the_empty_list(self):
        doc = self.get(kind='farmers', search='Nobody', individual='auto')
        self.assertEqual(doc['sections'][0]['rows'], [])
        self.assertNotIn('individual', doc)

    def test_the_other_filters_still_apply_before_the_one_record_is_found(self):
        doc = self.get(kind='farmers', search='Santos', barangay='Baracbac', individual='auto')
        self.assertEqual(doc['sections'][0]['rows'], [])
        self.assertNotIn('individual', doc)

    def test_without_individual_auto_a_one_match_search_stays_the_list(self):
        doc = self.get(kind='farmers', search='Santos')
        self.assertEqual(doc['sections'][0]['title'], 'Farmers')
        self.assertNotIn('individual', doc)

    def test_the_pdf_of_a_one_match_search_is_the_individual_report(self):
        res = self.client.get(REGISTERED, {'format': 'pdf', 'kind': 'farmers', 'search': 'Santos', 'individual': 'auto'})
        self.assertEqual(res.status_code, 200)
        text = pdf_text(res).upper()
        self.assertIn('FARMER DETAILS', text)
        self.assertIn('MARIA SANTOS', text)

    def test_an_explicit_id_wins_over_the_search(self):
        doc = self.get(kind='farmers', id=self.jose.id, search='Santos', individual='auto')
        self.assertEqual(doc['sections'][0]['title'], 'Farmer Details')
        self.assertIn('Jose Reyes', str(doc['sections'][0]['pairs']))


class AssistanceIndividualTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ia-adm', password='pw', role='ADMIN', email='iaa@x.test')
        cls.org_a = _org(FarmersOrganization, 'Alaska Farmers', 'F-1')
        cls.org_b = _org(FarmersOrganization, 'Baracbac Farmers', 'F-2', barangay='Baracbac')
        cls.f1 = _farmer('01-033-02-019-001001', 'Ana', 'Test')
        cls.f2 = _farmer('01-033-02-019-001002', 'Ben', 'Test')
        for org, person, when, kind in ((cls.org_a, cls.f1, date(2026, 8, 1), 'Seeds'), (cls.org_a, cls.f1, date(2026, 9, 1), 'Training'),
                                         (cls.org_b, cls.f2, date(2026, 9, 15), 'Fertilizer')):
            BeneficiaryRecord.objects.create(farmer=person, assistance_type=kind, date_given=when, source_agencies=['DA'], quantity='1',
                                             distributed_by_organization=org, distribution_batch=uuid.uuid4())

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, **params):
        res = self.client.get(ASSISTANCE, {'format': 'json', 'kind': 'farmers', **params})
        self.assertEqual(res.status_code, 200, res.content[:300])
        return res.json()

    def test_each_distribution_row_carries_the_id_and_name_of_its_organization(self):
        doc = self.get()
        rows, refs = doc['sections'][0]['rows'], doc['row_refs']
        self.assertEqual(len(refs), len(rows))
        self.assertEqual([r['label'] for r in refs], [row[0] for row in rows])
        self.assertEqual([r['id'] for r in refs].count(self.org_a.id), 2)
        self.assertEqual([r['id'] for r in refs].count(self.org_b.id), 1)

    def test_an_organizations_own_report_has_no_row_refs(self):
        doc = self.get(id=self.org_a.id)
        self.assertNotIn('row_refs', doc)
        self.assertNotIn('individual', doc)

    def test_a_search_that_leaves_one_organization_becomes_its_individual_report(self):
        doc = self.get(search='Alaska', individual='auto')
        self.assertEqual(doc['individual'], {'id': self.org_a.id, 'label': 'Alaska Farmers'})
        self.assertEqual([s['title'] for s in doc['sections']], ['Distributions', 'Recipients'])
        self.assertEqual(len(doc['sections'][0]['rows']), 2)
        self.assertNotIn('row_refs', doc)

    def test_a_search_that_matches_two_organizations_stays_the_list(self):
        doc = self.get(search='Farmers', individual='auto')
        self.assertNotIn('individual', doc)
        self.assertEqual([s['title'] for s in doc['sections']], ['Distributions'])

    def test_no_search_never_switches_even_when_only_one_organization_has_distributions(self):
        doc = self.get(date_from='2026-09-10', individual='auto')   # only Baracbac Farmers is left
        self.assertEqual(len({r['id'] for r in doc['row_refs']}), 1)
        self.assertNotIn('individual', doc)

    def test_a_search_with_no_match_is_the_empty_list(self):
        doc = self.get(search='Nowhere', individual='auto')
        self.assertEqual(doc['sections'][0]['rows'], [])
        self.assertNotIn('individual', doc)

    def test_the_pdf_of_a_one_match_search_is_that_organizations_report(self):
        res = self.client.get(ASSISTANCE, {'format': 'pdf', 'kind': 'farmers', 'search': 'Alaska', 'individual': 'auto'})
        self.assertEqual(res.status_code, 200)
        self.assertIn('RECIPIENTS', pdf_text(res).upper())
