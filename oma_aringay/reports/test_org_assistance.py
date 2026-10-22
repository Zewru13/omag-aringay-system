"""Report 6: Organization Assistance - one organization or all of them, JSON / PDF / Excel."""
import io
import uuid
from datetime import date

import openpyxl
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

URL = '/api/reports/organization-assistance/'


def _org(model, name, number):
    return model.objects.create(
        name=name, barangay='Alaska', contact_person='Contact', contact_number='0917', registration_number=number,
        date_organized=date(2020, 1, 1), date_registered=date(2021, 1, 1))


class OrganizationAssistanceReportTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.citizen = User.objects.create_user(username='cit', password='pw', role='CITIZEN', email='c@x.test')
        cls.org_a = _org(FarmersOrganization, 'Alaska Farmers', 'F-1')
        cls.org_b = _org(FarmersOrganization, 'Baracbac Farmers', 'F-2')
        farmer = lambda n, r: Farmer.objects.create(
            rsbsa_number=f'01-033-02-019-{r:06d}', first_name=n, last_name='Test', gender='Female',
            birthdate=date(1985, 3, 3), barangay='Alaska', civil_status='Single')
        cls.f1, cls.f2, cls.f3 = farmer('Ana', 1001), farmer('Ben', 1002), farmer('Cora', 1003)

        def give(org, people, when, kind, agencies, quantity, statuses, **extra):
            batch = uuid.uuid4()
            made = []
            for person, status in zip(people, statuses):
                record = BeneficiaryRecord.objects.create(
                    farmer=person, assistance_type=kind, date_given=when, source_agencies=agencies, quantity=quantity,
                    distributed_by_organization=org, distribution_batch=batch, **extra)
                update = dict(status=status)
                if status == 'CONFIRMED':
                    update['confirmed_at'] = timezone.now()
                BeneficiaryRecord.objects.filter(pk=record.pk).update(**update)
                made.append(record)
            return made

        # org A: a seeds distribution to two members (one confirmed, one still awaiting) and a training one
        cls.seeds = give(cls.org_a, [cls.f1, cls.f2], date(2026, 8, 1), 'Seeds', ['DA'], '10 sacks', ['CONFIRMED', 'AWAITING_CONFIRMATION'],
                         seed_type='Hybrid rice')
        cls.training = give(cls.org_a, [cls.f1], date(2026, 9, 1), 'Training', ['ATI'], '', ['CONFIRMED'], training_duration_days=2)
        # org B: fertilizer, one member reported not received
        cls.fert = give(cls.org_b, [cls.f3], date(2026, 9, 15), 'Fertilizer', ['DA', 'PCA'], '5 bags', ['NOT_RECEIVED'])
        # assistance staff logged for one person, no organization: never in this report
        BeneficiaryRecord.objects.create(farmer=cls.f1, assistance_type='Seeds', date_given=date(2026, 7, 1))
        # a removed entry is never shown
        removed = give(cls.org_a, [cls.f3], date(2026, 9, 20), 'Seeds', ['DA'], '1 sack', ['REMOVED'])

        cls.forg = _org(FisherfolkOrganization, 'Samara Fishers', 'FF-1')
        cls.fish = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000501', first_name='Pedro', last_name='Sea', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Samara', fisherfolk_type='Aquaculture')
        rec = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=cls.fish, assistance_type='Feed', date_given=date(2026, 9, 5), source_agencies=['BFAR'], quantity='20 sacks',
            distributed_by_organization=cls.forg, distribution_batch=uuid.uuid4())
        FisherfolkBeneficiaryRecord.objects.filter(pk=rec.pk).update(status='CONFIRMED')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def get(self, **params):
        r = self.client.get(URL, params)
        self.assertEqual(r.status_code, 200, r.content[:300])
        return r.json()

    @staticmethod
    def rows(doc):
        return doc['sections'][0]['rows']

    def test_citizens_are_refused_and_bad_input_is_a_400(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(URL, {'kind': 'farmers'}).status_code, 403)
        self.client.force_authenticate(self.admin)
        for params in ({}, {'kind': 'trees'}, {'kind': 'farmers', 'date_from': 'soon'}, {'kind': 'farmers', 'status': 'maybe'},
                       {'kind': 'farmers', 'assistance_type': 'Fishing Gear'}, {'kind': 'farmers', 'id': 'abc'},
                       {'kind': 'farmers', 'date_from': '2030-01-02', 'date_to': '2030-01-01'}):
            self.assertEqual(self.client.get(URL, params).status_code, 400, params)

    def test_all_farmers_organizations_one_row_per_distribution_newest_first(self):
        doc = self.get(kind='farmers')
        self.assertEqual(doc['title'], 'Farmers Organization Assistance')
        rows = self.rows(doc)
        self.assertEqual([(r[0], r[1], r[2]) for r in rows], [
            ('Baracbac Farmers', 'Sep 15, 2026', 'Fertilizer'),
            ('Alaska Farmers', 'Sep 01, 2026', 'Training — 2 days'),
            ('Alaska Farmers', 'Aug 01, 2026', 'Seeds — Hybrid rice'),
        ])
        fert, training, seeds = rows
        self.assertEqual(fert[3:], ['DA, PCA', '5 bags', 1, 0, 'Needs follow-up'])
        self.assertEqual(training[3:], ['ATI', '—', 1, 1, 'Confirmed'])
        self.assertEqual(seeds[3:], ['DA', '10 sacks', 2, 1, 'Awaiting confirmation'])
        self.assertEqual(dict(map(tuple, doc['stats'])), {'Organizations': 2, 'Distributions': 3, 'Members Reached': 4,
                                                          'Confirmed': 2, 'Needs Follow-up': 1})

    def test_individual_and_removed_assistance_are_not_organization_assistance(self):
        total = sum(r[5] for r in self.rows(self.get(kind='farmers')))
        self.assertEqual(total, 4)   # 2 + 1 + 1: not the unattached record, not the removed one

    def test_fisherfolk_organizations(self):
        doc = self.get(kind='fisherfolk')
        self.assertEqual(doc['title'], 'Fisherfolk Organization Assistance')
        self.assertEqual([(r[0], r[2], r[4], r[7]) for r in self.rows(doc)], [('Samara Fishers', 'Feed', '20 sacks', 'Confirmed')])

    def test_filters(self):
        orgs = lambda **p: [r[0] + ' ' + r[2].split(' ')[0] for r in self.rows(self.get(kind='farmers', **p))]
        self.assertEqual(orgs(date_from='2026-09-01'), ['Baracbac Farmers Fertilizer', 'Alaska Farmers Training'])
        self.assertEqual(orgs(date_to='2026-08-31'), ['Alaska Farmers Seeds'])
        self.assertEqual(orgs(assistance_type='Training'), ['Alaska Farmers Training'])
        self.assertEqual(orgs(source_agency='PCA'), ['Baracbac Farmers Fertilizer'])
        self.assertEqual(orgs(status='follow_up'), ['Baracbac Farmers Fertilizer'])
        self.assertEqual(orgs(status='awaiting'), ['Alaska Farmers Seeds'])
        self.assertEqual(orgs(status='confirmed'), ['Alaska Farmers Training'])
        self.assertEqual(orgs(search='baracbac'), ['Baracbac Farmers Fertilizer'])
        self.assertEqual(orgs(search='zzzz'), [])

    def test_the_date_range_includes_both_ends(self):
        self.assertEqual(len(self.rows(self.get(kind='farmers', date_from='2026-09-01', date_to='2026-09-01'))), 1)

    def test_one_organization_lists_its_distributions_and_every_recipient(self):
        doc = self.get(kind='farmers', id=self.org_a.id)
        self.assertEqual(doc['title'], 'Farmers Organization Assistance Report')
        self.assertEqual(doc['subtitle'], 'Alaska Farmers')
        self.assertEqual([s['title'] for s in doc['sections']], ['Distributions', 'Recipients'])
        self.assertEqual({r[0] for r in self.rows(doc)}, {'Alaska Farmers'})
        recipients = doc['sections'][1]['rows']
        self.assertEqual([(r[0], r[1], r[3]) for r in recipients], [
            ('Ana Test', 'Training — 2 days', 'Confirmed'),
            ('Ana Test', 'Seeds — Hybrid rice', 'Confirmed'),
            ('Ben Test', 'Seeds — Hybrid rice', 'Awaiting Confirmation'),
        ])
        self.assertNotEqual(recipients[0][4], '—')    # confirmed: has a date
        self.assertEqual(recipients[2][4], '—')       # not yet confirmed
        self.assertNotIn('Organizations', dict(map(tuple, doc['stats'])))

    def test_one_organization_with_filters_and_an_unknown_id(self):
        doc = self.get(kind='farmers', id=self.org_a.id, assistance_type='Seeds')
        self.assertEqual(len(self.rows(doc)), 1)
        self.assertEqual(len(doc['sections'][1]['rows']), 2)
        self.assertIn('Assistance: Seeds', doc['subtitle'])
        self.assertEqual(self.client.get(URL, {'kind': 'farmers', 'id': 999999}).status_code, 404)
        self.assertEqual(self.client.get(URL, {'kind': 'farmers', 'id': self.forg.id + 5000}).status_code, 404)

    def test_an_empty_result_is_a_normal_document(self):
        doc = self.get(kind='farmers', search='zzzz')
        self.assertEqual(self.rows(doc), [])
        self.assertEqual(doc['stats'][0], ['Organizations', 0])
        self.assertTrue(doc['sections'][0]['empty'])

    def test_pdf_and_excel(self):
        for params in ({'kind': 'farmers'}, {'kind': 'farmers', 'id': self.org_a.id}, {'kind': 'fisherfolk'}, {'kind': 'farmers', 'search': 'zzzz'}):
            pdf = self.client.get(URL, dict(params, format='pdf', prepared_by='Clerk'))
            self.assertEqual(pdf['Content-Type'], 'application/pdf', params)
            self.assertTrue(pdf.content.startswith(b'%PDF'))
        wide = self.client.get(URL, {'kind': 'farmers', 'format': 'pdf'})
        self.assertIn(b'/MediaBox [ 0 0 792 612 ]', wide.content)      # 8 columns: landscape
        xl = self.client.get(URL, {'kind': 'farmers', 'id': self.org_a.id, 'format': 'excel'})
        ws = openpyxl.load_workbook(io.BytesIO(xl.content)).active
        cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        for expected in ('Distributions', 'Recipients', 'Ana Test', 'Seeds — Hybrid rice'):
            self.assertIn(expected, cells)
