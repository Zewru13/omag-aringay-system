"""A harvest can be recorded in any unit its crop allows (Crop Options > allowed units: "Cavan (50kg)", "Sack", "Metric Ton",
...), as well as the standard unit codes. Rice's default unit is "Cavan (50kg)", so refusing it made the default fail."""
import itertools
from datetime import date, timedelta

from django.contrib.auth import get_user_model
from rest_framework.test import APITestCase

from farmers.models import Farmer
from production.models import CropMonitoringRecord, CropType, HarvestRecord

URL = '/api/production/create/'
_RSBSA = itertools.count(940001)


class HarvestUnitTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = get_user_model().objects.create_user(username='adm', password='pw', role='ADMIN', email='adm@x.test')
        cls.farmer = Farmer.objects.create(
            rsbsa_number='01-033-02-019-%06d' % next(_RSBSA), first_name='Ana', last_name='Units', gender='Female',
            birthdate=date(1985, 1, 1), barangay='Alaska', civil_status='Single')
        cls.rice, _ = CropType.objects.get_or_create(name='Units Test Rice', defaults=dict(days_to_harvest=100))
        cls.rice.days_to_harvest = 100
        cls.rice.allowed_units = ['Cavan (50kg)', 'kg', 'Metric Ton']
        cls.rice.save()

    def setUp(self):
        self.client.force_authenticate(self.admin)
        self.crop = CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.rice, season='Wet',
            year=2026, date_planted=date.today() - timedelta(days=99), area_planted_ha='1.00', status='Planted')

    def _post(self, unit):
        # Each post is its own crop: all of one crop's harvests together cannot cover more than its planted area.
        crop = CropMonitoringRecord.objects.create(
            farmer=self.farmer, farm_location_barangay='Alaska', land_status='Owner', crop_type=self.rice, season='Wet',
            year=2026, date_planted=date.today() - timedelta(days=99), area_planted_ha='1.00', status='Planted')
        body = {'monitoring_record': crop.id, 'harvest_start_date': str(date.today()), 'season': 'Wet', 'year': 2026,
                'crop_name': 'Rice', 'area_harvested_hectares': '1.00', 'volume_kg': '100'}
        if unit is not None:
            body['unit_of_measure'] = unit
        return self.client.post(URL, body, format='json')

    def test_the_crops_default_unit_is_accepted_and_kept_as_written(self):
        r = self._post('Cavan (50kg)')
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(HarvestRecord.objects.get(pk=r.json()['id']).unit_of_measure, 'Cavan (50kg)')

    def test_every_unit_the_crop_allows_is_accepted(self):
        for unit in ('kg', 'Metric Ton'):
            self.assertEqual(self._post(unit).status_code, 201, unit)

    def test_the_standard_unit_codes_are_still_accepted(self):
        self.assertEqual(self._post('bags').status_code, 201)
        self.assertEqual(self._post('cavan').status_code, 201)

    def test_no_unit_still_defaults_to_kg(self):
        r = self._post(None)
        self.assertEqual(r.status_code, 201, r.content)
        self.assertEqual(HarvestRecord.objects.get(pk=r.json()['id']).unit_of_measure, 'kg')

    def test_a_unit_the_crop_does_not_allow_is_refused(self):
        r = self._post('Bundle')          # another crop's unit, not rice's
        self.assertEqual(r.status_code, 400)
        self.assertIn('unit_of_measure', r.json())

    def test_an_invented_unit_is_refused(self):
        self.assertEqual(self._post('Barrel').status_code, 400)

    def test_a_harvest_can_be_edited_to_another_allowed_unit(self):
        harvest_id = self._post('kg').json()['id']
        r = self.client.patch(f'/api/production/{harvest_id}/', {'unit_of_measure': 'Metric Ton'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(HarvestRecord.objects.get(pk=harvest_id).unit_of_measure, 'Metric Ton')

    def test_editing_other_fields_keeps_a_label_unit(self):
        harvest_id = self._post('Cavan (50kg)').json()['id']
        r = self.client.patch(f'/api/production/{harvest_id}/', {'remarks': 'checked'}, format='json')
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(HarvestRecord.objects.get(pk=harvest_id).unit_of_measure, 'Cavan (50kg)')
