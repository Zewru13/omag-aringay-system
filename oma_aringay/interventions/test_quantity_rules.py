"""The quantity of an assistance must be a real, positive amount (audit 2026-11-20).

Before, the box took any text: "-5 sacks" or "99999999999 kg" were saved and printed on the reports. A blank quantity is still allowed
(Training and some other types have none), and a number written with words ("10 bags", "P 5,000") is fine.

Run ONLY against an isolated test database (never the shared Supabase database)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord

from .quantity import quantity_problem
from interventions.test_helpers import SCHEDULE

_N = itertools.count(1)
User = get_user_model()
FARMER_ADHOC = '/api/interventions/beneficiaries/adhoc/'
FISHER_ADHOC = '/api/interventions/fisherfolk-beneficiaries/adhoc/'
FARMER_BULK = '/api/interventions/beneficiaries/adhoc/bulk/'


class QuantityHelperTests(APITestCase):
    def test_blank_is_allowed(self):
        for text in ('', '   ', None):
            self.assertIsNone(quantity_problem(text), repr(text))

    def test_real_amounts_are_allowed(self):
        for text in ('1', '10 bags', '2.5 kg', 'P 5,000', '\u20b15000.50', '12 sacks of urea', '1,500 pcs'):
            self.assertIsNone(quantity_problem(text), text)

    def test_zero_negative_and_missing_numbers_are_refused(self):
        for text in ('0', '0 kg', '-5 sacks', '-0.5', 'many sacks', 'abc'):
            self.assertIsNotNone(quantity_problem(text), text)

    def test_an_absurdly_large_amount_is_refused(self):
        self.assertIsNotNone(quantity_problem('99999999999 kg'))
        self.assertIsNone(quantity_problem('1000000 pcs'))


class QuantityEndpointTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='qr-admin', password='pw', role='ADMIN', email='qr-admin@x.test')
        n = next(_N)
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (972000 + n), first_name='Qua', last_name='Ntity', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (973000 + n), first_name='Qui', last_name='Ntity', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.today = timezone.localdate().isoformat()

    def farmer_body(self, quantity):
        return {'farmer': self.farmer.id, 'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'quantity': quantity, **SCHEDULE, 'date_given': self.today}

    def fisher_body(self, quantity):
        return {'fisherfolk': self.fisher.id, 'assistance_type': 'Feed', 'source_agencies': ['BFAR'], 'quantity': quantity, **SCHEDULE, 'date_given': self.today}

    def test_a_negative_quantity_is_refused_for_farmers_and_fisherfolk(self):
        for url, body in ((FARMER_ADHOC, self.farmer_body('-5 sacks')), (FISHER_ADHOC, self.fisher_body('-5 sacks'))):
            r = self.client.post(url, body, format='json')
            self.assertEqual(r.status_code, 400, r.content)
            self.assertIn('quantity', r.json())
        self.assertEqual(BeneficiaryRecord.objects.count() + FisherfolkBeneficiaryRecord.objects.count(), 0)

    def test_a_huge_quantity_is_refused(self):
        r = self.client.post(FARMER_ADHOC, self.farmer_body('99999999999 kg'), format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_a_normal_or_blank_quantity_is_accepted(self):
        self.assertEqual(self.client.post(FARMER_ADHOC, self.farmer_body('10 bags'), format='json').status_code, 201)
        self.assertEqual(self.client.post(FISHER_ADHOC, self.fisher_body(''), format='json').status_code, 201)

    def test_editing_to_a_bad_quantity_is_refused(self):
        record = BeneficiaryRecord.objects.create(farmer=self.farmer, assistance_type='Seeds', source_agencies=['DA'],
                                                  date_given=timezone.localdate(), quantity='5 bags')
        r = self.client.patch(f'/api/interventions/beneficiaries/adhoc/{record.id}/', {'quantity': '-1'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        record.refresh_from_db()
        self.assertEqual(record.quantity, '5 bags')

    def test_the_bulk_form_refuses_a_bad_quantity_with_one_clear_error(self):
        r = self.client.post(FARMER_BULK, {'farmer_ids': [self.farmer.id], 'assistance_type': 'Seeds', 'source_agencies': ['DA'],
                                           'quantity': '0 kg', **SCHEDULE, 'date_given': self.today}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('quantity', r.json())
        self.assertEqual(BeneficiaryRecord.objects.count(), 0)
