"""Dashboard: disaster reports per month between a From and a To month, for crops and fisheries."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from fisheries.models import Fisherfolk, FisheriesDisasterReport
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

URL = '/api/production/dashboard/disaster-trends/'
_N = itertools.count(1)


class DisasterTrendsTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='dt-admin', password='pw', role='ADMIN', email='dt-admin@x.test')
        cls.citizen = User.objects.create_user(username='dt-citizen', password='pw', role='CITIZEN', email='dt-citizen@x.test')
        farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (940000 + next(_N)), first_name='Ana', last_name='Trend', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.fisher = Fisherfolk.objects.create(
            rsbsa_number='01-033-02-019-%06d' % (941000 + next(_N)), first_name='Ben', last_name='Trend', gender='Male',
            birthdate=date(1990, 1, 1), barangay='Alaska', fisherfolk_type='Inland')
        cls.record = CropMonitoringRecord.objects.create(
            farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 1, 5), area_planted_ha='1.00', status='Planted')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def crop(self, when, kind='Typhoon', status='Active', other=''):
        return CropDisasterReport.objects.create(
            monitoring_record=self.record, disaster_type=kind, disaster_type_other_specify=other, date_of_occurrence=when, status=status)

    def fish(self, when, kind='Flood', status='Active'):
        return FisheriesDisasterReport.objects.create(fisherfolk=self.fisher, disaster_type=kind, date_of_occurrence=when, status=status)

    def get(self, **params):
        return self.client.get(URL, params)

    def test_monthly_counts_for_crop_and_fisheries_inside_the_range(self):
        self.crop(date(2026, 1, 10)); self.crop(date(2026, 1, 20)); self.crop(date(2026, 3, 2))
        self.fish(date(2026, 1, 5)); self.fish(date(2026, 2, 8))
        self.crop(date(2025, 12, 31)); self.fish(date(2027, 1, 1))              # outside the range
        data = self.get(**{'from': '2026-01', 'to': '2026-03'}).json()
        self.assertEqual(data['months'], [
            {'month': '2026-01', 'crop': 2, 'fisheries': 1},
            {'month': '2026-02', 'crop': 0, 'fisheries': 1},
            {'month': '2026-03', 'crop': 1, 'fisheries': 0},
        ])

    def test_every_month_of_the_range_is_listed_even_when_empty(self):
        data = self.get(**{'from': '2026-01', 'to': '2026-12'}).json()
        self.assertEqual([m['month'] for m in data['months']], [f'2026-{i:02d}' for i in range(1, 13)])
        self.assertTrue(all(m['crop'] == 0 and m['fisheries'] == 0 for m in data['months']))

    def test_the_last_day_of_the_to_month_is_included(self):
        self.crop(date(2026, 12, 31))
        self.assertEqual(self.get(**{'from': '2026-12', 'to': '2026-12'}).json()['months'], [{'month': '2026-12', 'crop': 1, 'fisheries': 0}])

    def test_totals_and_the_breakdown_by_type(self):
        self.crop(date(2026, 1, 10), kind='Typhoon'); self.crop(date(2026, 1, 11), kind='Typhoon', status='Recovered')
        self.crop(date(2026, 2, 1), kind='Other', other='Landslide')
        self.fish(date(2026, 2, 3), kind='Flood'); self.fish(date(2026, 2, 4), kind='Typhoon')
        data = self.get(**{'from': '2026-01', 'to': '2026-12'}).json()
        self.assertEqual(data['totals'], {'reports': 5, 'active': 4, 'crop': 3, 'fisheries': 2})
        by_type = {t['type']: t for t in data['by_type']}
        self.assertEqual((by_type['Typhoon']['crop'], by_type['Typhoon']['fisheries'], by_type['Typhoon']['total']), (2, 1, 3))
        self.assertEqual(by_type['Landslide']['total'], 1)            # "Other" shows the typed name
        self.assertEqual([t['type'] for t in data['by_type']][0], 'Typhoon')   # biggest first

    def test_without_a_range_the_last_twelve_months_are_returned(self):
        data = self.get().json()
        self.assertEqual(len(data['months']), 12)
        self.assertEqual(data['months'][-1]['month'], date.today().strftime('%Y-%m'))

    def test_bad_ranges_are_refused(self):
        self.assertEqual(self.get(**{'from': '2026-05', 'to': '2026-01'}).status_code, 400)
        self.assertEqual(self.get(**{'from': 'January', 'to': '2026-01'}).status_code, 400)
        self.assertEqual(self.get(**{'from': '2020-01', 'to': '2026-01'}).status_code, 400)     # more than 36 months
        self.assertEqual(self.get(**{'from': '2026-13', 'to': '2026-14'}).status_code, 400)

    def test_a_farmer_account_cannot_read_it(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.get().status_code, 403)
