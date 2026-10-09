"""The strict phone rule (09 + 9 digits) must not block saving a record whose OLD stored number is in another format, as
long as the number itself is not being changed: it only has to be fixed when someone edits it."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import Farmer

User = get_user_model()
_N = itertools.count(1)
OLD_FORMAT = '0917-123-4567'


def make_org(model, name):
    n = next(_N)
    org = model.objects.create(
        name=f'{name} {n}', barangay='Alaska', registration_number=f'CU-{n:05d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat', contact_number='09171234567')
    model.objects.filter(pk=org.pk).update(contact_number=OLD_FORMAT)  # an older record saved before the strict rule
    return org


class UnchangedOldNumberTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = User.objects.create_user(username='cu-staff', password='pw', role='ADMIN', email='cu-staff@x.test')
        cls.orgs = {
            'farmers': make_org(FarmersOrganization, 'Old Number Farmers'),
            'fisherfolk': make_org(FisherfolkOrganization, 'Old Number Fisherfolk'),
        }
        n = next(_N)
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (996000 + n), first_name='Old', last_name='Number', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        Farmer.objects.filter(pk=cls.farmer.pk).update(contact_number=OLD_FORMAT)

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def patch_org(self, kind, **data):
        return self.client.patch(f'/api/organizations/{kind}/{self.orgs[kind].id}/', data, format='json')

    def test_resending_the_unchanged_old_number_is_accepted_by_both_organization_types(self):
        for kind in self.orgs:
            res = self.patch_org(kind, contact_number=OLD_FORMAT, contact_person='Renamed Contact')
            self.assertEqual(res.status_code, 200, (kind, res.data))
            self.assertEqual(res.data['contact_person'], 'Renamed Contact')

    def test_changing_to_another_badly_formatted_number_is_still_refused(self):
        for kind in self.orgs:
            self.assertEqual(self.patch_org(kind, contact_number='0917-999-0000').status_code, 400, kind)
            self.assertEqual(self.patch_org(kind, contact_number='12345').status_code, 400, kind)

    def test_changing_to_a_valid_number_is_accepted(self):
        for kind in self.orgs:
            res = self.patch_org(kind, contact_number='09181234567')
            self.assertEqual(res.status_code, 200, (kind, res.data))

    def test_a_farmer_record_behaves_the_same(self):
        url = f'/api/farmers/{self.farmer.id}/'
        self.assertEqual(self.client.patch(url, {'contact_number': OLD_FORMAT, 'first_name': 'Oldie'}, format='json').status_code, 200)
        self.assertEqual(self.client.patch(url, {'contact_number': '0917-000-1111'}, format='json').status_code, 400)
