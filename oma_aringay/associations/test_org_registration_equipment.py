"""The equipment an organization has is entered on its registration form and saved with it (or not at all)."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FisherfolkOrganization, FisherfolkOrganizationEquipment,
)

_N = itertools.count(1)
TODAY = date.today()


def payload(**over):
    n = next(_N)
    data = {
        'name': f'Equip Reg Org {n}', 'barangay': 'Alaska', 'street_address': '', 'registration_number': f'EQR-{n:04d}',
        'registration_agency': 'SEC', 'email_address': '', 'contact_person': 'Pat Contact', 'contact_number': '09171234567',
        'date_organized': '2020-01-10', 'date_registered': '2020-03-01',
    }
    data.update(over)
    return data


def line(name='Hand Tractor', quantity=2, **over):
    row = {'equipment_name': name, 'quantity': quantity}
    row.update(over)
    return row


DOMAINS = {
    'farmers': (FarmersOrganization, FarmersOrganizationEquipment, 'Hand Tractor'),
    'fisherfolk': (FisherfolkOrganization, FisherfolkOrganizationEquipment, 'Motorized Banca'),
}


class OrganizationRegistrationEquipmentTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='eqreg-admin', password='pw', role='ADMIN', email='eqreg@x.test')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def test_equipment_is_saved_with_the_organization_as_good_condition(self):
        for domain, (model, equipment_model, kind) in DOMAINS.items():
            r = self.client.post(f'/api/organizations/{domain}/', payload(new_equipment=[
                line(kind, 3, acquisition_date=(TODAY - timedelta(days=30)).isoformat(), remarks='Donated'),
                line('Other', 1, equipment_name_other='Seed Cleaner'),
            ]), format='json')
            self.assertEqual(r.status_code, 201, (domain, r.content))
            org = model.objects.get(pk=r.data['id'])
            lines = sorted(((e.equipment_name, e.equipment_name_other, e.quantity, e.condition, e.remarks) for e in equipment_model.objects.filter(organization=org)))
            self.assertEqual(lines, sorted([(kind, '', 3, 'Good', 'Donated'), ('Other', 'Seed Cleaner', 1, 'Good', '')]), domain)
            self.assertEqual([e['equipment_name'] for e in r.data['equipment']], [kind, 'Other'], domain)

    def test_an_organization_can_be_registered_without_equipment(self):
        for domain, (model, equipment_model, _) in DOMAINS.items():
            r = self.client.post(f'/api/organizations/{domain}/', payload(), format='json')
            self.assertEqual(r.status_code, 201, (domain, r.content))
            self.assertFalse(equipment_model.objects.filter(organization_id=r.data['id']).exists(), domain)

    def test_one_bad_equipment_line_saves_nothing_at_all(self):
        for domain, (model, equipment_model, kind) in DOMAINS.items():
            body = payload(new_equipment=[line(kind, 1), line(kind, 0)])
            r = self.client.post(f'/api/organizations/{domain}/', body, format='json')
            self.assertEqual(r.status_code, 400, (domain, r.content))
            self.assertFalse(model.objects.filter(name=body['name']).exists(), domain)
            self.assertFalse(equipment_model.objects.exists(), domain)

    def test_other_equipment_must_say_what_it_is(self):
        r = self.client.post('/api/organizations/farmers/', payload(new_equipment=[line('Other', 1)]), format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_a_future_acquisition_date_is_refused(self):
        r = self.client.post('/api/organizations/farmers/', payload(new_equipment=[line(acquisition_date=(TODAY + timedelta(days=5)).isoformat())]), format='json')
        self.assertEqual(r.status_code, 400, r.content)

    def test_editing_an_organization_never_adds_equipment(self):
        org = FarmersOrganization.objects.get(pk=self.client.post('/api/organizations/farmers/', payload(), format='json').data['id'])
        r = self.client.patch(f'/api/organizations/farmers/{org.id}/', {'new_equipment': [line()]}, format='json')
        self.assertIn(r.status_code, (200, 400))
        self.assertFalse(FarmersOrganizationEquipment.objects.filter(organization=org).exists())
