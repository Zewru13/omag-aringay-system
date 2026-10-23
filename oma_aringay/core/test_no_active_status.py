"""Farmers, fisherfolk, organizations and farm parcels have no Active / Inactive status any more."""
from datetime import date

from django.contrib.auth import get_user_model
from django.core.exceptions import FieldDoesNotExist
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FisherfolkOrganization
from farmers.models import FarmParcel, Farmer
from fisheries.models import Fisherfolk


class NoActiveStatusTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='adm', password='pw', role='ADMIN', email='a@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-000991', first_name='Ana', last_name='Lim', gender='Female', birthdate=date(1985, 3, 3),
            barangay='Alaska', civil_status='Single')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, parcel_number='P-1', area_hectares='1.00', barangay='Alaska')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-000992', first_name='Pedro', last_name='Sea', gender='Male', birthdate=date(1980, 1, 1),
            barangay='Samara', fisherfolk_type='Aquaculture')
        cls.org = FarmersOrganization.objects.create(
            name='Org', barangay='Alaska', contact_person='C', contact_number='0917', registration_number='O-1',
            date_organized=date(2020, 1, 1), date_registered=date(2021, 1, 1), registration_agency='CDA')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_the_status_fields_are_gone_from_the_models(self):
        for model, name in ((Farmer, 'is_active'), (Fisherfolk, 'is_active'), (FarmersOrganization, 'is_active'),
                            (FisherfolkOrganization, 'is_active'), (FarmParcel, 'farm_status')):
            with self.assertRaises(FieldDoesNotExist, msg=f'{model.__name__}.{name}'):
                model._meta.get_field(name)

    def test_no_api_answer_carries_a_status(self):
        for url in (f'/api/farmers/{self.farmer.id}/', '/api/farmers/', f'/api/fisheries/fisherfolk/{self.fisher.id}/',
                    '/api/fisheries/fisherfolk/', '/api/organizations/farmers/', f'/api/farmers/{self.farmer.id}/parcels/'):
            r = self.client.get(url)
            self.assertEqual(r.status_code, 200, url)
            body = r.json()
            rows = body['results'] if isinstance(body, dict) and 'results' in body else (body if isinstance(body, list) else [body])
            for row in rows:
                for key in ('is_active', 'farm_status'):
                    self.assertNotIn(key, row, f'{url} still has {key}')

    def test_the_old_status_filter_is_ignored_not_an_error(self):
        self.assertEqual(self.client.get('/api/farmers/', {'status': 'inactive'}).json()['count'], 1)
        self.assertEqual(self.client.get('/api/fisheries/fisherfolk/', {'status': 'inactive'}).json()['count'], 1)

    def test_the_directory_of_parcels_has_no_status_filter(self):
        r = self.client.get('/api/farmers/parcels/directory/', {'farm_status': 'Inactive'})
        self.assertEqual(r.status_code, 200)
        self.assertEqual(r.json()['count'], 1)
