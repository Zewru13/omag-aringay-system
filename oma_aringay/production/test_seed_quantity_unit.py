"""The unit of a crop's seed quantity is any unit name (the Edit Crop form lists the ones of Harvest Unit Settings), not a fixed four."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel, Farmer
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(960001)


class SeedQuantityUnitTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='su-admin', password='pw', role='ADMIN', email='su@x.test')
        owner = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Seed', last_name='Unit', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        parcel = FarmParcel.objects.create(farmer=owner, parcel_number='S', area_hectares='3.00', land_ownership='Owner', barangay='Alaska')
        cls.crop = CropMonitoringRecord.objects.create(
            farmer=owner, farm_parcel=parcel, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha='1.00')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def test_a_unit_from_settings_is_saved(self):
        r = self.client.patch(f'/api/production/monitoring/{self.crop.id}/', {'quantity_of_seeds': '12', 'seed_quantity_unit': 'sacks'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.crop.refresh_from_db()
        self.assertEqual(self.crop.seed_quantity_unit, 'sacks')

    def test_a_settings_unit_of_the_longest_length_is_saved(self):
        # Harvest Unit Settings takes names up to 40 characters, so the crop must hold the same
        r = self.client.patch(f'/api/production/monitoring/{self.crop.id}/', {'seed_quantity_unit': 'x' * 40}, format='json')
        self.assertEqual(r.status_code, 200, r.content)

    def test_a_unit_longer_than_a_settings_unit_is_refused(self):
        r = self.client.patch(f'/api/production/monitoring/{self.crop.id}/', {'seed_quantity_unit': 'x' * 41}, format='json')
        self.assertEqual(r.status_code, 400, r.content)
