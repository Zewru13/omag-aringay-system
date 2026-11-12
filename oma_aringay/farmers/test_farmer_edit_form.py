"""Edit Farmer is the Register Farmer form filled in: the profile answers every field the form shows (the email too), and a save from the edit
form keeps each of them and the farmer's organization memberships.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember
from farmers.models import Farmer

# What the edit form sends (oma-frontend/src/pages/Farmers/farmerForm.js, farmerPayload with isEdit).
EDIT_FORM = {
    'prefix': 'Mr.', 'first_name': 'Eli', 'middle_name': 'Reyes', 'last_name': 'Sabado', 'gender': 'Male', 'birthdate': '1958-05-02',
    'civil_status': 'Married', 'highest_education': 'High School', 'contact_number': '09171234567', 'email': 'eli@example.test',
    'barangay': 'Alaska', 'philsys_number': '8419-5032-7741-3096', 'is_pwd': True, 'is_4ps_beneficiary': True, 'is_icc_ip_member': True,
    'icc_ip_name': 'Kankanaey', 'is_senior_citizen': True,
}


class FarmerEditFormTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='fe-admin', password='pw', role='ADMIN', email='fe-admin@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-005-960001', first_name='Eli', last_name='Sabado', gender='Male', birthdate=date(1958, 5, 2),
            barangay='Alaska', civil_status='Single', email='old@example.test')
        self.url = f'/api/farmers/{self.farmer.id}/'

    def test_the_profile_answers_every_field_of_the_form(self):
        data = self.client.get(self.url).json()
        for field in EDIT_FORM:
            self.assertIn(field, data, f'{field} is missing from the profile, so the edit form could not show it')
        self.assertEqual(data['email'], 'old@example.test')

    def test_a_save_from_the_edit_form_keeps_every_field(self):
        r = self.client.patch(self.url, EDIT_FORM, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        answer = self.client.get(self.url).json()
        for field, value in EDIT_FORM.items():
            self.assertEqual(answer[field], value, field)
        self.assertEqual(answer['rsbsa_number'], '01-033-02-005-960001')      # the RSBSA number is not part of this form

    def test_the_edit_form_does_not_touch_the_memberships(self):
        organization = FarmersOrganization.objects.create(name='Alaska Farmers')
        FarmersOrganizationMember.objects.create(organization=organization, farmer=self.farmer, date_joined=date(2020, 1, 1), is_main=True)
        self.assertEqual(self.client.patch(self.url, EDIT_FORM, format='json').status_code, 200)
        self.assertEqual([o['organization_name'] for o in self.client.get(self.url).json()['organizations']], ['Alaska Farmers'])

    def test_a_wrong_philsys_number_is_refused(self):
        r = self.client.patch(self.url, {**EDIT_FORM, 'philsys_number': '8419-5032'}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
        self.farmer.refresh_from_db()
        self.assertEqual(self.farmer.first_name, 'Eli')
        self.assertEqual(self.farmer.civil_status, 'Single')
