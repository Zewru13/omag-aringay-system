"""Edit Fisherfolk is the Register Fisherfolk form filled in: the profile answers every field the form shows (the email too), and a save from
the edit form keeps each of them, a kept type and the fisherfolk's memberships.

Run ONLY against an isolated test database (never the shared Supabase database)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FisherfolkOrganization, FisherfolkOrganizationMember
from fisheries.models import Fisherfolk

# What the edit form sends (oma-frontend/src/pages/Fisherfolk/fisherfolkForm.js, fisherfolkPayload with isEdit).
EDIT_FORM = {
    'prefix': 'Mr.', 'first_name': 'Danilo', 'middle_name': 'Reyes', 'last_name': 'Mercado', 'gender': 'Male', 'birthdate': '1980-05-02',
    'civil_status': 'Married', 'highest_education': 'High School', 'contact_number': '09171234567', 'email': 'danilo@example.test',
    'barangay': 'Alaska', 'rsbsa_number': '01-033-02-019-980001', 'fishr_number': '', 'philsys_number': '8419-5032-7741-3096',
    'is_pwd': True, 'is_4ps_beneficiary': True, 'is_icc_ip_member': True, 'icc_ip_name': 'Kankanaey',
    'is_aquaculture': True, 'is_capture_fishery': True, 'is_mariculture': False, 'is_inland_fishery': False,
    'has_vessel': True, 'boat_registration_number': '1234567',
}


class FisherfolkEditFormTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ffe-admin', password='pw', role='ADMIN', email='ffe-admin@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.ff = Fisherfolk.objects.create(
            first_name='Dan', last_name='Mercado', gender='Male', birthdate=date(1980, 5, 2), barangay='Alaska', civil_status='Single',
            rsbsa_number='01-033-02-019-980001', email='old@example.test', fisherfolk_type='Capture')
        self.url = f'/api/fisheries/fisherfolk/{self.ff.id}/'

    def test_the_profile_answers_every_field_of_the_form(self):
        data = self.client.get(self.url).json()
        for field in EDIT_FORM:
            self.assertIn(field, data, f'{field} is missing from the profile, so the edit form could not show it')
        self.assertEqual(data['email'], 'old@example.test')

    def test_a_save_from_the_edit_form_keeps_every_field(self):
        r = self.client.patch(self.url, EDIT_FORM, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.ff.refresh_from_db()
        for field, value in EDIT_FORM.items():
            stored = getattr(self.ff, field)
            if field == 'birthdate':
                stored = stored.isoformat()
            if field == 'fishr_number':
                stored = stored or ''
            self.assertEqual(stored, value, field)
        answer = self.client.get(self.url).json()
        self.assertEqual((answer['civil_status'], answer['email'], answer['philsys_number'], answer['icc_ip_name']),
                         ('Married', 'danilo@example.test', '8419-5032-7741-3096', 'Kankanaey'))

    def test_the_edit_form_changes_neither_the_type_nor_the_memberships(self):
        organization = FisherfolkOrganization.objects.create(name='Alaska Growers')
        FisherfolkOrganizationMember.objects.create(organization=organization, fisherfolk=self.ff, date_joined=date(2020, 1, 1), is_main=True)
        self.assertEqual(self.client.patch(self.url, EDIT_FORM, format='json').status_code, 200)
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.fisherfolk_type, 'Capture')
        self.assertEqual(list(self.ff.fisherfolk_organizations.filter(is_active=True).values_list('organization__name', flat=True)), ['Alaska Growers'])
        self.assertEqual(self.client.get(self.url).json()['organization_names'], ['Alaska Growers'])

    def test_a_wrong_philsys_or_boat_number_is_refused(self):
        self.assertEqual(self.client.patch(self.url, {**EDIT_FORM, 'philsys_number': '8419-5032'}, format='json').status_code, 400)
        self.assertEqual(self.client.patch(self.url, {**EDIT_FORM, 'boat_registration_number': '123'}, format='json').status_code, 400)
        self.ff.refresh_from_db()
        self.assertEqual(self.ff.first_name, 'Dan')

    def test_no_vessel_clears_the_boat_number(self):
        Fisherfolk.objects.filter(pk=self.ff.pk).update(boat_registration_number='7654321')
        r = self.client.patch(self.url, {**EDIT_FORM, 'has_vessel': False, 'boat_registration_number': ''}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.ff.refresh_from_db()
        self.assertEqual((self.ff.has_vessel, self.ff.boat_registration_number), (False, ''))
