"""A crop that is already harvested, or a total loss, cannot be marked Recovered: its disaster stays in the history only."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from accounts.models import UserLinkedRecord
from farmers.models import Farmer
from production.models import CropDisasterReport, CropMonitoringRecord, CropType

_RSBSA = itertools.count(910501)


def make_record(status='Planted'):
    farmer = Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Rule', last_name='Crop', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
    record = CropMonitoringRecord.objects.create(
        farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
        season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')
    if status != 'Planted':
        CropMonitoringRecord.objects.filter(pk=record.pk).update(status=status)
    return farmer, record


def make_disaster(record, admin, **over):
    return CropDisasterReport.objects.create(monitoring_record=record, disaster_type='Flood', date_of_occurrence=date(2026, 6, 1),
                                             area_affected_ha='0.50', estimated_damage='x', reported_by=admin, **over)


class CropRecoveryRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='rr-admin', password='pw', role='ADMIN', email='rr@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def resolve(self, disaster, note='it dried'):
        return self.client.post(f'/api/production/disasters/{disaster.id}/resolve/', {'recovery_note': note}, format='json')

    def log_row(self, disaster):
        data = self.client.get('/api/production/disaster-logs/', {'page': 1}).json()
        rows = data['results'] if isinstance(data, dict) else data
        return next(r for r in rows if r['id'] == disaster.id)

    def test_a_disaster_on_a_growing_crop_can_be_recovered(self):
        _, record = make_record('Planted')
        disaster = make_disaster(record, self.admin)
        row = self.log_row(disaster)
        self.assertTrue(row['can_recover'])
        self.assertIsNone(row['recovery_block_reason'])
        self.assertEqual(row['farmer_id'], record.farmer_id)   # the person the screen groups by
        self.assertEqual(self.resolve(disaster).status_code, 200)

    def test_a_harvested_crop_cannot_be_recovered(self):
        _, record = make_record('Harvested')
        disaster = make_disaster(record, self.admin)
        row = self.log_row(disaster)
        self.assertFalse(row['can_recover'])
        self.assertIn('harvested', row['recovery_block_reason'].lower())
        response = self.resolve(disaster)
        self.assertEqual(response.status_code, 400)
        self.assertIn('harvested', response.json()['detail'].lower())
        disaster.refresh_from_db()
        self.assertEqual(disaster.status, 'Active')

    def test_a_total_loss_crop_cannot_be_recovered(self):
        _, record = make_record('Total Loss')
        disaster = make_disaster(record, self.admin)
        self.assertFalse(self.log_row(disaster)['can_recover'])
        self.assertEqual(self.resolve(disaster).status_code, 400)

    def test_a_total_loss_disaster_cannot_be_recovered(self):
        _, record = make_record('Planted')
        disaster = make_disaster(record, self.admin, is_total_loss=True)
        row = self.log_row(disaster)
        self.assertFalse(row['can_recover'])
        self.assertIn('total loss', row['recovery_block_reason'].lower())

    def test_a_recovered_disaster_is_not_recoverable_again_and_stays_in_the_history(self):
        _, record = make_record('Planted')
        disaster = make_disaster(record, self.admin)
        self.assertEqual(self.resolve(disaster).status_code, 200)
        row = self.log_row(disaster)
        self.assertFalse(row['can_recover'])
        self.assertEqual(row['status'], 'Recovered')

    def test_the_farmer_themselves_is_held_to_the_same_rule(self):
        farmer, record = make_record('Harvested')
        user = get_user_model().objects.create_user(username='rr-farmer', password='pw', role='CITIZEN', email='rrf@x.test')
        UserLinkedRecord.objects.create(user=user, record_type='FARMER', record_id=farmer.id, is_active=True)
        disaster = make_disaster(record, self.admin)
        self.client.force_authenticate(user)
        self.assertEqual(self.resolve(disaster).status_code, 400)

    def test_the_activity_panel_feed_carries_the_flag(self):
        _, record = make_record('Planted')
        disaster = make_disaster(record, self.admin)
        feed = self.client.get(f'/api/production/monitoring/{record.id}/suggestions/').json()['disaster_response']
        self.assertEqual([(d['disaster_id'], d['can_recover']) for d in feed], [(disaster.id, True)])
