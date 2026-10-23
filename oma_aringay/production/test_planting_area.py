"""The plantings growing now (Planted, Near Harvest) on one parcel cannot together be more than the parcel's area."""
from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import FarmParcel
from production.models import CropMonitoringRecord, CropType

from .test_crop_record_duplicates import make_farmer, make_record, payload

URL = '/api/production/monitoring/'
BULK_URL = '/api/production/monitoring/bulk/'


class PlantingAreaTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='area-prod', password='pw', role='ADMIN', email='areaprod@x.test')
        cls.rice = CropType.objects.create(name='Area Rice', days_to_harvest=110)
        cls.corn = CropType.objects.create(name='Area Corn', days_to_harvest=90)
        cls.onion = CropType.objects.create(name='Area Onion', days_to_harvest=70)
        cls.farmer = make_farmer('Dina')
        cls.parcel = FarmParcel.objects.create(farmer=cls.farmer, area_hectares='5.00', land_ownership='Owner', barangay='Alaska')

    def setUp(self):
        self.client.force_authenticate(self.admin)

    def post(self, crop, area, **over):
        return self.client.post(URL, payload(self.farmer, crop, self.parcel, area_planted_ha=area, **over), format='json')

    def test_a_planting_bigger_than_its_parcel_is_refused(self):
        response = self.post(self.rice, '5.50')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['area_planted_ha'], ['This planting (5.5 ha) is bigger than its parcel (5 ha).'])

    def test_plantings_still_growing_use_up_the_parcel(self):
        make_record(self.farmer, self.rice, self.parcel, area_planted_ha='3.00')
        response = self.post(self.corn, '2.50')
        self.assertEqual(response.status_code, 400)
        self.assertIn('Only 2 ha of this 5 ha parcel is free', response.json()['area_planted_ha'][0])
        self.assertEqual(self.post(self.corn, '2.00').status_code, 201)

    def test_near_harvest_plantings_still_count(self):
        make_record(self.farmer, self.rice, self.parcel, area_planted_ha='4.00', status='Near Harvest')
        self.assertEqual(self.post(self.corn, '1.50').status_code, 400)

    def test_harvested_and_total_loss_plantings_no_longer_count(self):
        make_record(self.farmer, self.rice, self.parcel, area_planted_ha='3.00', status='Harvested')
        make_record(self.farmer, self.corn, self.parcel, area_planted_ha='2.00', status='Total Loss')
        self.assertEqual(self.post(self.onion, '5.00').status_code, 201)

    def test_another_parcel_is_not_counted(self):
        other = FarmParcel.objects.create(farmer=self.farmer, area_hectares='5.00', land_ownership='Owner', barangay='Alaska')
        make_record(self.farmer, self.rice, other, area_planted_ha='5.00')
        self.assertEqual(self.post(self.corn, '5.00').status_code, 201)

    def test_editing_a_record_does_not_count_it_against_itself(self):
        record = make_record(self.farmer, self.rice, self.parcel, area_planted_ha='3.00')
        make_record(self.farmer, self.corn, self.parcel, area_planted_ha='1.50')
        ok = self.client.patch(f'{URL}{record.id}/', {'area_planted_ha': '3.50'}, format='json')
        self.assertEqual(ok.status_code, 200, ok.content)
        too_big = self.client.patch(f'{URL}{record.id}/', {'area_planted_ha': '3.60'}, format='json')
        self.assertEqual(too_big.status_code, 400)

    def test_editing_something_else_on_a_record_that_was_already_over_is_still_allowed(self):
        record = make_record(self.farmer, self.rice, self.parcel, area_planted_ha='4.00')
        # saved before this rule existed: the parcel is now over-full
        make_record(self.farmer, self.corn, self.parcel, area_planted_ha='3.00')
        response = self.client.patch(f'{URL}{record.id}/', {'variety_used': 'Rc 160'}, format='json')
        self.assertEqual(response.status_code, 200, response.content)

    def test_bulk_counts_the_rows_of_the_same_form_together_and_saves_nothing(self):
        before = CropMonitoringRecord.objects.count()
        rows = [payload(self.farmer, self.rice, self.parcel, area_planted_ha='3.00'),
                payload(self.farmer, self.corn, self.parcel, area_planted_ha='2.50')]
        response = self.client.post(BULK_URL, rows, format='json')
        self.assertEqual(response.status_code, 400)
        errors = response.json()['errors']
        self.assertEqual(errors[0], {})
        self.assertIn('Only 2 ha of this 5 ha parcel is free', errors[1]['area_planted_ha'][0])
        self.assertEqual(CropMonitoringRecord.objects.count(), before)

    def test_bulk_accepts_rows_that_fit_together(self):
        rows = [payload(self.farmer, self.rice, self.parcel, area_planted_ha='3.00'),
                payload(self.farmer, self.corn, self.parcel, area_planted_ha='2.00')]
        self.assertEqual(self.client.post(BULK_URL, rows, format='json').status_code, 201)

    def test_bulk_counts_records_already_growing_on_the_parcel(self):
        make_record(self.farmer, self.onion, self.parcel, area_planted_ha='2.00')
        rows = [payload(self.farmer, self.rice, self.parcel, area_planted_ha='2.00'),
                payload(self.farmer, self.corn, self.parcel, area_planted_ha='1.50')]
        response = self.client.post(BULK_URL, rows, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()['errors'][0], {})
        self.assertIn('area_planted_ha', response.json()['errors'][1])
