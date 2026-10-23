"""Purging a parcel that was sold or transferred: POST /api/farmers/parcels/<id>/purge/ and GET /api/farmers/parcels/purged/."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APITestCase

from production.models import CropMonitoringRecord, CropType

from .models import FarmParcel, Farmer
from .test_parcel_bulk import parcel as bulk_parcel
from .test_parcel_bulk import url as bulk_url

NO_1 = '01-33-02-005-001-02-003'
_RSBSA = itertools.count(950001)


def make_farmer(first='Pam'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Purgetest', gender='Female',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class ParcelPurgeTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='pg-adm', password='pw', role='ADMIN', email='pga@x.test')
        cls.citizen = User.objects.create_user(username='pg-cit', password='pw', role='CITIZEN', email='pgc@x.test')
        cls.farmer = make_farmer()
        cls.rice = CropType.objects.create(name='Purge Rice', days_to_harvest=110)
        cls.corn = CropType.objects.create(name='Purge Corn', days_to_harvest=90)

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.parcel = FarmParcel.objects.create(
            farmer=self.farmer, parcel_number=NO_1, area_hectares='5.00', land_ownership='Owner', barangay='Alaska')

    def purge(self, body=None, parcel=None):
        return self.client.post(f'/api/farmers/parcels/{(parcel or self.parcel).id}/purge/', body if body is not None else {'reason': 'Sold'}, format='json')

    def record(self, crop, status='Planted', parcel=None, area='1.00'):
        record = CropMonitoringRecord.objects.create(
            farmer=self.farmer, crop_type=crop, farm_parcel=parcel or self.parcel, farm_location_barangay='Alaska', land_status='Owner',
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha=area, variety_used=f'V{crop.id}{status}')
        CropMonitoringRecord.objects.filter(pk=record.pk).update(status=status)
        return record

    # --- access and input
    def test_only_staff_can_purge_or_list(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.purge().status_code, 403)
        self.assertEqual(self.client.get('/api/farmers/parcels/purged/').status_code, 403)

    def test_a_missing_parcel_is_a_404(self):
        self.assertEqual(self.client.post('/api/farmers/parcels/999999/purge/', {'reason': 'Sold'}, format='json').status_code, 404)

    def test_a_reason_is_required_and_must_be_sold_or_transferred(self):
        self.assertEqual(self.purge({}).status_code, 400)
        self.assertEqual(self.purge({'reason': 'Lost'}).status_code, 400)
        self.assertEqual(FarmParcel.objects.filter(pk=self.parcel.pk).count(), 1)

    def test_the_date_cannot_be_in_the_future_or_unreadable(self):
        future = (timezone.localdate() + timedelta(days=2)).isoformat()
        self.assertIn('future', self.purge({'reason': 'Sold', 'date': future}).json()['date'])
        self.assertEqual(self.purge({'reason': 'Sold', 'date': 'last week'}).status_code, 400)
        self.assertEqual(self.purge({'reason': 'Sold', 'note': 'x' * 501}).status_code, 400)

    # --- what a purge does
    def test_a_purge_records_why_when_and_by_whom_and_the_date_defaults_to_today(self):
        response = self.purge({'reason': 'Transferred', 'date': '2026-09-01', 'note': '  Given to his son  '})
        self.assertEqual(response.status_code, 200, response.content)
        saved = FarmParcel.all_objects.get(pk=self.parcel.pk)
        self.assertEqual((saved.purge_reason, str(saved.purge_date), saved.purge_note, saved.purged_by_id), ('Transferred', '2026-09-01', 'Given to his son', self.admin.id))
        self.assertIsNotNone(saved.purged_at)
        other = FarmParcel.objects.create(farmer=self.farmer, area_hectares='1', land_ownership='Owner', barangay='Alaska')
        self.assertEqual(self.purge({'reason': 'Sold'}, other).status_code, 200)
        self.assertEqual(FarmParcel.all_objects.get(pk=other.pk).purge_date, timezone.localdate())

    def test_a_purged_parcel_leaves_every_list_and_cannot_be_used_again(self):
        self.assertEqual(self.purge().status_code, 200)
        self.assertEqual(FarmParcel.objects.filter(pk=self.parcel.pk).count(), 0)
        directory = self.client.get('/api/farmers/parcels/directory/', {'farmer': self.farmer.id}).json()
        self.assertEqual(directory['count'], 0)
        self.assertEqual(self.client.get(f'/api/farmers/{self.farmer.id}/parcels/').json(), [])
        self.assertEqual(self.client.get(f'/api/farmers/{self.farmer.id}/').json()['farm_parcels'], [])
        self.assertEqual(self.purge().status_code, 404)
        self.assertEqual(self.client.patch(f'/api/farmers/parcels/{self.parcel.id}/', {'barangay': 'Basca'}, format='json').status_code, 404)
        crop = {'crop_name': 'Palay (Rice)', 'crop_name_other': '', 'area_hectares': '1', 'is_main_crop': False, 'variety_used': '',
                'seed_source': 'Certified Seed', 'seeds_unit': 'kg', 'has_pcic_insurance': False}
        self.assertEqual(self.client.post(f'/api/farmers/parcels/{self.parcel.id}/crops/', crop, format='json').status_code, 404)

    def test_the_parcel_number_can_be_used_again_after_a_purge(self):
        self.assertEqual(self.purge().status_code, 200)
        response = self.client.post(bulk_url(self.farmer), [bulk_parcel(NO_1)], format='json')
        self.assertEqual(response.status_code, 201, response.content)

    # --- crops still growing block it
    def test_crops_still_growing_block_the_purge_and_the_message_names_them(self):
        self.record(self.rice)
        self.record(self.corn, status='Near Harvest')
        refused = self.purge()
        self.assertEqual(refused.status_code, 400)
        message = refused.json()['detail']
        self.assertIn('2 crop records (Purge Corn, Purge Rice) are still growing', message)
        self.assertEqual(FarmParcel.objects.filter(pk=self.parcel.pk).count(), 1)

    def test_finished_records_do_not_block_and_are_hidden_from_crop_monitoring(self):
        self.record(self.rice, status='Harvested')
        self.record(self.corn, status='Total Loss')
        elsewhere = FarmParcel.objects.create(farmer=self.farmer, area_hectares='2', land_ownership='Owner', barangay='Alaska')
        kept = self.record(self.rice, status='Harvested', parcel=elsewhere)
        no_parcel = CropMonitoringRecord.objects.create(
            farmer=self.farmer, crop_type=self.corn, farm_location_barangay='Alaska', land_status='Owner', season='Wet', year=2026,
            date_planted=date(2026, 5, 1), area_planted_ha='1.00')
        self.assertEqual(self.purge().status_code, 200)
        listed = {r['id'] for r in self.client.get('/api/production/monitoring/', {'farmer': self.farmer.id}).json()}
        self.assertEqual(listed, {kept.id, no_parcel.id})

    def test_a_new_crop_record_cannot_be_started_on_a_purged_parcel(self):
        self.assertEqual(self.purge().status_code, 200)
        body = {'farmer': self.farmer.id, 'crop_type': self.rice.id, 'farm_parcel': self.parcel.id, 'farm_location_barangay': 'Alaska',
                'land_status': 'Owner', 'season': 'Wet', 'year': 2026, 'date_planted': '2026-05-02', 'area_planted_ha': '1.00'}
        response = self.client.post('/api/production/monitoring/', body, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertIn('farm_parcel', response.json())

    # --- the Purged Parcels table
    def test_the_purged_table_lists_newest_first_with_the_reason_and_who_and_can_be_searched(self):
        self.record(self.rice, status='Harvested')
        second = FarmParcel.objects.create(
            farmer=make_farmer('Quin'), parcel_number='01-33-02-006-002-03-004', area_hectares='2.5', land_ownership='Owner', barangay='Basca')
        self.assertEqual(self.purge({'reason': 'Sold', 'note': 'To a neighbour'}).status_code, 200)
        self.assertEqual(self.purge({'reason': 'Transferred'}, second).status_code, 200)
        rows = self.client.get('/api/farmers/parcels/purged/').json()['results']
        self.assertEqual([r['id'] for r in rows], [second.id, self.parcel.id])
        first = rows[1]
        self.assertEqual((first['farmer_name'], first['purge_reason'], first['purge_note'], first['record_count'], first['area_hectares']),
                         ('Pam Purgetest', 'Sold', 'To a neighbour', 1, '5.00'))
        self.assertEqual(first['rsbsa_number'], self.farmer.rsbsa_number)
        self.assertTrue(first['purged_by_name'])
        by_name = self.client.get('/api/farmers/parcels/purged/', {'search': 'Quin'}).json()['results']
        self.assertEqual([r['id'] for r in by_name], [second.id])
        by_number = self.client.get('/api/farmers/parcels/purged/', {'search': NO_1}).json()['results']
        self.assertEqual([r['id'] for r in by_number], [self.parcel.id])

    def test_a_parcel_in_use_is_not_in_the_purged_table(self):
        self.assertEqual(self.client.get('/api/farmers/parcels/purged/').json()['count'], 0)
