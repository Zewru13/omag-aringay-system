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
        # assistance given straight to a farmer (no organization): Dina is in no organization, Ana is a member of org A but this one was not through it
        cls.f4 = farmer('Dina', 1004)
        direct = BeneficiaryRecord.objects.create(
            farmer=cls.f4, assistance_type='Fertilizer', fertilizer_type='Urea', date_given=date(2026, 8, 10), source_agencies=['DA'], quantity='3 bags')
        BeneficiaryRecord.objects.filter(pk=direct.pk).update(status='CONFIRMED', confirmed_at=timezone.now())
        gone = BeneficiaryRecord.objects.create(farmer=cls.f2, assistance_type='Seeds', date_given=date(2026, 8, 11), quantity='9 sacks')
        BeneficiaryRecord.objects.filter(pk=gone.pk).update(status='REMOVED')

        cls.forg = _org(FisherfolkOrganization, 'Samara Fishers', 'FF-1')
        cls.fish = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000501', first_name='Pedro', last_name='Sea', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Samara', fisherfolk_type='Aquaculture')
        rec = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=cls.fish, assistance_type='Feed', date_given=date(2026, 9, 5), source_agencies=['BFAR'], quantity='20 sacks',
            distributed_by_organization=cls.forg, distribution_batch=uuid.uuid4())
        FisherfolkBeneficiaryRecord.objects.filter(pk=rec.pk).update(status='CONFIRMED')
        # fisherfolk assistance given straight to people: Maria is in no organization, Pedro is a member of Samara Fishers but this was not through it
        cls.fish2 = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000502', first_name='Maria', last_name='Reef', gender='Female', birthdate=date(1990, 5, 5),
            barangay='Dulao', fisherfolk_type='Aquaculture')
        gear = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=cls.fish2, assistance_type='Fishing Gear', item_type='Nets', date_given=date(2026, 9, 10), source_agencies=['BFAR'], quantity='2 sets')
        FisherfolkBeneficiaryRecord.objects.filter(pk=gear.pk).update(status='CONFIRMED', confirmed_at=timezone.now())
        cash = FisherfolkBeneficiaryRecord.objects.create(
            fisherfolk=cls.fish, assistance_type='Cash Assistance', date_given=date(2026, 9, 12), source_agencies=['LGU'], quantity='5000')
        FisherfolkBeneficiaryRecord.objects.filter(pk=cash.pk).update(status='NOT_RECEIVED')

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
        self.assertEqual(doc['title'], 'Farmers Cooperative Assistance')
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
        self.assertEqual(dict(map(tuple, doc['stats'])), {'Cooperatives': 2, 'Distributions': 3, 'Members Reached': 3,
                                                          'Confirmed': 2, 'Needs Follow-up': 1})

    def test_individual_and_removed_assistance_are_not_organization_assistance(self):
        total = sum(r[5] for r in self.rows(self.get(kind='farmers')))
        self.assertEqual(total, 4)   # 2 + 1 + 1: not the unattached record, not the removed one

    def test_fisherfolk_organizations(self):
        doc = self.get(kind='fisherfolk')
        self.assertEqual(doc['title'], 'Fisherfolk Cooperative Assistance')
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
        self.assertEqual(doc['title'], 'Farmers Cooperative Assistance Report')
        self.assertEqual(doc['subtitle'], 'Alaska Farmers')
        self.assertEqual([s['title'] for s in doc['sections']], ['Distributions', 'Recipients'])
        self.assertEqual({r[0] for r in self.rows(doc)}, {'Alaska Farmers'})
        recipients = doc['sections'][1]['rows']
        self.assertEqual([(r[0], r[1], r[4], r[8]) for r in recipients], [
            ('Alaska Farmers', 'Ana Test', 'Training — 2 days', 'Confirmed'),
            ('Alaska Farmers', 'Ana Test', 'Seeds — Hybrid rice', 'Confirmed'),
            ('Alaska Farmers', 'Ben Test', 'Seeds — Hybrid rice', 'Awaiting Confirmation'),
        ])
        self.assertNotEqual(recipients[0][9], '—')    # confirmed: has a date
        self.assertEqual(recipients[2][9], '—')       # not yet confirmed
        self.assertNotIn('Cooperatives', dict(map(tuple, doc['stats'])))

    # ---- recipients: the people who actually received the assistance, by name -------------------------------------------------------

    RECIPIENT_HEADERS = ['Cooperative', 'Recipient', 'Recipient Type', 'Barangay', 'Assistance', 'Source Agency', 'Date Given',
                         'Quantity', 'Status', 'Date Confirmed']
    PERSON_HEADERS = ['Recipient', 'Recipient Type', 'Barangay', 'Assistance', 'Source Agency', 'Date Given', 'Quantity', 'Status', 'Date Confirmed']

    def test_the_all_organizations_report_names_every_recipient(self):
        doc = self.get(kind='farmers')
        self.assertEqual([s['title'] for s in doc['sections']], ['Distributions', 'Recipients'])
        section = doc['sections'][1]
        self.assertEqual(section['headers'], self.RECIPIENT_HEADERS)
        self.assertEqual([r[:9] for r in section['rows']], [
            ['Baracbac Farmers', 'Cora Test', 'Farmer', 'Alaska', 'Fertilizer', 'DA, PCA', 'Sep 15, 2026', '5 bags', 'Not Received'],
            ['Alaska Farmers', 'Ana Test', 'Farmer', 'Alaska', 'Training — 2 days', 'ATI', 'Sep 01, 2026', '—', 'Confirmed'],
            ['Alaska Farmers', 'Ana Test', 'Farmer', 'Alaska', 'Seeds — Hybrid rice', 'DA', 'Aug 01, 2026', '10 sacks', 'Confirmed'],
            ['Alaska Farmers', 'Ben Test', 'Farmer', 'Alaska', 'Seeds — Hybrid rice', 'DA', 'Aug 01, 2026', '10 sacks', 'Awaiting Confirmation'],
        ])
        keys = [tuple(r[:9]) for r in section['rows']]
        self.assertEqual(len(keys), len(set(keys)), 'no recipient row is listed twice')
        names = {r[1] for r in section['rows']}
        self.assertNotIn('Dina Test', names)   # assistance given directly is not organization assistance

    def test_fisherfolk_organizations_name_their_recipients(self):
        doc = self.get(kind='fisherfolk')
        rows = doc['sections'][1]['rows']
        self.assertEqual([r[:9] for r in rows], [
            ['Samara Fishers', 'Pedro Sea', 'Fisherfolk', 'Samara', 'Feed', 'BFAR', 'Sep 05, 2026', '20 sacks', 'Confirmed']])
        self.assertEqual(dict(map(tuple, doc['stats']))['Members Reached'], 1)

    def test_recipients_follow_the_filters(self):
        doc = self.get(kind='farmers', status='follow_up')
        self.assertEqual([r[1] for r in doc['sections'][1]['rows']], ['Cora Test'])
        doc = self.get(kind='farmers', assistance_type='Seeds')
        self.assertEqual([r[1] for r in doc['sections'][1]['rows']], ['Ana Test', 'Ben Test'])
        self.assertEqual(self.get(kind='farmers', search='zzzz')['sections'][1]['rows'], [])

    # ---- individual farmers and fisherfolk: assistance given directly, not through an organization -------------------------------

    def test_individual_farmers_are_only_what_was_given_directly(self):
        doc = self.get(kind='individual_farmers')
        self.assertEqual(doc['title'], 'Individual Farmers Assistance')
        self.assertEqual([s['title'] for s in doc['sections']], ['Recipients'])
        section = doc['sections'][0]
        self.assertEqual(section['headers'], self.PERSON_HEADERS)
        self.assertEqual([r[:8] for r in section['rows']], [
            ['Dina Test', 'Farmer', 'Alaska', 'Fertilizer — Urea', 'DA', 'Aug 10, 2026', '3 bags', 'Confirmed'],
            ['Ana Test', 'Farmer', 'Alaska', 'Seeds', '—', 'Jul 01, 2026', '—', 'Awaiting Confirmation'],
        ])
        self.assertNotEqual(section['rows'][0][8], '—')     # confirmed: has a date
        self.assertEqual(section['rows'][1][8], '—')
        self.assertEqual(dict(map(tuple, doc['stats'])), {'Recipients': 2, 'Assistance Records': 2, 'Confirmed': 1, 'Needs Follow-up': 0})
        self.assertNotIn('row_refs', doc)                    # there is no organization to open

    def test_an_organization_member_is_listed_only_for_what_was_not_through_the_organization(self):
        rows = self.get(kind='individual_farmers')['sections'][0]['rows']
        self.assertEqual([r[3] for r in rows if r[0] == 'Ana Test'], ['Seeds'])    # not her two organization distributions
        org_rows = self.get(kind='farmers')['sections'][1]['rows']
        self.assertEqual(len([r for r in org_rows if r[1] == 'Ana Test']), 2)       # and those two are not in the organization report twice

    def test_individual_fisherfolk(self):
        doc = self.get(kind='individual_fisherfolk')
        self.assertEqual(doc['title'], 'Individual Fisherfolk Assistance')
        rows = doc['sections'][0]['rows']
        self.assertEqual([r[:8] for r in rows], [
            ['Pedro Sea', 'Fisherfolk', 'Samara', 'Cash Assistance', 'LGU', 'Sep 12, 2026', '5000', 'Not Received'],
            ['Maria Reef', 'Fisherfolk', 'Dulao', 'Fishing Gear — Nets', 'BFAR', 'Sep 10, 2026', '2 sets', 'Confirmed'],
        ])
        self.assertEqual(dict(map(tuple, doc['stats'])), {'Recipients': 2, 'Assistance Records': 2, 'Confirmed': 1, 'Needs Follow-up': 1})

    def test_individual_filters_and_search(self):
        names = lambda kind='individual_farmers', **p: [r[0] for r in self.get(kind=kind, **p)['sections'][0]['rows']]
        self.assertEqual(names(date_from='2026-08-01'), ['Dina Test'])
        self.assertEqual(names(date_to='2026-07-31'), ['Ana Test'])
        self.assertEqual(names(assistance_type='Seeds'), ['Ana Test'])
        self.assertEqual(names(source_agency='DA'), ['Dina Test'])
        self.assertEqual(names(status='confirmed'), ['Dina Test'])
        self.assertEqual(names(status='awaiting'), ['Ana Test'])
        self.assertEqual(names(status='follow_up'), [])
        self.assertEqual(names(search='dina'), ['Dina Test'])
        self.assertEqual(names(search='test ana'), ['Ana Test'])
        self.assertEqual(names(search='zzzz'), [])
        self.assertEqual(names('individual_fisherfolk', status='follow_up'), ['Pedro Sea'])
        self.assertEqual(names('individual_fisherfolk', search='reef'), ['Maria Reef'])
        subtitle = self.get(kind='individual_farmers', assistance_type='Seeds', search='ana')['subtitle']
        self.assertIn('Assistance: Seeds', subtitle)

    def test_individual_reports_refuse_what_the_kind_cannot_give(self):
        for params in ({'kind': 'individual_farmers', 'assistance_type': 'Fishing Gear'},
                       {'kind': 'individual_fisherfolk', 'assistance_type': 'Seeds'},
                       {'kind': 'individual_farmers', 'status': 'maybe'}):
            self.assertEqual(self.client.get(URL, params).status_code, 400, params)

    def test_an_individual_report_ignores_an_organization_id(self):
        self.assertEqual(self.get(kind='individual_farmers', id=self.org_a.id)['title'], 'Individual Farmers Assistance')

    def test_individual_pdf_and_excel_carry_the_names(self):
        for kind in ('individual_farmers', 'individual_fisherfolk'):
            pdf = self.client.get(URL, {'kind': kind, 'format': 'pdf', 'prepared_by': 'Clerk'})
            self.assertEqual(pdf['Content-Type'], 'application/pdf', kind)
            self.assertTrue(pdf.content.startswith(b'%PDF'))
        xl = self.client.get(URL, {'kind': 'individual_farmers', 'format': 'excel'})
        ws = openpyxl.load_workbook(io.BytesIO(xl.content)).active
        cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        for expected in ('Recipients', 'Dina Test', 'Ana Test', 'Fertilizer — Urea', 'Recipient Type', 'Barangay'):
            self.assertIn(expected, cells)
        # the organization report's Excel names its recipients too
        xl = self.client.get(URL, {'kind': 'farmers', 'format': 'excel'})
        ws = openpyxl.load_workbook(io.BytesIO(xl.content)).active
        cells = [str(c) for row in ws.iter_rows(values_only=True) for c in row if c is not None]
        for expected in ('Recipients', 'Cora Test', 'Ben Test', 'Alaska Farmers'):
            self.assertIn(expected, cells)

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
        self.assertEqual(doc['stats'][0], ['Cooperatives', 0])
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
