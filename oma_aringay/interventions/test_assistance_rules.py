"""Assistance is recorded for today or a future date only, and the source agencies come from a managed list."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import AssistanceAgency, BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord

_N = itertools.count(1)
User = get_user_model()
FARMER_ADHOC = '/api/interventions/beneficiaries/adhoc/'
FISHER_ADHOC = '/api/interventions/fisherfolk-beneficiaries/adhoc/'
AGENCIES = '/api/interventions/agencies/'


def today():
    return timezone.localdate()


def iso(d):
    return d.isoformat()


class DateRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='ar-admin', password='pw', role='ADMIN', email='ar-admin@x.test')
        n = next(_N)
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (970000 + n), first_name='Ana', last_name='Rules', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (971000 + n), first_name='Ben', last_name='Rules', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def farmer_payload(self, when, **over):
        data = {'farmer': self.farmer.id, 'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'quantity': '10 bags', 'date_given': iso(when)}
        data.update(over)
        return data

    def fisher_payload(self, when, **over):
        data = {'fisherfolk': self.fisher.id, 'assistance_type': 'Feed', 'source_agencies': ['BFAR'], 'quantity': '2', 'date_given': iso(when)}
        data.update(over)
        return data

    def test_a_past_date_is_refused_for_new_assistance(self):
        for url, payload in ((FARMER_ADHOC, self.farmer_payload(today() - timedelta(days=1))), (FISHER_ADHOC, self.fisher_payload(today() - timedelta(days=1)))):
            res = self.client.post(url, payload, format='json')
            self.assertEqual(res.status_code, 400, res.content)
            self.assertIn('date_given', res.json())
        self.assertEqual(BeneficiaryRecord.objects.count() + FisherfolkBeneficiaryRecord.objects.count(), 0)

    def test_today_and_future_dates_are_accepted(self):
        for when in (today(), today() + timedelta(days=30)):
            self.assertEqual(self.client.post(FARMER_ADHOC, self.farmer_payload(when), format='json').status_code, 201)
            res = self.client.post(FISHER_ADHOC, self.fisher_payload(when), format='json')
            self.assertEqual(res.status_code, 201, res.content)

    def make_old(self, status=DistributionStatus.AWAITING_CONFIRMATION):
        record = BeneficiaryRecord.objects.create(farmer=self.farmer, assistance_type='Seeds', source_agencies=['DA'], date_given=today() - timedelta(days=20))
        return record

    def test_an_old_record_can_still_be_edited_when_its_date_is_left_alone(self):
        record = self.make_old()
        res = self.client.patch(f'/api/interventions/beneficiaries/{record.id}/detail/',
                                {'remarks': 'typo fixed', 'date_given': iso(record.date_given)}, format='json')
        self.assertEqual(res.status_code, 200, res.content)

    def test_a_record_cannot_be_moved_to_a_past_date(self):
        record = BeneficiaryRecord.objects.create(farmer=self.farmer, assistance_type='Seeds', source_agencies=['DA'], date_given=today() + timedelta(days=10))
        self.assertEqual(record.status, DistributionStatus.PENDING)
        res = self.client.patch(f'/api/interventions/beneficiaries/{record.id}/detail/', {'date_given': iso(today() - timedelta(days=3))}, format='json')
        self.assertEqual(res.status_code, 400, res.content)
        self.assertEqual(self.client.patch(f'/api/interventions/beneficiaries/{record.id}/detail/', {'date_given': iso(today() + timedelta(days=20))}, format='json').status_code, 200)

    def test_an_old_record_cannot_be_moved_to_another_past_date(self):
        record = self.make_old()
        res = self.client.patch(f'/api/interventions/beneficiaries/{record.id}/detail/', {'date_given': iso(today() - timedelta(days=5))}, format='json')
        self.assertEqual(res.status_code, 400, res.content)

    def test_an_organization_distribution_with_a_past_date_is_refused(self):
        from interventions.serializers import OrganizationDistributionRequestSerializer
        def check(when):
            return OrganizationDistributionRequestSerializer(
                data={'assistance_type': 'Seeds', 'source_agencies': ['DA'], 'date_given': iso(when), 'quantity': '5'},
                context={'model': BeneficiaryRecord})
        past = check(today() - timedelta(days=2))
        self.assertFalse(past.is_valid())
        self.assertIn('date_given', past.errors)
        self.assertTrue(check(today()).is_valid())
        self.assertTrue(check(today() + timedelta(days=9)).is_valid())


class AgencyListTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='ag-admin', password='pw', role='ADMIN', email='ag-admin@x.test')
        cls.citizen = User.objects.create_user(username='ag-citizen', password='pw', role='CITIZEN', email='ag-citizen@x.test')

    def test_the_five_current_agencies_are_there_from_the_start(self):
        self.client.force_authenticate(self.admin)
        names = [a['name'] for a in self.client.get(AGENCIES).json()]
        for name in ('LGU - Aringay', 'Office of the Provincial Agriculturist', 'Department of Agriculture (DA)',
                     'Department of Agrarian Reform (DAR)', 'Non-Government Organization (NGO)'):
            self.assertIn(name, names)

    def test_anyone_signed_in_can_read_the_list_but_only_staff_change_it(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(AGENCIES).status_code, 200)
        self.assertEqual(self.client.post(AGENCIES, {'name': 'Sneaky'}, format='json').status_code, 403)

    def test_staff_add_rename_hide_and_delete(self):
        self.client.force_authenticate(self.admin)
        created = self.client.post(AGENCIES, {'name': 'PCIC'}, format='json')
        self.assertEqual(created.status_code, 201, created.content)
        pk = created.json()['id']
        self.assertTrue(created.json()['is_active'])
        self.assertEqual(self.client.patch(f'{AGENCIES}{pk}/', {'name': 'PCIC Region 1'}, format='json').json()['name'], 'PCIC Region 1')
        self.assertFalse(self.client.patch(f'{AGENCIES}{pk}/', {'is_active': False}, format='json').json()['is_active'])
        self.assertEqual(self.client.delete(f'{AGENCIES}{pk}/').status_code, 204)
        self.assertFalse(AssistanceAgency.objects.filter(pk=pk).exists())

    def test_names_are_unique_without_regard_to_case_and_cannot_be_blank(self):
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(AGENCIES, {'name': 'lgu - aringay'}, format='json').status_code, 400)
        self.assertEqual(self.client.post(AGENCIES, {'name': '   '}, format='json').status_code, 400)

    def test_the_list_is_in_alphabetical_order(self):
        self.client.force_authenticate(self.admin)
        names = [a['name'] for a in self.client.get(AGENCIES).json()]
        self.assertEqual(names, sorted(names, key=str.lower))
