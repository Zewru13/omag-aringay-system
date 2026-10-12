"""The organization lists (also the organization search in the Distribute dialog) must not run queries per row."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from associations.models import (
    FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationMember,
    FisherfolkOrganization, FisherfolkOrganizationEquipment, FisherfolkOrganizationMember,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk

_N = itertools.count(1)
ORG = dict(barangay='Alaska', registration_agency='SEC', contact_person='Pat', contact_number='09170000000',
           date_organized=date(2020, 1, 1), date_registered=date(2020, 2, 1))


def make_farmers_org():
    n = next(_N)
    org = FarmersOrganization.objects.create(name=f'QC Farm Org {n}', registration_number=f'QCF-{n:04d}', **ORG)
    farmer = Farmer.objects.create(rsbsa_number='01-033-02-019-%06d' % (930000 + n), first_name='Q', last_name=f'F{n}', gender='Male',
                                   birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    FarmersOrganizationMember.objects.create(organization=org, farmer=farmer, date_joined=date(2026, 1, 1))
    FarmersOrganizationEquipment.objects.create(organization=org, equipment_name='Pump', quantity=2, condition='Good')
    FarmersOrganizationEquipment.objects.create(organization=org, equipment_name='Old pump', quantity=0, condition='Good')
    return org


def make_fisherfolk_org():
    n = next(_N)
    org = FisherfolkOrganization.objects.create(name=f'QC Fish Org {n}', registration_number=f'QCS-{n:04d}', **ORG)
    person = Fisherfolk.objects.create(rsbsa_number='01-033-02-019-%06d' % (920000 + n), first_name='Q', last_name=f'S{n}', gender='Male',
                                       birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
    FisherfolkOrganizationMember.objects.create(organization=org, fisherfolk=person, date_joined=date(2026, 1, 1))
    FisherfolkOrganizationEquipment.objects.create(organization=org, equipment_name='Net', quantity=3, condition='Good')
    FisherfolkOrganizationEquipment.objects.create(organization=org, equipment_name='Old net', quantity=0, condition='Good')
    return org


class OrgListQueryCountTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user(username='oq-admin', password='pw', role='ADMIN', email='oq@x.test'))

    def fetch(self, url):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(url, {'search': 'QC'})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        return len(ctx), body['results'] if isinstance(body, dict) else body

    def check(self, url, make):
        for _ in range(2):
            make()
        few, _ = self.fetch(url)
        for _ in range(6):
            make()
        many, rows = self.fetch(url)
        self.assertEqual(len(rows), 8)
        self.assertEqual(few, many, f'{few} queries for 2 rows but {many} for 8')
        for row in rows:
            self.assertEqual((row['member_count'], row['equipment_count']), (1, 1))      # the empty equipment line is not counted

    def test_farmers_organization_list(self):
        self.check('/api/organizations/farmers/', make_farmers_org)

    def test_fisherfolk_organization_list(self):
        self.check('/api/organizations/fisherfolk/', make_fisherfolk_org)
