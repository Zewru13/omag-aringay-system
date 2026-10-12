"""User Management filters: staff by status, fisherfolk by type, farmers by laborer/operator, organizations by kind."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer
from fisheries.models import Fisherfolk

User = get_user_model()
URL = '/api/accounts/users/'
_N = itertools.count(1)
ORG = dict(barangay='Alaska', registration_agency='SEC', contact_person='Pat', contact_number='09170000000',
           date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))


def staff(name, role='EVALUATOR', active=True, verified=True):
    return User.objects.create_user(username=f'{name}@x.test', email=f'{name}@x.test', password='pw', role=role, is_active=active,
                                    is_email_verified=verified, full_name=name)


def citizen(name, record_type, record_id):
    user = User.objects.create_user(username=name, password='pw', role='CITIZEN', is_active=True, full_name=name)
    User.objects.filter(pk=user.pk).update(email=None)       # citizen accounts have no e-mail (the column is unique, blank is not)
    UserLinkedRecord.objects.create(user=user, record_type=record_type, record_id=record_id, is_active=True)
    return user


def farmer(laborer):
    n = next(_N)
    return Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (900000 + n), first_name='F', last_name=f'N{n}', gender='Male',
                                 birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single', is_farm_laborer=laborer)


def fisher(kind):
    n = next(_N)
    return Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (890000 + n), first_name='S', last_name=f'N{n}', gender='Male',
                                     birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type=kind)


class UserListFilterTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = staff('boss', 'ADMIN')
        cls.active = staff('active-eval')
        cls.deactivated = staff('gone-eval', active=False, verified=True)
        cls.unverified = staff('new-eval', active=False, verified=False)

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def names(self, **params):
        data = self.client.get(URL, {'page_size': 100, **params}).json()
        rows = data['results'] if isinstance(data, dict) else data
        return {r['full_name'] for r in rows}

    # ── staff status ─────────────────────────────────────────────────────
    def test_staff_status_filter(self):
        self.assertEqual(self.names(role='EVALUATOR', status='active'), {'active-eval'})
        self.assertEqual(self.names(role='EVALUATOR', status='deactivated'), {'gone-eval'})
        self.assertEqual(self.names(role='EVALUATOR', status='unverified'), {'new-eval'})
        self.assertEqual(self.names(role='EVALUATOR', status='all'), {'active-eval', 'gone-eval', 'new-eval'})

    def test_staff_status_applies_to_the_default_staff_list_too(self):
        everyone = self.names(status='all')
        self.assertTrue({'boss', 'active-eval', 'gone-eval', 'new-eval'} <= everyone)
        self.assertEqual(self.names(status='active') & {'boss', 'active-eval', 'gone-eval', 'new-eval'}, {'boss', 'active-eval'})

    def test_no_status_means_no_status_filter(self):
        self.assertTrue({'active-eval', 'gone-eval', 'new-eval'} <= self.names(role='EVALUATOR'))

    # ── citizen kinds ────────────────────────────────────────────────────
    def test_fisherfolk_type_filter(self):
        citizen('aqua-person', 'FISHERFOLK', fisher('Aquaculture').id)
        citizen('capture-person', 'FISHERFOLK', fisher('Capture').id)
        self.assertEqual(self.names(role='FISHERFOLK', fisherfolk_type='Aquaculture'), {'aqua-person'})
        self.assertEqual(self.names(role='FISHERFOLK', fisherfolk_type='Capture'), {'capture-person'})
        self.assertEqual(self.names(role='FISHERFOLK'), {'aqua-person', 'capture-person'})

    def test_farmer_type_filter(self):
        citizen('worker-farmer', 'FARMER', farmer(True).id)
        citizen('operator-farmer', 'FARMER', farmer(False).id)
        self.assertEqual(self.names(role='FARMER', farmer_type='laborer'), {'worker-farmer'})
        self.assertEqual(self.names(role='FARMER', farmer_type='operator'), {'operator-farmer'})
        self.assertEqual(self.names(role='FARMER'), {'worker-farmer', 'operator-farmer'})

    def test_organization_kind_filter(self):
        f_org = FarmersOrganization.objects.create(name='Farm Co', registration_number='UF-1', **ORG)
        s_org = FisherfolkOrganization.objects.create(name='Fish Co', registration_number='UF-2', **ORG)
        citizen('farm-co', 'FARMERS_ORG', f_org.id)
        citizen('fish-co', 'FISHERFOLK_ORG', s_org.id)
        self.assertEqual(self.names(role='ORGANIZATION', organization_type='farmers'), {'farm-co'})
        self.assertEqual(self.names(role='ORGANIZATION', organization_type='fisherfolk'), {'fish-co'})
        self.assertEqual(self.names(role='ORGANIZATION'), {'farm-co', 'fish-co'})

    def test_a_type_filter_does_not_leak_into_another_group(self):
        citizen('only-fisher', 'FISHERFOLK', fisher('Aquaculture').id)
        self.assertEqual(self.names(role='FARMER', farmer_type='laborer'), set())

    # ── speed ────────────────────────────────────────────────────────────
    def test_the_list_costs_a_fixed_number_of_queries(self):
        def queries():
            with CaptureQueriesContext(connection) as ctx:
                self.assertEqual(self.client.get(URL, {'role': 'FARMER'}).status_code, 200)
            return len(ctx)
        for _ in range(2):
            citizen(f'q{next(_N)}', 'FARMER', farmer(False).id)
        few = queries()
        for _ in range(6):
            citizen(f'q{next(_N)}', 'FARMER', farmer(False).id)
        self.assertEqual(few, queries(), 'queries grow with the number of users listed')
