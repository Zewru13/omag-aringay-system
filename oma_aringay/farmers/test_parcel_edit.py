"""PATCH /api/farmers/parcels/<id>/: staff edit a parcel's own details; the area and schedule must still hold its crops and plantings."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from production.models import CropMonitoringRecord, CropType

from .models import FarmCrop, FarmParcel, Farmer, ParcelClassification

NO_1 = '01-33-02-005-001-02-003'
NO_2 = '01-33-02-005-001-02-004'
_RSBSA = itertools.count(940001)


def make_farmer(first='Edi'):
    return Farmer.objects.create(
        rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name=first, last_name='Parceltest', gender='Male',
        birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')


def url(parcel):
    return f'/api/farmers/parcels/{parcel.id}/'


class ParcelEditTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        User = get_user_model()
        cls.admin = User.objects.create_user(username='pe-adm', password='pw', role='ADMIN', email='pea@x.test')
        cls.citizen = User.objects.create_user(username='pe-cit', password='pw', role='CITIZEN', email='pec@x.test')
        cls.farmer = make_farmer()
        cls.rice = CropType.objects.create(name='Edit Rice', days_to_harvest=110)
        ParcelClassification.objects.get_or_create(name='Organic Farm')

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.parcel = FarmParcel.objects.create(
            farmer=self.farmer, parcel_number=NO_1, area_hectares='5.00', land_ownership='Owner', barangay='Alaska')

    def patch(self, body, parcel=None):
        return self.client.patch(url(parcel or self.parcel), body, format='json')

    def grow(self, area, status='Planted'):
        record = CropMonitoringRecord.objects.create(
            farmer=self.farmer, crop_type=self.rice, farm_parcel=self.parcel, farm_location_barangay='Alaska', land_status='Owner',
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha=area, variety_used=f'V{area}')
        CropMonitoringRecord.objects.filter(pk=record.pk).update(status=status)

    # --- access
    def test_only_staff_can_read_or_edit(self):
        self.client.force_authenticate(self.citizen)
        self.assertEqual(self.client.get(url(self.parcel)).status_code, 403)
        self.assertEqual(self.patch({'barangay': 'Basca'}).status_code, 403)

    def test_a_missing_parcel_is_a_404_and_the_parcel_cannot_be_deleted_here(self):
        self.assertEqual(self.client.patch('/api/farmers/parcels/999999/', {}, format='json').status_code, 404)
        self.assertEqual(self.client.delete(url(self.parcel)).status_code, 405)

    # --- the details
    def test_the_details_can_be_changed(self):
        response = self.patch({
            'parcel_number': NO_2, 'barangay': 'Basca', 'area_hectares': '6.5', 'land_ownership': 'Tenant', 'land_owner_name': 'Juan',
            'farm_type': 'Irrigated', 'cropping_schedule': 'Double Cropping', 'classifications': ['organic farm']})
        self.assertEqual(response.status_code, 200, response.content)
        self.parcel.refresh_from_db()
        self.assertEqual((self.parcel.parcel_number, self.parcel.barangay, str(self.parcel.area_hectares), self.parcel.land_owner_name),
                         (NO_2, 'Basca', '6.50', 'Juan'))
        self.assertEqual(self.parcel.classifications, ['Organic Farm'])
        self.assertEqual(self.parcel.cropping_schedule, 'Double Cropping')

    def test_the_parcel_cannot_be_moved_to_another_farmer(self):
        other = make_farmer('Other')
        self.assertEqual(self.patch({'farmer': other.id, 'barangay': 'Basca'}).status_code, 200)
        self.parcel.refresh_from_db()
        self.assertEqual(self.parcel.farmer_id, self.farmer.id)

    def test_a_bad_area_or_tax_declaration_is_refused(self):
        self.assertEqual(self.patch({'area_hectares': '0'}).status_code, 400)
        self.assertEqual(self.patch({'tax_declaration_number': '01-002'}).status_code, 400)

    def test_the_parcel_number_stays_unique_for_the_farmer(self):
        FarmParcel.objects.create(farmer=self.farmer, parcel_number=NO_2, area_hectares='1', land_ownership='Owner', barangay='Alaska')
        refused = self.patch({'parcel_number': NO_2})
        self.assertEqual(refused.status_code, 400)
        self.assertEqual(refused.json()['parcel_number'], [f'This farmer already has parcel {NO_2}.'])
        # keeping its own number is fine, and another farmer may use the same number
        self.assertEqual(self.patch({'parcel_number': NO_1, 'barangay': 'Basca'}).status_code, 200)
        elsewhere = FarmParcel.objects.create(farmer=make_farmer('Else'), parcel_number='', area_hectares='1', land_ownership='Owner', barangay='Alaska')
        self.assertEqual(self.patch({'parcel_number': NO_1}, elsewhere).status_code, 200)

    # --- area and schedule must still hold what is on the parcel
    def test_the_area_cannot_drop_below_the_biggest_crop(self):
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Palay (Rice)', area_hectares='3')
        refused = self.patch({'area_hectares': '2.5'})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('biggest crop (3 ha)', refused.json()['area_hectares'][0])
        self.assertEqual(self.patch({'area_hectares': '3'}).status_code, 200)

    def test_the_area_cannot_drop_below_the_declared_crops_together(self):
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Palay (Rice)', area_hectares='3')
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Corn (Mais)', area_hectares='2')
        refused = self.patch({'area_hectares': '4'})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('come to 5 ha, more than the 4 ha allowed', refused.json()['area_hectares'][0])

    def test_a_double_cropping_parcel_can_hold_more_crops_than_its_area(self):
        self.parcel.cropping_schedule = 'Double Cropping'
        self.parcel.save()
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Palay (Rice)', area_hectares='5')
        FarmCrop.objects.create(farm_parcel=self.parcel, crop_name='Corn (Mais)', area_hectares='4')
        self.assertEqual(self.patch({'barangay': 'Basca'}).status_code, 200)
        refused = self.patch({'cropping_schedule': 'Single Cropping'})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('cropping_schedule', refused.json())

    def test_the_area_cannot_drop_below_what_is_growing_now(self):
        self.grow('3.00')
        self.grow('1.50')
        refused = self.patch({'area_hectares': '4'})
        self.assertEqual(refused.status_code, 400)
        self.assertIn('4.5 ha is growing on this parcel now, more than 4 ha', refused.json()['area_hectares'][0])
        self.assertEqual(self.patch({'area_hectares': '4.5'}).status_code, 200)

    def test_harvested_plantings_do_not_hold_the_area(self):
        self.grow('3.00', status='Harvested')
        self.assertEqual(self.patch({'area_hectares': '1'}).status_code, 200)

    def test_a_parcel_that_is_already_over_can_still_have_other_details_edited(self):
        self.grow('4.00')
        self.grow('3.00')
        self.assertEqual(self.patch({'barangay': 'Basca', 'area_hectares': '5.00'}).status_code, 200)
