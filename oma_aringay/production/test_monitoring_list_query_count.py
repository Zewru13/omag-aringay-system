"""The crop monitoring list used to run about five extra queries for every row (55 for one page), which made it take
seconds on the live database. It must cost a fixed number of queries and show exactly the same values."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.db import connection
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationMember
from farmers.models import Farmer
from production.models import CropActivityLog, CropDisasterReport, CropMonitoringRecord, CropType

_N = itertools.count(1)


def make_record(**over):
    n = next(_N)
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (940000 + n), first_name=f'List{n}', last_name='Monitor', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    org = FarmersOrganization.objects.create(
        name=f'List Org {n}', barangay='Alaska', registration_number=f'LST-{n:04d}', date_organized=date(2020, 1, 1),
        date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat', contact_number='09170000000')
    FarmersOrganizationMember.objects.create(organization=org, farmer=farmer, date_joined=date(2026, 1, 1), is_main=True)
    record = CropMonitoringRecord.objects.create(
        farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00', **over)
    for day in (3, 9):
        CropActivityLog.objects.create(monitoring_record=record, activity_type='Weeding', date_of_activity=date(2026, 5, 1) + timedelta(days=day),
                                       plant_condition='Good' if day == 9 else 'Fair', target_day=day)
    CropDisasterReport.objects.create(monitoring_record=record, disaster_type='Flood', date_of_occurrence=date(2026, 6, 1), area_affected_ha='0.50',
                                      estimated_damage='x', status='Active')
    CropDisasterReport.objects.create(monitoring_record=record, disaster_type='Drought', date_of_occurrence=date(2026, 6, 5), area_affected_ha='0.20',
                                      estimated_damage='y', status='Recovered')
    return record


class MonitoringListQueryCountTests(APITestCase):
    URL = '/api/production/monitoring/'

    def setUp(self):
        self.client.force_authenticate(get_user_model().objects.create_user(username='ml-admin', password='pw', role='ADMIN', email='ml@x.test'))

    def fetch(self):
        with CaptureQueriesContext(connection) as ctx:
            response = self.client.get(self.URL)
        self.assertEqual(response.status_code, 200)
        return len(ctx), response.json()['results']

    def test_the_number_of_queries_does_not_grow_with_the_number_of_rows(self):
        for _ in range(2):
            make_record()
        few, _ = self.fetch()
        for _ in range(8):
            make_record()
        many, rows = self.fetch()
        self.assertEqual(len(rows), 10)
        self.assertEqual(few, many, f'{few} queries for 2 rows but {many} for 10')

    def test_values_are_unchanged(self):
        record = make_record()
        _, rows = self.fetch()
        row = next(r for r in rows if r['id'] == record.id)
        self.assertEqual(row['log_count'], 2)
        self.assertEqual(row['latest_condition'], 'Good')
        self.assertEqual(row['disasters_count'], 1)               # only the Active one
        self.assertTrue(row['has_recovered_disaster'])
        self.assertEqual(row['disaster_report_count'], 2)
        self.assertEqual(row['harvest_count'], 0)
        self.assertIsNone(row['harvest_record_id'])
        self.assertTrue(row['farmer_organization_name'].startswith('List Org'))
