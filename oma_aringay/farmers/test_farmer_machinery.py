"""A farmer's own machinery: entered when the farmer is registered and kept on the farmer's profile (not on each parcel)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from .models import FarmerMachinery, Farmer

RSBSA = '01-033-02-005-990101'


def machine(kind='Hand Tractor', **over):
    row = {'machinery_type': kind, 'machinery_type_other': '', 'quantity': 1, 'ownership': 'Owned'}
    row.update(over)
    return row


def registration(**over):
    body = {'rsbsa_number': RSBSA, 'first_name': 'Mach', 'last_name': 'Farmer', 'gender': 'Male', 'birthdate': '1990-01-01',
            'barangay': 'Alaska', 'civil_status': 'Single', 'contact_number': '09171234567'}
    body.update(over)
    return body


class FarmerMachineryTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='mach-adm', password='pw', role='ADMIN', email='m@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-005-990102', first_name='Own', last_name='Farmer', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    # ── registration ─────────────────────────────────────────────────────────

    def test_registering_a_farmer_saves_the_machinery_with_it(self):
        r = self.client.post('/api/farmers/', registration(machinery=[machine(quantity=2), machine('Other', machinery_type_other='Seed Drill', ownership='Rented')]), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        farmer = Farmer.objects.get(rsbsa_number=RSBSA)
        self.assertEqual(
            sorted((m.machinery_type, m.machinery_type_other, m.quantity, m.ownership) for m in farmer.machinery.all()),
            [('Hand Tractor', '', 2, 'Owned'), ('Other', 'Seed Drill', 1, 'Rented')])

    def test_a_farmer_can_be_registered_with_no_machinery(self):
        r = self.client.post('/api/farmers/', registration(), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertFalse(FarmerMachinery.objects.exists())

    def test_a_bad_machinery_line_saves_nothing_at_all(self):
        r = self.client.post('/api/farmers/', registration(machinery=[machine(), machine(quantity=0)]), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Farmer.objects.filter(rsbsa_number=RSBSA).exists())
        self.assertFalse(FarmerMachinery.objects.exists())

    def test_other_machinery_needs_its_name(self):
        r = self.client.post('/api/farmers/', registration(machinery=[machine('Other')]), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertFalse(Farmer.objects.filter(rsbsa_number=RSBSA).exists())

    # ── the profile ──────────────────────────────────────────────────────────

    def test_the_profile_lists_the_farmers_machinery(self):
        FarmerMachinery.objects.create(farmer=self.farmer, machinery_type='Sprayer', quantity=3, ownership='Borrowed')
        r = self.client.get(f'/api/farmers/{self.farmer.id}/')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual([(m['machinery_type'], m['quantity'], m['ownership']) for m in r.json()['machinery']], [('Sprayer', 3, 'Borrowed')])

    def test_machinery_is_added_from_the_profile(self):
        url = f'/api/farmers/{self.farmer.id}/machinery/'
        r = self.client.post(url, machine('Water Pump', quantity=2, ownership='Organization-Owned'), format='json')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual([m['machinery_type'] for m in self.client.get(url).json()], ['Water Pump'])
        self.assertEqual(self.farmer.machinery.get().quantity, 2)

    def test_machinery_from_the_profile_needs_a_valid_quantity(self):
        r = self.client.post(f'/api/farmers/{self.farmer.id}/machinery/', machine(quantity=0), format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.assertIn('quantity', r.json())

    def test_machinery_is_changed_and_removed_from_the_profile(self):
        line = FarmerMachinery.objects.create(farmer=self.farmer, machinery_type='Harvester', quantity=1, ownership='Owned')
        url = f'/api/farmers/farmer-machinery/{line.id}/'
        r = self.client.patch(url, {'quantity': 4}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        line.refresh_from_db()
        self.assertEqual(line.quantity, 4)
        self.assertEqual(self.client.delete(url).status_code, 204)
        self.assertFalse(FarmerMachinery.objects.filter(pk=line.id).exists())

    def test_citizens_cannot_change_a_farmers_machinery(self):
        citizen = get_user_model().objects.create_user(username='mach-cit', password='pw', role='CITIZEN', email='c@x.test')
        self.client.force_authenticate(citizen)
        r = self.client.post(f'/api/farmers/{self.farmer.id}/machinery/', machine(), format='json')
        self.assertIn(r.status_code, (401, 403))
        self.assertFalse(FarmerMachinery.objects.exists())
