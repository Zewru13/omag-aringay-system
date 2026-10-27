"""The registration tables' own filters (sex, farmer type, senior, ICC/IP, PWD, 4Ps, fisherfolk type, barangay) also narrow the
Registered report, so a printed report holds exactly the rows the table shows."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk

REPORT = '/api/reports/registered/'


def farmer(n, barangay='Alaska', **over):
    data = dict(rsbsa_number=f'01-033-02-019-98{n:04d}', first_name=f'Far{n}', last_name='Filter', gender='Female',
                birthdate=date(1990, 1, 1), barangay=barangay, civil_status='Single')
    data.update(over)
    return Farmer.objects.create(**data)


def fisher(n, barangay='Alaska', **over):
    data = dict(rsbsa_number=f'01-033-02-019-97{n:04d}', first_name=f'Fish{n}', last_name='Filter', gender='Male',
                birthdate=date(1990, 1, 1), barangay=barangay, fisherfolk_type='Aquaculture')
    data.update(over)
    return Fisherfolk.objects.create(**data)


class RegisteredReportFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='rf-admin', password='pw', role='ADMIN', email='rf@x.test')
        cls.base = farmer(1)
        cls.male = farmer(2, gender='Male')
        cls.senior = farmer(3, birthdate=date(1950, 5, 5))
        cls.pwd = farmer(4, is_pwd=True)
        cls.icc = farmer(5, is_icc_ip_member=True)
        cls.laborer = farmer(6, is_farm_laborer=True)
        cls.baracbac = farmer(7, barangay='Baracbac')
        cls.fbase = fisher(1)
        cls.ffemale = fisher(2, gender='Female')
        cls.fcapture = fisher(3, fisherfolk_type='Capture')
        cls.fsenior = fisher(4, birthdate=date(1950, 5, 5))
        cls.fpwd = fisher(5, is_pwd=True)
        cls.f4ps = fisher(6, is_4ps_beneficiary=True)
        cls.fbaracbac = fisher(7, barangay='Baracbac')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def names(self, kind, **params):
        r = self.client.get(REPORT, {'kind': kind, 'format': 'json', **params})
        self.assertEqual(r.status_code, 200, r.content)
        doc = r.json()
        return {row[1] for row in doc['sections'][0]['rows']}, doc['subtitle']

    # ── farmers ──────────────────────────────────────────────────────────────

    def test_farmers_by_sex(self):
        names, subtitle = self.names('farmers', gender='Male')
        self.assertEqual(names, {'Far2 Filter'})
        self.assertIn('Male', subtitle)

    def test_farmers_by_type(self):
        names, subtitle = self.names('farmers', is_farm_laborer='true')
        self.assertEqual(names, {'Far6 Filter'})
        self.assertIn('Farm Laborer', subtitle)
        names, subtitle = self.names('farmers', is_farm_laborer='false')
        self.assertNotIn('Far6 Filter', names)
        self.assertIn('Far1 Filter', names)
        self.assertIn('Farm Operator', subtitle)

    def test_farmers_senior_pwd_and_icc(self):
        self.assertEqual(self.names('farmers', is_senior='true')[0], {'Far3 Filter'})
        self.assertEqual(self.names('farmers', is_pwd='true')[0], {'Far4 Filter'})
        self.assertEqual(self.names('farmers', is_icc_ip='true')[0], {'Far5 Filter'})
        self.assertIn('Senior citizens', self.names('farmers', is_senior='true')[1])
        self.assertIn('PWD', self.names('farmers', is_pwd='true')[1])
        self.assertIn('ICC/IP', self.names('farmers', is_icc_ip='true')[1])

    def test_filters_combine(self):
        names, subtitle = self.names('farmers', gender='Female', barangay='Baracbac')
        self.assertEqual(names, {'Far7 Filter'})
        self.assertIn('Barangay: Baracbac', subtitle)
        self.assertIn('Female', subtitle)

    # ── fisherfolk ───────────────────────────────────────────────────────────

    def test_fisherfolk_by_sex_and_type(self):
        names, subtitle = self.names('fisherfolk', gender='Female')
        self.assertEqual(names, {'Fish2 Filter'})
        names, subtitle = self.names('fisherfolk', fisherfolk_type='Capture')
        self.assertEqual(names, {'Fish3 Filter'})
        self.assertIn('Capture', subtitle)

    def test_fisherfolk_senior_pwd_and_4ps(self):
        self.assertEqual(self.names('fisherfolk', is_senior='true')[0], {'Fish4 Filter'})
        self.assertEqual(self.names('fisherfolk', is_pwd='true')[0], {'Fish5 Filter'})
        names, subtitle = self.names('fisherfolk', is_4ps='true')
        self.assertEqual(names, {'Fish6 Filter'})
        self.assertIn('4Ps', subtitle)

    def test_a_filter_that_does_not_apply_to_the_kind_is_ignored(self):
        # ICC/IP is a farmer field; the fisherfolk table has no such filter, so the report ignores it rather than emptying the list
        names, _ = self.names('fisherfolk', is_icc_ip='true')
        self.assertEqual(len(names), 7)

    # ── the tables ───────────────────────────────────────────────────────────

    def test_the_farmer_table_filters_by_barangay(self):
        r = self.client.get('/api/farmers/', {'barangay': 'Baracbac'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({row['full_name'] for row in r.json()['results']}, {'Far7 Filter'})

    def test_the_fisherfolk_table_filters_by_barangay(self):
        r = self.client.get('/api/fisheries/fisherfolk/', {'barangay': 'Baracbac'})
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual({row['full_name'] for row in r.json()['results']}, {'Fish7 Filter'})

    def test_the_organization_tables_filter_by_barangay(self):
        for model, path in ((FarmersOrganization, 'farmers'), (FisherfolkOrganization, 'fisherfolk')):
            for number, barangay in (('A', 'Alaska'), ('B', 'Baracbac')):
                model.objects.create(name=f'{path} {barangay} Org', barangay=barangay, contact_person='C', contact_number='0917',
                                     registration_number=f'REG-{path[:2]}-{number}', date_organized=date(2020, 1, 1), date_registered=date(2021, 1, 1))
            r = self.client.get(f'/api/organizations/{path}/', {'barangay': 'Baracbac'})
            self.assertEqual(r.status_code, 200, r.content)
            self.assertEqual({row['name'] for row in r.json()['results']}, {f'{path} Baracbac Org'}, path)
