"""Editing a crop record never changes its farmer (the Edit Crop form shows the farmer but cannot change it)."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(970001)


def farmer(first):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Locked', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


class CropFarmerLockedTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='cf-admin', password='pw', role='ADMIN', email='cf@x.test')
        cls.owner, cls.other = farmer('Owner'), farmer('Other')
        parcel = FarmParcel.objects.create(farmer=cls.owner, parcel_number='L', area_hectares='3.00', land_ownership='Owner', barangay='Alaska')
        cls.crop = CropMonitoringRecord.objects.create(
            farmer=cls.owner, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_sent_farmer_is_ignored_and_the_rest_of_the_edit_is_saved(self):
        r = self.client.patch(f'/api/production/monitoring/{self.crop.id}/', {'farmer': self.other.id, 'variety_used': 'Edited'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.crop.refresh_from_db()
        self.assertEqual((self.crop.farmer_id, self.crop.variety_used), (self.owner.id, 'Edited'))
