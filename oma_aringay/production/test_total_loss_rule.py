"""A crop disaster can be a Total Loss only when the whole planted area is affected."""
import itertools
from datetime import date

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType

_RSBSA = itertools.count(930001)


def _report(area, total_loss):
    return {'disaster_type': 'Typhoon', 'date_of_occurrence': '2026-09-01', 'area_affected_ha': area,
            'is_total_loss': total_loss}


class CropTotalLossRuleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username='tl-staff', password='pw', role='ADMIN', email='tl@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Total', last_name='Loss', gender='Male',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')

    def setUp(self):
        self.client.force_authenticate(self.staff)

    def new_crop(self, area='2.00'):
        return CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=CropType.objects.order_by('id').first(),
            season='Wet', year=2026, date_planted=date(2026, 5, 1), area_planted_ha=area, status='Planted')

    def post(self, crop, area, total_loss):
        return self.client.post(f'/api/production/monitoring/{crop.id}/disasters/', _report(area, total_loss), format='json')

    def test_total_loss_with_the_whole_area_is_accepted(self):
        response = self.post(self.new_crop(), 2.0, True)
        self.assertEqual(response.status_code, 201, response.content)

    def test_total_loss_with_less_than_the_whole_area_is_refused(self):
        crop = self.new_crop()
        response = self.post(crop, 1.99, True)
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn('is_total_loss', response.json())
        crop.refresh_from_db()
        self.assertNotEqual(crop.status, 'Total Loss')

    def test_partial_loss_is_unchanged(self):
        response = self.post(self.new_crop(), 1.0, False)
        self.assertEqual(response.status_code, 201, response.content)

    def test_total_loss_compares_decimals_not_strings(self):
        for area in ('2', '2.0', '2.0000', 2):
            response = self.post(self.new_crop(), area, True)
            self.assertEqual(response.status_code, 201, (area, response.content))
