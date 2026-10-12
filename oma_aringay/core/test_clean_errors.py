"""Requests that cannot be carried out answer with a clear 4xx, never a server error (which also shows nothing useful)."""
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from associations.models import FarmersOrganization, FarmersOrganizationEquipment, FarmersOrganizationEquipmentLoan
from farmers.models import Farmer
from production.models import BarangayCropSummary, CropMonitoringRecord, CropType


def make_farmer(n):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % (960000 + n), first_name='Clean', last_name='Error', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class CleanErrorTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='ce-admin', password='pw', role='ADMIN', email='ce@x.test')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_deleting_a_farmer_who_still_has_equipment_loans_is_a_clear_conflict(self):
        farmer = make_farmer(1)
        org = FarmersOrganization.objects.create(
            name='Clean Org', barangay='Alaska', registration_number='CLEAN-001', date_organized=date(2020, 1, 1),
            date_registered=date(2020, 2, 1), registration_agency='SEC', contact_person='Pat', contact_number='09170000000')
        line = FarmersOrganizationEquipment.objects.create(organization=org, equipment_name='Generator', quantity=2, condition='Good')
        FarmersOrganizationEquipmentLoan.objects.create(equipment=line, member=farmer, quantity=1, status='REQUESTED', origin='MEMBER')
        response = self.client.delete(f'/api/farmers/{farmer.id}/delete/')
        self.assertEqual(response.status_code, 409, response.content)
        self.assertIn('cannot be deleted', response.json()['detail'])
        self.assertTrue(Farmer.objects.filter(pk=farmer.id).exists())

    def test_deleting_a_farmer_with_nothing_attached_still_works(self):
        farmer = make_farmer(2)
        self.assertEqual(self.client.delete(f'/api/farmers/{farmer.id}/delete/').status_code, 204)

    def test_linking_records_to_a_summary_that_does_not_exist_is_a_404(self):
        response = self.client.post('/api/production/barangay-crop-summary/999999/link-records/', {'monitoring_record_ids': [1]}, format='json')
        self.assertEqual(response.status_code, 404)

    def test_linking_records_needs_a_list_of_numbers(self):
        summary = BarangayCropSummary.objects.create(
            barangay='Alaska', crop_name='Rice', season='Wet', year=2026, area_planted_ha='1.00')
        url = f'/api/production/barangay-crop-summary/{summary.id}/link-records/'
        for bad in ('abc', {'a': 1}, ['x'], [1, None], 7):
            response = self.client.post(url, {'monitoring_record_ids': bad}, format='json')
            self.assertEqual(response.status_code, 400, bad)
        self.assertEqual(self.client.post(url, {'monitoring_record_ids': []}, format='json').status_code, 200)

    def test_linking_real_records_still_works(self):
        farmer = make_farmer(3)
        record = CropMonitoringRecord.objects.create(
            farmer=farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')
        summary = BarangayCropSummary.objects.create(
            barangay='Alaska', crop_name='Rice', season='Wet', year=2026, area_planted_ha='1.00')
        response = self.client.post(f'/api/production/barangay-crop-summary/{summary.id}/link-records/',
                                    {'monitoring_record_ids': [record.id]}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(summary.linked_monitoring_records.count(), 1)
