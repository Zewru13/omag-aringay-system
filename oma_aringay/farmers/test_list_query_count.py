"""The farmer list (also the name search in forms) must not run extra queries for every row it shows: each query is a
network round trip to the database, so 10 rows used to cost 50+ queries and the search took seconds."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember
from farmers.models import FarmParcel, Farmer

_N = itertools.count(1)


def make_farmer(with_org):
    n = next(_N)
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (950000 + n), first_name=f'Query{n}', last_name='Counter', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    FarmParcel.objects.create(farmer=farmer, parcel_number=f'01-33-02-005-001-02-{n:03d}', barangay='Alaska', area_hectares='1.00')
    if with_org:
        org = FarmersOrganization.objects.create(
            name=f'Query Org {n}', barangay='Alaska', registration_number=f'QRY-{n:04d}', date_organized=date(2020, 1, 1),
            date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat', contact_number='09170000000')
        FarmersOrganizationMember.objects.create(organization=org, farmer=farmer, date_joined=date(2026, 1, 1), is_main=True)
    return farmer


class FarmerListQueryCountTests(APITestCase):
    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user(username='qc-admin', password='pw', role='ADMIN', email='qc@x.test'))

    def count_queries(self, **params):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get('/api/farmers/', params)
        self.assertEqual(response.status_code, 200)
        return len(ctx), response.json()

    def test_the_number_of_queries_does_not_grow_with_the_number_of_rows(self):
        for _ in range(2):
            make_farmer(with_org=True)
        few, _ = self.count_queries()
        for _ in range(8):
            make_farmer(with_org=True)
        many, body = self.count_queries()
        self.assertEqual(len(body['results']), 10)
        self.assertEqual(few, many, f'{few} queries for 2 rows but {many} for 10')
        self.assertLessEqual(many, 10)

    def test_search_returns_the_same_people_and_details(self):
        farmer = make_farmer(with_org=True)
        _, body = self.count_queries(search=farmer.first_name)
        row = body['results'][0]
        self.assertEqual(row['full_name'], farmer.full_name)
        self.assertTrue(row['commodity'] is not None)
        self.assertEqual(row['organizations_count'], 1)
        self.assertTrue(row['is_org_membership_active'])
        self.assertTrue(row['farmers_organization_name'].startswith('Query Org'))

    def test_a_farmer_without_an_organization_is_still_listed(self):
        farmer = make_farmer(with_org=False)
        _, body = self.count_queries(search=farmer.first_name)
        row = body['results'][0]
        self.assertEqual((row['organizations_count'], row['is_org_membership_active'], row['farmers_organization_name']), (0, False, None))
