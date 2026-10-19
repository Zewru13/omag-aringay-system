"""Farm visits on a farmer's profile: staff record, edit and delete visits; a visit cannot be in the future and the next
visit cannot come before it."""
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import Farmer
from monitoring.models import FarmVisit

User = get_user_model()
URL = '/api/monitoring/farm-visits/'


class FarmVisitApiTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='fv-admin', password='pw', role='ADMIN', email='fva@x.test')
        cls.evaluator = User.objects.create_user(username='fv-eval', password='pw', role='EVALUATOR', email='fve@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990001', first_name='Visit', last_name='Farmer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.other = Farmer.objects.create(
            rsbsa_number='01-033-02-019-990002', first_name='Other', last_name='Farmer', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.farmer_user = User.objects.create_user(username='fv-farmer', password='pw', role='CITIZEN', email='fvf@x.test')
        UserLinkedRecord.objects.create(
            user=cls.farmer_user, record_type=User.LinkedRecordType.FARMER, record_id=cls.farmer.id, is_active=True)

    def payload(self, **extra):
        data = {'farmer': self.farmer.id, 'visit_date': str(date.today() - timedelta(days=1)), 'purpose': 'Check on the rice crop'}
        data.update(extra)
        return data

    def test_staff_record_a_visit_and_it_remembers_who_did_it(self):
        for user in (self.admin, self.evaluator):
            self.client.force_authenticate(user)
            r = self.client.post(URL, self.payload(notes='Leaf folder seen'), format='json')
            self.assertEqual(r.status_code, 201, r.content)
            self.assertEqual(r.json()['conducted_by'], user.id)
            self.assertEqual(r.json()['notes'], 'Leaf folder seen')

    def test_a_visit_cannot_be_in_the_future(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(URL, self.payload(visit_date=str(date.today() + timedelta(days=2))), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('visit_date', r.json())

    def test_the_purpose_is_required(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(URL, self.payload(purpose=''), format='json')
        self.assertEqual(r.status_code, 400)
        self.assertIn('purpose', r.json())

    def test_the_next_visit_can_be_planned_in_the_future(self):
        self.client.force_authenticate(self.admin)
        r = self.client.post(URL, self.payload(next_visit_date=str(date.today() + timedelta(days=30))), format='json')
        self.assertEqual(r.status_code, 201, r.content)

    def test_the_next_visit_cannot_come_before_the_visit(self):
        self.client.force_authenticate(self.admin)
        visit = date.today() - timedelta(days=1)
        r = self.client.post(URL, self.payload(visit_date=str(visit), next_visit_date=str(visit - timedelta(days=3))), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('next_visit_date', r.json())

    def test_an_edit_cannot_move_the_next_visit_before_the_visit(self):
        self.client.force_authenticate(self.admin)
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date.today() - timedelta(days=1), purpose='x')
        r = self.client.patch(f'{URL}{v.id}/', {'next_visit_date': str(date.today() - timedelta(days=9))}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        ok = self.client.patch(f'{URL}{v.id}/', {'next_visit_date': str(date.today() + timedelta(days=9)), 'notes': 'updated'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        self.assertEqual(ok.json()['notes'], 'updated')

    def test_the_list_filters_by_farmer_newest_first(self):
        self.client.force_authenticate(self.admin)
        old = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 1, 5), purpose='old')
        new = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 6, 5), purpose='new')
        FarmVisit.objects.create(farmer=self.other, visit_date=date(2026, 3, 5), purpose='elsewhere')
        r = self.client.get(URL, {'farmer': self.farmer.id})
        self.assertEqual([v['id'] for v in r.json()], [new.id, old.id])

    def test_staff_can_delete_a_visit(self):
        self.client.force_authenticate(self.admin)
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 1, 5), purpose='x')
        self.assertEqual(self.client.delete(f'{URL}{v.id}/').status_code, 204)
        self.assertFalse(FarmVisit.objects.filter(pk=v.pk).exists())

    def test_a_farmer_account_cannot_record_edit_or_delete_visits(self):
        v = FarmVisit.objects.create(farmer=self.farmer, visit_date=date(2026, 1, 5), purpose='x')
        self.client.force_authenticate(self.farmer_user)
        self.assertEqual(self.client.post(URL, self.payload(), format='json').status_code, 403)
        self.assertEqual(self.client.patch(f'{URL}{v.id}/', {'notes': 'n'}, format='json').status_code, 403)
        self.assertEqual(self.client.delete(f'{URL}{v.id}/').status_code, 403)
        self.assertTrue(FarmVisit.objects.filter(pk=v.pk).exists())
